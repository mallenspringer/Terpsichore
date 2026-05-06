export const NoiseSourceWGSL = `
struct NoiseUniforms {
    noiseType: u32,
    scale: f32,
    evolution: f32,
    octaves: u32,
    persistence: f32,
    seed: f32,
    brightness: f32,
    contrast: f32,
    aspectRatio: f32,
    _padding: vec3<f32>,
};

@group(0) @binding(0) var<uniform> ui: NoiseUniforms;

// --- HASHING ---
fn hash2(p: vec2<f32>) -> vec2<f32> {
    var p2 = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p2 + ui.seed) * 43758.5453123);
}

fn hash1(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(12.9898, 78.233)) + ui.seed) * 43758.5453);
}

// --- PERLIN NOISE ---
fn perlin(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(dot(hash2(i + vec2<f32>(0.0, 0.0)), f - vec2<f32>(0.0, 0.0)),
            dot(hash2(i + vec2<f32>(1.0, 0.0)), f - vec2<f32>(1.0, 0.0)), u.x),
        mix(dot(hash2(i + vec2<f32>(0.0, 1.0)), f - vec2<f32>(0.0, 1.0)),
            dot(hash2(i + vec2<f32>(1.0, 1.0)), f - vec2<f32>(1.0, 1.0)), u.x),
        u.y
    );
}

// --- WORLEY (CELLULAR) ---
fn worley(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    var minDist = 1.0;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let neighbor = vec2<f32>(f32(x), f32(y));
            let point = hash2(i + neighbor);
            let diff = neighbor + 0.5 + 0.5 * sin(ui.evolution + 6.2831 * point) - f;
            minDist = min(minDist, length(diff));
        }
    }
    return minDist;
}

// --- FBM (Fractal Brownian Motion) ---
fn fbm(p: vec2<f32>) -> f32 {
    var val = 0.0;
    var amp = 0.5;
    var pos = p;
    for (var i = 0u; i < ui.octaves; i++) {
        val += amp * perlin(pos);
        pos = pos * 2.0;
        amp = amp * ui.persistence;
    }
    return val;
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    // Normalize coordinates -1 to 1 based on screen size
    // We'll pass resolution if needed, but for now we use fragCoord
    // Wait, we need to know the resolution for aspect ratio correction
    // ui.aspectRatio should be passed
    
    // Convert fragCoord to UV
    // Note: fragCoord is in pixel space. We need a way to get 0-1.
    // Actually, we can pass resolution in uniforms.
    // Let's assume we use a 1080p target if not specified? No, let's use the aspect ratio.
    
    // We'll use a hack: the vertex shader is a full-screen triangle.
    // We can pass UVs from vertex to fragment.
    
    // Let's redo the vertex shader to pass UVs.
    return vec4<f32>(0.0); // Placeholder, will fix below
}
`;

export const NoiseSourceVertexWGSL = `
struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    var uv = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );
    var out: VertexOutput;
    out.pos = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
    out.uv = uv[vertexIndex];
    return out;
}
`;

export const NoiseSourceFragmentWGSL = `
struct NoiseUniforms {
    noiseType: f32,
    scale: f32,
    evolution: f32,
    octaves: f32,
    persistence: f32,
    seed: f32,
    brightness: f32,
    contrast: f32,
    aspectRatio: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
};

@group(0) @binding(0) var<uniform> ui: NoiseUniforms;

fn hash2(p: vec2<f32>) -> vec2<f32> {
    var p2 = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p2 + ui.seed) * 43758.5453123);
}

fn hash3(p: vec3<f32>) -> f32 {
    return fract(sin(dot(p, vec3<f32>(12.9898, 78.233, 45.164)) + ui.seed) * 43758.5453);
}

fn noise3d(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(hash3(i + vec3<f32>(0.0, 0.0, 0.0)), hash3(i + vec3<f32>(1.0, 0.0, 0.0)), u.x),
            mix(hash3(i + vec3<f32>(0.0, 1.0, 0.0)), hash3(i + vec3<f32>(1.0, 1.0, 0.0)), u.x), u.y),
        mix(mix(hash3(i + vec3<f32>(0.0, 0.0, 1.0)), hash3(i + vec3<f32>(1.0, 0.0, 1.0)), u.x),
            mix(hash3(i + vec3<f32>(0.0, 1.0, 1.0)), hash3(i + vec3<f32>(1.0, 1.0, 1.0)), u.x), u.y),
        u.z
    );
}

fn perlin(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(dot(hash2(i + vec2<f32>(0.0, 0.0)), f - vec2<f32>(0.0, 0.0)),
            dot(hash2(i + vec2<f32>(1.0, 0.0)), f - vec2<f32>(1.0, 0.0)), u.x),
        mix(dot(hash2(i + vec2<f32>(0.0, 1.0)), f - vec2<f32>(0.0, 1.0)),
            dot(hash2(i + vec2<f32>(1.0, 1.0)), f - vec2<f32>(1.0, 1.0)), u.x),
        u.y
    );
}

fn worley(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    var minDist = 1.0;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let neighbor = vec2<f32>(f32(x), f32(y));
            let h = hash2(i + neighbor);
            // Animate point position within the cell
            let offset = 0.5 + 0.4 * sin(ui.evolution + 6.2831 * h);
            let diff = neighbor + offset - f;
            minDist = min(minDist, length(diff));
        }
    }
    return minDist;
}

fn fbm(p: vec2<f32>) -> f32 {
    var val = 0.0;
    var amp = 0.5;
    var pos = p;
    let octs = u32(clamp(ui.octaves, 1.0, 8.0));
    for (var i = 0u; i < octs; i++) {
        // Use 3D noise where Z is evolution
        val += amp * (noise3d(vec3<f32>(pos, ui.evolution * 0.5)) * 2.0 - 1.0);
        pos = pos * 2.0;
        amp = amp * ui.persistence;
    }
    return val;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var p = (uv * 2.0 - 1.0);
    p.x *= ui.aspectRatio;
    p *= ui.scale;
    
    var n = 0.0;
    let nType = u32(ui.noiseType);
    if (nType == 0u) {
        n = fbm(p) * 0.5 + 0.5;
    } else if (nType == 1u) {
        n = worley(p);
    } else if (nType == 2u) {
        // White Noise (Snow)
        n = hash3(vec3<f32>(uv * 1000.0, ui.evolution));
    } else {
        n = perlin(p) * 0.5 + 0.5;
    }
    
    // Apply brightness/contrast
    n = (n - 0.5) * ui.contrast + 0.5 + ui.brightness;
    n = clamp(n, 0.0, 1.0);
    
    return vec4<f32>(vec3<f32>(n), 1.0);
}
`;
