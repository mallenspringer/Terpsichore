export const WaterfallSpectrogramWGSL = `
struct Uniforms {
    tilt: f32,
    gain: f32,
    speed: f32,
    currentHead: f32,
    colorMode: f32,       // 0 = topographic, 1 = decay, 2 = transient, 3 = frequency
    flowDirection: f32,   // 0 = front-to-back, 1 = back-to-front
    renderStyle: f32,     // 0 = surface, 1 = lines
    showScaffold: f32,
    aspect: f32,
    time: f32,
    useCustomPalette: f32,
    customColorCount: f32,
    customInterpolation: f32,
    scaleX: f32,
    scaleY: f32,
    pad3: f32,
    defaultColor: vec4<f32>,
    customColors: array<vec4<f32>, 8>,
    customPositions: array<vec4<f32>, 2>,
    padFinal: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var historyTexture: texture_2d<f32>;
@group(0) @binding(2) var historySampler: sampler;

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

fn sampleHeight(uFreq: f32, vTime: f32) -> f32 {
    let uClamped = clamp(uFreq, 0.0, 1.0);
    var historyRow = fract(uniforms.currentHead - vTime);
    if (uniforms.flowDirection > 0.5) {
        historyRow = fract(uniforms.currentHead - (1.0 - vTime));
    }
    
    let rawVal = textureSampleLevel(historyTexture, historySampler, vec2<f32>(uClamped, historyRow), 0.0).r;
    let effectiveGain = max(0.1, uniforms.gain);
    return rawVal * effectiveGain * 0.8;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    
    // Camera angle derived from tilt parameter: 0 = overhead 2D, 1 = steep horizon
    let tiltNorm = clamp(uniforms.tilt, 0.0, 1.0);
    let pitch = mix(0.15, 0.88, tiltNorm) * 1.5707963; // 0 to ~80 degrees
    
    // Camera positioning: closer distance so terrain fills ~85% of canvas by default
    let camDist = mix(2.2, 1.65, tiltNorm);
    let camY = cos(pitch) * camDist + 0.25;
    let camZ = -sin(pitch) * camDist + 0.3;
    let camPos = vec3<f32>(0.0, camY, camZ);
    let targetPos = vec3<f32>(0.0, 0.2, 1.0);
    
    let forward = normalize(targetPos - camPos);
    let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), forward));
    let up = cross(forward, right);
    
    let sx = max(0.05, select(1.0, uniforms.scaleX, uniforms.scaleX > 0.01));
    let sy = max(0.05, select(1.0, uniforms.scaleY, uniforms.scaleY > 0.01));
    let fov = 0.34;
    
    // Symmetrical, centered scaling:
    // Screen center in NDC is (0.0, 0.0). Both X and Y scale symmetrically around center (0, 0).
    let ndcX = uv.x * 2.0 - 1.0;
    let ndcY = 1.0 - uv.y * 2.0;
    
    // Constant framing offset to ground baseline gracefully in lower third without anchoring the scale pivot
    let yOffset = mix(0.0, -0.09, tiltNorm);
    
    let px = (ndcX / sx) * (uniforms.aspect * fov);
    let py = (ndcY / sy) * fov + yOffset;
    let rayDir = normalize(forward + px * right + py * up);
    let rayOrg = camPos;
    
    // Bounding volume: X [-1.0, 1.0], Z [0.0, 2.0], Y [0.0, 1.5]
    let maxH = max(0.5, uniforms.gain * 1.0);
    var tMin: f32 = 0.001;
    var tMax: f32 = 8.0;
    
    // Ray-box intersection with terrain bounds
    let invD = 1.0 / (rayDir + vec3<f32>(select(0.00001, -0.00001, rayDir.x < 0.0), select(0.00001, -0.00001, rayDir.y < 0.0), select(0.00001, -0.00001, rayDir.z < 0.0)));
    let t0 = (vec3<f32>(-1.0, 0.0, 0.0) - rayOrg) * invD;
    let t1 = (vec3<f32>(1.0, maxH, 2.0) - rayOrg) * invD;
    let tNear = min(t0, t1);
    let tFar = max(t0, t1);
    
    let enterT = max(max(tNear.x, tNear.y), max(tNear.z, 0.0));
    let exitT = min(min(tFar.x, tFar.y), tFar.z);
    
    if (enterT > exitT || exitT < 0.0) {
        if (uniforms.showScaffold > 0.5) {
            return vec4<f32>(0.015, 0.02, 0.035, 1.0);
        }
        return vec4<f32>(0.0);
    }
    
    tMin = max(tMin, enterT);
    tMax = min(tMax, exitT);
    
    // Raymarch the terrain heightfield
    let numSteps = 56u;
    let stepSize = (tMax - tMin) / f32(numSteps);
    var t = tMin;
    var hit = false;
    var hitP = vec3<f32>(0.0);
    var prevP = vec3<f32>(0.0);
    var prevT = tMin;
    
    for (var i = 0u; i < numSteps; i = i + 1u) {
        let p = rayOrg + t * rayDir;
        let uFreq = (p.x + 1.0) * 0.5;
        let vTime = p.z * 0.5;
        
        let h = sampleHeight(uFreq, vTime);
        if (p.y <= h) {
            hit = true;
            hitP = p;
            prevP = rayOrg + prevT * rayDir;
            break;
        }
        prevT = t;
        t = t + stepSize;
    }
    
    if (hit) {
        // Binary refinement step for crisp surface detail
        var tA = prevT;
        var tB = t;
        for (var b = 0u; b < 4u; b = b + 1u) {
            let tMid = (tA + tB) * 0.5;
            let pMid = rayOrg + tMid * rayDir;
            let hMid = sampleHeight((pMid.x + 1.0) * 0.5, pMid.z * 0.5);
            if (pMid.y <= hMid) {
                tB = tMid;
            } else {
                tA = tMid;
            }
        }
        hitP = rayOrg + tB * rayDir;
        
        let uFreq = clamp((hitP.x + 1.0) * 0.5, 0.0, 1.0);
        let vTime = clamp(hitP.z * 0.5, 0.0, 1.0);
        
        // Finite difference normals
        let eps = 0.008;
        let hL = sampleHeight(uFreq - eps, vTime);
        let hR = sampleHeight(uFreq + eps, vTime);
        let hD = sampleHeight(uFreq, vTime - eps);
        let hU = sampleHeight(uFreq, vTime + eps);
        
        let dX = (hR - hL) / (2.0 * eps);
        let dZ = (hU - hD) / (2.0 * eps);
        let norm = normalize(vec3<f32>(-dX, 1.0, -dZ));
        
        // Lighting
        let lightDir = normalize(vec3<f32>(0.4, 0.8, -0.5));
        let diff = max(0.25, dot(norm, lightDir));
        let viewDir = normalize(camPos - hitP);
        let halfVec = normalize(lightDir + viewDir);
        let spec = pow(max(0.0, dot(norm, halfVec)), 24.0) * 0.4;
        
        // Color evaluation
        var palT = 0.0;
        if (uniforms.colorMode < 0.5) {
            // 0: Topographic (amplitude / elevation)
            let maxExpectedH = max(0.1, uniforms.gain * 0.8);
            palT = clamp(pow(hitP.y / maxExpectedH, 0.75), 0.0, 1.0);
        } else if (uniforms.colorMode < 1.5) {
            // 1: Time Decay (age into the past)
            palT = clamp(vTime, 0.0, 1.0);
        } else if (uniforms.colorMode < 2.5) {
            // 2: Transient Crest (rate of change / slope)
            palT = clamp(pow(abs(dZ) * 1.5, 0.75), 0.0, 1.0);
        } else {
            // 3: Frequency spectrum
            palT = uFreq;
        }
        
        var baseColor = uniforms.defaultColor.rgb;
        if (uniforms.useCustomPalette > 0.5) {
            baseColor = sampleCustomPalette(palT).rgb;
        } else if (length(uniforms.defaultColor.rgb) <= 0.05) {
            baseColor = mix(vec3<f32>(0.0, 1.0, 0.4), vec3<f32>(0.1, 0.6, 1.0), palT);
        }
        
        // Render Style: Surface vs Stacked Ridge Lines
        if (uniforms.renderStyle > 0.5) {
            // Lines mode: Joy Division / Unknown Pleasures cross-sections
            let lineSlice = fract(vTime * 48.0);
            let isLine = step(lineSlice, 0.16) + step(0.84, lineSlice);
            if (isLine > 0.5) {
                let litLine = baseColor * (diff * 1.2 + 0.3) + vec3<f32>(spec);
                return vec4<f32>(litLine, 1.0);
            }
            if (uniforms.showScaffold > 0.5) {
                // Dark occluding underbelly
                return vec4<f32>(baseColor * 0.04, 0.96);
            }
            return vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }
        
        // Surface mode: continuous shaded 3D terrain
        let scanlines = step(0.92, fract(vTime * 48.0)) * 0.15;
        let litColor = baseColor * diff + vec3<f32>(spec) + baseColor * scanlines;
        return vec4<f32>(litColor, 1.0);
    }
    
    // Ground plane & Reticle Scaffold
    if (uniforms.showScaffold > 0.5) {
        let groundT = -camPos.y / (rayDir.y + 0.00001);
        if (groundT > 0.0) {
            let gp = camPos + groundT * rayDir;
            if (abs(gp.x) <= 1.02 && gp.z >= -0.02 && gp.z <= 2.02) {
                let uG = (gp.x + 1.0) * 0.5;
                let vG = gp.z * 0.5;
                let gridX = step(0.96, fract(uG * 16.0));
                let gridZ = step(0.96, fract(vG * 32.0));
                let boundary = step(0.99, abs(gp.x)) + step(1.99, gp.z) + step(gp.z, 0.01);
                let grid = clamp(gridX + gridZ + boundary * 1.5, 0.0, 1.0);
                let groundColor = vec3<f32>(0.02, 0.03, 0.05) + vec3<f32>(0.1, 0.25, 0.35) * grid * 0.4;
                return vec4<f32>(groundColor, 0.85);
            }
        }
        return vec4<f32>(0.015, 0.02, 0.035, 1.0);
    }
    
    return vec4<f32>(0.0);
}
`;
