
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

const NoiseCommonWGSL = `
struct NoiseUniforms {
    scale: f32,
    evolution: f32,
    octaves: f32,
    persistence: f32,
    seed: f32,
    brightness: f32,
    contrast: f32,
    time: f32,
    noiseType: u32,
    autoAnimate: u32,
    _pad: u32,
    aspectRatio: f32,
};

@group(0) @binding(0) var<uniform> ui: NoiseUniforms;

// --- HASHING ---
fn hash33(p: vec3<f32>) -> vec3<f32> {
    var p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
}

fn hash13(p: vec3<f32>) -> f32 {
    var p3 = fract(p * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Simple hash for white noise that works well with pixel coordinates
fn pixelHash(p: vec2<f32>, seed: f32) -> f32 {
    return fract(sin(dot(p + seed, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

// --- 3D GRADIENT NOISE ---
fn noise3d(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(dot(hash33(i + vec3<f32>(0.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 0.0, 0.0)),
                dot(hash33(i + vec3<f32>(1.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 0.0, 0.0)), u.x),
            mix(dot(hash33(i + vec3<f32>(0.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 1.0, 0.0)),
                dot(hash33(i + vec3<f32>(1.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 1.0, 0.0)), u.x), u.y),
        mix(mix(dot(hash33(i + vec3<f32>(0.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 0.0, 1.0)),
                dot(hash33(i + vec3<f32>(1.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 0.0, 1.0)), u.x),
            mix(dot(hash33(i + vec3<f32>(0.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 1.0, 1.0)),
                dot(hash33(i + vec3<f32>(1.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 1.0, 1.0)), u.x), u.y),
        u.z
    );
}

// --- SIMPLEX 3D ---
fn simplex3d(p: vec3<f32>) -> f32 {
    let C = vec2<f32>(1.0/6.0, 1.0/3.0);
    let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);

    var i  = floor(p + dot(p, C.yyy));
    let x0 = p - i + dot(i, C.xxx);

    let g = step(x0.yzx, x0.xyz);
    let l = 1.0 - g;
    let i1 = min(g.xyz, l.zxy);
    let i2 = max(g.xyz, l.zxy);

    let x1 = x0 - i1 + C.xxx;
    let x2 = x0 - i2 + C.yyy;
    let x3 = x0 - D.yyy;

    i = mod289_3(i);
    let p_res = permute3(permute3(permute3(
        i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0));

    let ns = 0.142857142857 * D.wyz - D.xzx;
    let j = p_res - 49.0 * floor(p_res * ns.z * ns.z);
    let x_ = floor(j * ns.z);
    let y_ = floor(j - 7.0 * x_);
    let x = x_ * ns.x + ns.yyyy;
    let y = y_ * ns.x + ns.yyyy;
    let h = 1.0 - abs(x) - abs(y);
    let b0 = vec4<f32>(x.xy, y.xy);
    let b1 = vec4<f32>(x.zw, y.zw);
    let s0 = floor(b0) * 2.0 + 1.0;
    let s1 = floor(b1) * 2.0 + 1.0;
    let sh = -step(h, vec4<f32>(0.0));
    let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    let a1 = b1.xzyw + s1.xzyw * sh.zzww;
    var p0 = vec3<f32>(a0.xy, h.x);
    var p1 = vec3<f32>(a0.zw, h.y);
    var p2 = vec3<f32>(a1.xy, h.z);
    var p3 = vec3<f32>(a1.zw, h.w);
    let norm = taylorInvSqrt3(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    let m = max(0.6 - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4<f32>(0.0));
    return 42.0 * dot(m * m * m * m, vec4<f32>(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

fn mod289_3(x: vec3<f32>) -> vec3<f32> { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute3(x: vec4<f32>) -> vec4<f32> { return ((x * 34.0) + 1.0) * x % 289.0; }
fn taylorInvSqrt3(r: vec4<f32>) -> vec4<f32> { return 1.79284291400159 - 0.85373472095314 * r; }

// --- WORLEY ---
fn worley3d(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    var minDist = 1.0;
    for (var z = -1; z <= 1; z++) {
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let neighbor = vec3<f32>(f32(x), f32(y), f32(z));
                let point = hash33(i + neighbor);
                let diff = neighbor + 0.5 + 0.5 * sin(ui.time + 6.2831 * point) - f;
                minDist = min(minDist, length(diff));
            }
        }
    }
    return minDist;
}

// --- FBM ---
fn fbm3d(p: vec3<f32>, isSimplex: bool) -> f32 {
    var val = 0.0;
    var amp = 0.5;
    var pos = p;
    for (var i = 0u; i < u32(ui.octaves); i++) {
        val += amp * select(noise3d(pos), simplex3d(pos), isSimplex);
        pos = pos * 2.0;
        amp = amp * ui.persistence;
    }
    return val;
}

fn get_noise_unified(p_in: vec2<f32>, fragCoord: vec2<f32>, seed_offset: f32) -> f32 {
    let evol = select(0.0, ui.time, ui.autoAnimate != 0u) + ui.evolution;
    let p = vec3<f32>(p_in, evol * 0.5 + seed_offset);
    
    switch (ui.noiseType) {
        case 0u: { // White Noise (Static)
            // Use fragCoord for true per-pixel noise without grids
            return pixelHash(fragCoord, evol + ui.seed + seed_offset);
        }
        case 1u: { // Perlin (fBm)
            return fbm3d(p, false) * 0.5 + 0.5;
        }
        case 2u: { // Simplex
            return fbm3d(p, true) * 0.5 + 0.5;
        }
        case 3u: { // Ridged
            return 1.0 - abs(fbm3d(p, false));
        }
        case 4u: { // Billow
            return abs(fbm3d(p, false));
        }
        case 5u: { // Worley
            return worley3d(p);
        }
        case 6u: { // Voronoi
            let i = floor(p);
            let f = fract(p);
            var res = vec2<f32>(8.0);
            for (var z = -1; z <= 1; z++) {
                for (var y = -1; y <= 1; y++) {
                    for (var x = -1; x <= 1; x++) {
                        let neighbor = vec3<f32>(f32(x), f32(y), f32(z));
                        let point = hash33(i + neighbor);
                        let diff = neighbor + 0.5 + 0.5 * sin(ui.time + 6.2831 * point) - f;
                        let d = dot(diff, diff);
                        if (d < res.x) { res.y = res.x; res.x = d; }
                        else if (d < res.y) { res.y = d; }
                    }
                }
            }
            return sqrt(res.y) - sqrt(res.x);
        }
        case 7u: { // Domain Warp
            let q = vec3<f32>(fbm3d(p, false), fbm3d(p + vec3<f32>(5.2, 1.3, 0.5), false), 0.0);
            let r = vec3<f32>(fbm3d(p + 4.0 * q, false), fbm3d(p + 4.0 * q + vec3<f32>(8.3, 2.8, 0.9), false), 0.0);
            return fbm3d(p + 4.0 * r, false) * 0.5 + 0.5;
        }
        default: { return 0.0; }
    }
}
`;

export const NoiseSourceFragmentWGSL = `
${NoiseCommonWGSL}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var p = (uv * 2.0 - 1.0);
    p.x *= ui.aspectRatio;
    let noiseP = p * ui.scale + ui.seed;
    
    var n = get_noise_unified(noiseP, fragCoord.xy, 0.0);
    
    n = (n - 0.5) * ui.contrast + 0.5 + ui.brightness;
    return vec4<f32>(vec3<f32>(clamp(n, 0.0, 1.0)), 1.0);
}
`;

export const ColorNoiseFragmentWGSL = `
${NoiseCommonWGSL}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var p = (uv * 2.0 - 1.0);
    p.x *= ui.aspectRatio;
    let noiseP = p * ui.scale + ui.seed;
    
    let r = get_noise_unified(noiseP, fragCoord.xy, 0.0);
    let g = get_noise_unified(noiseP, fragCoord.xy, 123.456);
    let b = get_noise_unified(noiseP, fragCoord.xy, 789.012);
    
    var color = vec3<f32>(r, g, b);
    color = (color - 0.5) * ui.contrast + 0.5 + ui.brightness;
    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
