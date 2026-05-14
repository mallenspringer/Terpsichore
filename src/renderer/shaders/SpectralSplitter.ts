export const SpectralSplitterWGSL = `
struct Uniforms {
    sensitivity: f32,
    smoothing: f32,
    aspect: f32,
    time: f32,
    low: f32,
    lowMid: f32,
    mid: f32,
    highMid: f32,
    high: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> fftData: array<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    var out: VertexOutput;
    out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
    out.uv = pos[vertexIndex] * 0.5 + 0.5;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    
    // Background: Raw FFT Spectrum (Ghost)
    let fftSize = 512.0;
    let fftIdx = u32(uv.x * fftSize);
    
    // Improved dB to linear for the ghost spectrum visibility
    let db = fftData[fftIdx];
    let ghostVal = clamp((db + 70.0) / 70.0, 0.0, 1.0);
    let ghostColor = vec3<f32>(0.1, 0.25, 0.4) * step(1.0 - uv.y, ghostVal);
    
    // Foreground: 5 Bands
    let bandIdx = i32(uv.x * 5.0);
    var bandVal: f32 = 0.0;
    if (bandIdx == 0) { bandVal = uniforms.low; }
    else if (bandIdx == 1) { bandVal = uniforms.lowMid; }
    else if (bandIdx == 2) { bandVal = uniforms.mid; }
    else if (bandIdx == 3) { bandVal = uniforms.highMid; }
    else { bandVal = uniforms.high; }
    
    let scaledVal = bandVal * uniforms.sensitivity;
    
    // Bar dimensions
    let margin = 0.15;
    let localX = (uv.x * 5.0) % 1.0;
    let isBar = step(margin, localX) * step(localX, 1.0 - margin);
    
    let barHeight = clamp(scaledVal, 0.0, 1.0);
    let barActive = step(1.0 - uv.y, barHeight) * isBar;
    
    // Color gradient - Cyan to Magenta (slightly dimmed)
    let barColor = mix(vec3<f32>(0.1, 0.7, 0.8), vec3<f32>(0.7, 0.1, 0.8), uv.y);
    
    var finalColor = ghostColor * 0.5; // Dim the background slightly
    if (barActive > 0.5) {
        finalColor = barColor;
    } else if (isBar > 0.5) {
        // Subtle outline for inactive bars
        finalColor += vec3<f32>(0.05, 0.05, 0.1);
    }
    
    // Grid lines
    let grid = step(0.99, fract(uv.y * 10.0)) * 0.15;
    finalColor += grid;
    
    // Glow (less overwhelming)
    let glow = max(0.0, barHeight - (1.0 - uv.y)) * 0.3 * isBar;
    finalColor += barColor * glow;
    
    return vec4<f32>(finalColor, 1.0);
}
`;
