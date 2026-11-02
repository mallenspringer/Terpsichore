export const OscilloscopeWGSL = `
struct Uniforms {
    triggerLevel: f32,
    timeScale: f32,
    aspectRatio: f32,
    isFrozen: f32,
    showScaffold: f32,
    colorMode: f32,        // 0 = amplitude, 1 = span, 2 = frequency / slew
    gain: f32,             // Vertical & color sensitivity multiplier
    useCustomPalette: f32,
    customColorCount: f32,
    customInterpolation: f32,
    pad1: f32,
    pad2: f32,
    traceColor: vec4<f32>,
    customColors: array<vec4<f32>, 8>,
    customPositions: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> waveform : array<f32>;

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
    let safeTimeScale = clamp(uniforms.timeScale, 0.01, 100.0);
    let visibleSamples = u32(f32(totalSamples) / safeTimeScale);
    
    // Map x to waveform index
    let idx = startIdx + u32(x * f32(visibleSamples));
    
    var waveVal = 0.0;
    var waveNext = 0.0;
    if (idx < totalSamples) {
        waveVal = waveform[idx];
        let nextIdx = min(idx + 1u, totalSamples - 1u);
        waveNext = waveform[nextIdx];
    }

    // Vertical scaling with gain
    let effectiveGain = max(0.1, uniforms.gain);
    let scaledWave = waveVal * effectiveGain;
    let linePos = clamp(scaledWave * 0.4, -0.48, 0.48) + 0.5;
    let dist = abs(y - linePos);
    
    let thickness = 0.005;
    let glow = 0.035;
    let intensity = smoothstep(thickness + glow, thickness, dist);
    let halo = exp(-dist * 45.0) * 0.45;
    let traceAlpha = clamp(intensity + halo, 0.0, 1.0);
    
    // Determine color
    var lineColor = uniforms.traceColor.rgb;
    if (uniforms.useCustomPalette > 0.5) {
        // Amplitude mode: map scaled amplitude with perceptual response curve
        let ampNorm = clamp(abs(scaledWave), 0.0, 1.0);
        var t = clamp(pow(ampNorm, 0.75), 0.0, 1.0);
        
        if (uniforms.colorMode > 0.5 && uniforms.colorMode < 1.5) {
            // Span mode (horizontal waveform trace)
            t = clamp(x, 0.0, 1.0);
        } else if (uniforms.colorMode >= 1.5) {
            // Slew rate mode: instantaneous rate of change scaled by gain
            let slew = abs(waveNext - waveVal) * effectiveGain * 8.0;
            t = clamp(pow(clamp(slew, 0.0, 1.0), 0.75), 0.0, 1.0);
        }
        lineColor = sampleCustomPalette(t).rgb;
    } else {
        if (uniforms.isFrozen > 0.5) {
            lineColor = mix(uniforms.traceColor.rgb, vec3<f32>(0.3, 0.7, 1.0), 0.5);
        }
    }

    // Scaffold vs Transparent Background
    if (uniforms.showScaffold > 0.5) {
        // Grid effect
        let gridX = step(0.995, sin(uv.x * 20.0));
        let gridY = step(0.995, sin(uv.y * 20.0));
        let grid = (gridX + gridY) * 0.08;
        
        // Background glow
        let bg = lineColor * 0.02 * (1.0 - clamp(dist * 2.0, 0.0, 1.0));
        let finalRgb = max(bg, lineColor * intensity) + grid;
        return vec4f(finalRgb, 1.0);
    }

    // Transparent overlay mode: pure audio trace with alpha channel
    return vec4f(lineColor * traceAlpha, traceAlpha);
}
`;
