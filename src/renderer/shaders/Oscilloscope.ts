export const OscilloscopeWGSL = `
struct Uniforms {
    triggerLevel: f32,
    timeScale: f32,
    aspectRatio: f32,
    isFrozen: f32,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> waveform : array<f32>;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
    let x = uv.x;
    let y = 1.0 - uv.y;

    // Find trigger point
    var startIdx = 0u;
    if (uniforms.isFrozen < 0.5) {
        // Search first 256 samples for trigger
        for (var i = 1u; i < 256u; i++) {
            if (waveform[i] > uniforms.triggerLevel && waveform[i-1] <= uniforms.triggerLevel) {
                startIdx = i;
                break;
            }
        }
    }

    let totalSamples = arrayLength(&waveform);
    // Clamp timeScale to reasonable range
    let safeTimeScale = clamp(uniforms.timeScale, 0.01, 100.0);
    let visibleSamples = u32(f32(totalSamples) / safeTimeScale);
    
    // Map x to waveform index
    let idx = startIdx + u32(x * f32(visibleSamples));
    
    var waveVal = 0.0;
    if (idx < totalSamples) {
        waveVal = waveform[idx];
    }

    // Audio is -1 to 1, map to 0.1 - 0.9 screen space
    let linePos = waveVal * 0.4 + 0.5;
    let dist = abs(y - linePos);
    
    let thickness = 0.005;
    let glow = 0.03;
    let intensity = smoothstep(thickness + glow, thickness, dist);
    
    var color = vec3f(0.0, 0.9, 1.0); // Cyber blue
    if (uniforms.isFrozen > 0.5) {
        color = vec3f(0.3, 0.6, 1.0); // Frozen blue
    }

    // Grid effect
    let gridX = step(0.995, sin(uv.x * 20.0));
    let gridY = step(0.995, sin(uv.y * 20.0));
    let grid = (gridX + gridY) * 0.1;
    
    // Background glow
    let bg = vec3f(0.02, 0.05, 0.1) * (1.0 - dist * 2.0);

    return vec4f(max(bg, color * intensity) + grid, 1.0);
}
`;
