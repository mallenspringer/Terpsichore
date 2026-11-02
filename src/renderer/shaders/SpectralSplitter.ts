export const SpectralSplitterWGSL = `
struct Uniforms {
    sensitivity: f32,
    smoothing: f32,
    aspect: f32,
    time: f32,
    bands_1: vec4<f32>, // low, lowMid, mid, highMid
    bands_2: vec4<f32>, // high, unused, unused, unused
    showScaffold: f32,
    colorMode: f32,      // 0 = frequency bands across palette, 1 = bar height / level
    gain: f32,           // Vertical gain / multiplier
    useCustomPalette: f32,
    customColorCount: f32,
    customInterpolation: f32,
    pad1: f32,
    pad2: f32,
    defaultColor: vec4<f32>,
    customColors: array<vec4<f32>, 8>,
    customPositions: array<vec4<f32>, 2>,
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

fn getCustomStopPos(idx: u32) -> f32 {
    if (idx == 0u) { return uniforms.customPositions[0].x; }
    if (idx == 1u) { return uniforms.customPositions[0].y; }
    if (idx == 2u) { return uniforms.customPositions[0].z; }
    if (idx == 3u) { return uniforms.customPositions[0].w; }
    if (idx == 4u) { return uniforms.customPositions[1].x; }
    if (idx == 5u) { return uniforms.customPositions[1].y; }
    if (idx == 6u) { return uniforms.customPositions[1].z; }
    return uniforms.customPositions[1].w;
}

fn sampleCustomPalette(tIn: f32) -> vec4<f32> {
    let count = u32(uniforms.customColorCount + 0.5);
    if (count <= 1u) {
        return uniforms.customColors[0];
    }
    let t = clamp(tIn, 0.0, 1.0);
    let interp = u32(uniforms.customInterpolation + 0.5);

    // 1. Stepped mode: discrete color slices where width equals weight percentage
    if (interp == 1u) {
        let p0 = getCustomStopPos(0u);
        if (t < p0) {
            return uniforms.customColors[count - 1u];
        }
        for (var i = 0u; i < count; i = i + 1u) {
            let pLow = getCustomStopPos(i);
            var pHigh = 1.0;
            if (i + 1u < count) {
                pHigh = getCustomStopPos(i + 1u);
            }
            if (t >= pLow && (t < pHigh || i == count - 1u)) {
                return uniforms.customColors[i];
            }
        }
        return uniforms.customColors[count - 1u];
    }

    // 2. Linear & Smooth modes: proportional spacing analog with midpoints
    let p0 = getCustomStopPos(0u);
    let p1 = getCustomStopPos(1u);
    let mFirst = (p0 + p1) * 0.5;
    let mLastLow = getCustomStopPos(count - 1u);
    let mLast = (mLastLow + 1.0) * 0.5;

    if (t <= mFirst) {
        return uniforms.customColors[0];
    }
    if (t >= mLast) {
        return uniforms.customColors[count - 1u];
    }

    for (var i = 0u; i < count - 1u; i = i + 1u) {
        let pi0 = getCustomStopPos(i);
        let pi1 = getCustomStopPos(i + 1u);
        var pi2 = 1.0;
        if (i + 2u < count) {
            pi2 = getCustomStopPos(i + 2u);
        }
        let m0 = (pi0 + pi1) * 0.5;
        let m1 = (pi1 + pi2) * 0.5;

        if (t >= m0 && t <= m1) {
            let span = max(0.0001, m1 - m0);
            var segT = clamp((t - m0) / span, 0.0, 1.0);
            if (interp == 2u) {
                segT = smoothstep(0.0, 1.0, segT);
            }
            return mix(uniforms.customColors[i], uniforms.customColors[i + 1u], segT);
        }
    }

    return uniforms.customColors[count - 1u];
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    
    // Foreground: 5 Bands
    let bandIdx = i32(uv.x * 5.0);
    var bandVal: f32 = 0.0;
    if (bandIdx == 0) { bandVal = uniforms.bands_1.x; }
    else if (bandIdx == 1) { bandVal = uniforms.bands_1.y; }
    else if (bandIdx == 2) { bandVal = uniforms.bands_1.z; }
    else if (bandIdx == 3) { bandVal = uniforms.bands_1.w; }
    else { bandVal = uniforms.bands_2.x; }
    
    let effectiveGain = max(0.01, uniforms.gain);
    let scaledVal = bandVal * uniforms.sensitivity * effectiveGain;
    
    // Bar dimensions
    let margin = 0.15;
    let localX = (uv.x * 5.0) % 1.0;
    let isBar = step(margin, localX) * step(localX, 1.0 - margin);
    
    let barHeight = clamp(scaledVal, 0.0, 1.0);
    let barActive = step(1.0 - uv.y, barHeight) * isBar;
    
    // Color evaluation
    var barColor = uniforms.defaultColor.rgb;
    if (uniforms.useCustomPalette > 0.5) {
        var t = (f32(bandIdx) + 0.5) / 5.0; // frequency mode
        if (uniforms.colorMode > 0.5) {
            let heightFromBottom = clamp(1.0 - uv.y, 0.0, 1.0);
            t = clamp(pow(heightFromBottom, 0.75), 0.0, 1.0); // amplitude/height mode
        }
        barColor = sampleCustomPalette(t).rgb;
    } else {
        let defaultGrad = mix(vec3<f32>(0.1, 0.7, 0.8), vec3<f32>(0.7, 0.1, 0.8), 1.0 - uv.y);
        if (length(uniforms.defaultColor.rgb) > 0.05) {
            barColor = uniforms.defaultColor.rgb;
        } else {
            barColor = defaultGrad;
        }
    }
    
    let glow = max(0.0, barHeight - (1.0 - uv.y)) * 0.3 * isBar;
    
    // Scaffold vs Transparent Background
    if (uniforms.showScaffold > 0.5) {
        // Raw FFT Spectrum (Ghost)
        let numSamples = arrayLength(&fftData);
        let fftIdx = min(u32(uv.x * f32(numSamples)), numSamples - 1u);
        let db = fftData[fftIdx];
        let ghostVal = clamp((db + 70.0) / 70.0, 0.0, 1.0);
        let ghostColor = vec3<f32>(0.1, 0.25, 0.4) * step(1.0 - uv.y, ghostVal);
        
        var finalColor = ghostColor * 0.5;
        if (barActive > 0.5) {
            finalColor = barColor;
        } else if (isBar > 0.5) {
            finalColor += vec3<f32>(0.05, 0.05, 0.1);
        }
        
        // Grid lines
        let grid = step(0.99, fract(uv.y * 10.0)) * 0.15;
        finalColor += grid;
        finalColor += barColor * glow;
        
        return vec4<f32>(finalColor, 1.0);
    }
    
    // Transparent mode: only active floating spectrum bars
    let alpha = clamp(barActive + glow, 0.0, 1.0);
    return vec4<f32>(barColor * alpha, alpha);
}
`;
