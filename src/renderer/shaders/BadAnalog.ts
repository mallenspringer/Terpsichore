export const BadAnalogWGSL = /* wgsl */ `
struct BadAnalogUniforms {
  params0: vec4<f32>,     // [displayMode, processTarget, phosphorType, timeSec]
  params1: vec4<f32>,     // [aspect, hasMask, curvature, vignette]
  params2: vec4<f32>,     // [scanlines, scanlineCount, phosphorMask, maskBrightness]
  params3: vec4<f32>,     // [chromaBleed, jitter, vhsTracking, headSwitching]
  params4: vec4<f32>,     // [humBar, humBarSpeed, noiseSnow, lumaSag]
  params5: vec4<f32>,     // [vectorGlow, vectorIntensity, glitchTrig, 0.0]
};

struct StageOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: BadAnalogUniforms;
@group(0) @binding(1) var inTex: texture_2d<f32>;
@group(0) @binding(2) var maskTex: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn applyCurvature(uv: vec2<f32>, k: f32) -> vec2<f32> {
  if (k < 0.001) { return uv; }
  let cc = uv - vec2<f32>(0.5);
  let dist = dot(cc, cc);
  return uv + cc * (dist * k * 0.45);
}

fn calcVignette(uv: vec2<f32>, amount: f32) -> f32 {
  if (amount < 0.001) { return 1.0; }
  let v = uv * (1.0 - uv.yx);
  let vig = max(0.0, v.x * v.y * 16.0);
  return clamp(pow(vig, amount * 0.5), 0.0, 1.0);
}

fn sampleChromaBleed(uv: vec2<f32>, bleed: f32) -> vec4<f32> {
  let base = textureSampleLevel(inTex, smp, uv, 0.0);
  if (bleed < 0.001) { return base; }
  let bDist = bleed * 0.016;
  let sL1 = textureSampleLevel(inTex, smp, uv - vec2<f32>(bDist * 1.0, 0.0), 0.0);
  let sL2 = textureSampleLevel(inTex, smp, uv - vec2<f32>(bDist * 2.0, 0.0), 0.0);
  let sR1 = textureSampleLevel(inTex, smp, uv + vec2<f32>(bDist * 0.7, 0.0), 0.0);

  let rSmear = base.r * 0.50 + sL1.r * 0.35 + sL2.r * 0.15;
  let bSmear = base.b * 0.50 + sR1.b * 0.35 + sL1.b * 0.15;
  let aSmear = max(base.a, (sL1.a * 0.5 + sL2.a * 0.25) * bleed);
  return vec4<f32>(rSmear, base.g, bSmear, aSmear);
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> StageOutput {
  let displayMode = i32(round(u.params0.x)); // 0 = CRT, 1 = Vector, 2 = Monochrome, 3 = Matrix LCD
  let processTarget = i32(round(u.params0.y)); // 0 = Canvas, 1 = Upstream Bounded
  let phosphorType = i32(round(u.params0.z));  // 0 = P1 Green, 1 = P3 Amber, 2 = P4 White
  let timeSec = u.params0.w;

  let aspect = max(0.1, u.params1.x);
  let hasMask = u.params1.y > 0.5;
  let curvature = u.params1.z;
  let vignetteAmt = u.params1.w;

  let scanlinesAmt = u.params2.x;
  let scanlineCount = max(60.0, u.params2.y);
  let phosphorMaskAmt = u.params2.z;
  let maskBrightness = u.params2.w;

  let chromaBleed = u.params3.x;
  let jitter = u.params3.y;
  let vhsTracking = u.params3.z;
  let headSwitching = u.params3.w;

  let humBar = u.params4.x;
  let humBarSpeed = u.params4.y;
  let noiseSnow = u.params4.z;
  let lumaSag = u.params4.w;

  let vectorGlow = u.params5.x;
  let vectorIntensity = u.params5.y;
  let glitchTrig = u.params5.z;

  // Preserve pristine sample for Upstream Bounded alpha gating and mask evaluation
  let origSample = textureSampleLevel(inTex, smp, uv, 0.0);
  var maskWeight = 1.0;
  if (hasMask) {
    let maskSamp = textureSampleLevel(maskTex, smp, uv, 0.0);
    maskWeight = clamp(dot(maskSamp.rgb, vec3<f32>(0.299, 0.587, 0.114)) * maskSamp.a, 0.0, 1.0);
  }

  // 1. CRT Curvature (only applied in Canvas mode, so bounded objects stay in place)
  var workUV = uv;
  if (processTarget == 0) {
    workUV = applyCurvature(uv, curvature);
  }

  // 2. VHS Head-Switching Noise Band (bottom 4..8 lines)
  if (headSwitching > 0.001 && workUV.y > (1.0 - 0.06 * headSwitching)) {
    let headNoise = hash12(vec2<f32>(floor(workUV.y * 480.0), floor(timeSec * 60.0))) * 2.0 - 1.0;
    workUV.x += (headNoise * 0.02 + sin(workUV.y * 120.0 + timeSec * 22.0) * 0.015) * headSwitching;
  }

  // 3. VHS Tracking Skew & Flagging (top lines pull horizontally)
  if (vhsTracking > 0.001) {
    let topFlag = smoothstep(0.35, 0.0, workUV.y);
    let trackNoise = sin(timeSec * 8.0 + workUV.y * 16.0) * 0.02;
    workUV.x += (topFlag * 0.045 + trackNoise) * vhsTracking;
  }

  // 4. H-Sync Jitter & Line Tear
  if (jitter > 0.001 || glitchTrig > 0.001) {
    let totalJitter = clamp(jitter + glitchTrig * 0.7, 0.0, 2.0);
    let scanY = floor(workUV.y * 240.0);
    let lineNoise = hash12(vec2<f32>(scanY, floor(timeSec * 30.0))) * 2.0 - 1.0;
    let tearBand = smoothstep(0.85, 1.0, sin(workUV.y * 14.0 - timeSec * 5.5 + glitchTrig * 12.0));
    workUV.x += (lineNoise * 0.005 + tearBand * lineNoise * 0.028) * totalJitter;
  }

  // 5. Momentary Vertical Frame Roll from Glitch Trigger
  if (glitchTrig > 0.01) {
    workUV.y = fract(workUV.y + glitchTrig * 0.25);
  }

  // 6. Sample with Chroma Bleed
  var col = sampleChromaBleed(workUV, chromaBleed);

  // 7. 60Hz / 50Hz AC Ground Hum Bar
  if (humBar > 0.001) {
    let humPhase = fract(workUV.y - timeSec * humBarSpeed * 0.25);
    let humWave = sin(humPhase * 6.2831853);
    let humFactor = 1.0 + humWave * 0.14 * humBar;
    col = vec4<f32>(clamp(col.rgb * humFactor, vec3<f32>(0.0), vec3<f32>(1.0)), col.a);
  }

  // 8. Display Modes
  if (displayMode == 0) {
    // --- CRT (Interlaced Scanlines & Aperture Grille / Shadow Mask) ---
    if (scanlinesAmt > 0.001) {
      let scanPos = workUV.y * scanlineCount * 3.14159265;
      let scanWave = 0.5 + 0.5 * sin(scanPos);
      let scanMod = mix(1.0, 0.62 + 0.38 * scanWave, scanlinesAmt);
      col = vec4<f32>(col.rgb * scanMod, col.a);
    }

    if (phosphorMaskAmt > 0.001) {
      let maskX = fract(workUV.x * (scanlineCount * aspect * 0.75));
      var triad = vec3<f32>(1.0);
      if (maskX < 0.333) {
        triad = vec3<f32>(1.3, 0.7, 0.7); // Red phosphor
      } else if (maskX < 0.666) {
        triad = vec3<f32>(0.7, 1.3, 0.7); // Green phosphor
      } else {
        triad = vec3<f32>(0.7, 0.7, 1.3); // Blue phosphor
      }
      col = vec4<f32>(mix(col.rgb, col.rgb * triad * maskBrightness, phosphorMaskAmt), col.a);
    }
  } else if (displayMode == 1) {
    // --- VECTOR DISPLAY (Electron Beam Tracing & Phosphor Glow) ---
    let luma = dot(col.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let beamCore = pow(luma, 1.35) * vectorIntensity;
    let glow = smoothstep(0.08, 0.85, luma) * vectorGlow * 0.85;
    let vectorTint = vec3<f32>(0.25, 1.0, 0.7); // Authentic Vectrex / Asteroids cyan-green
    let vecRgb = col.rgb * beamCore + vectorTint * glow;
    col = vec4<f32>(clamp(vecRgb, vec3<f32>(0.0), vec3<f32>(1.0)), max(col.a, luma * 0.95));
  } else if (displayMode == 2) {
    // --- MONOCHROME PHOSPHOR (P1 Green, P3 Amber, P4 White) ---
    let luma = dot(col.rgb, vec3<f32>(0.299, 0.587, 0.114));
    var phosCol = vec3<f32>(0.12, 0.96, 0.22); // P1 Green
    if (phosphorType == 1) {
      phosCol = vec3<f32>(1.0, 0.72, 0.08);    // P3 Amber
    } else if (phosphorType == 2) {
      phosCol = vec3<f32>(0.92, 0.95, 1.0);    // P4 White
    }
    // High-contrast CRT S-curve
    let curvedLuma = luma * luma * (3.0 - 2.0 * luma);
    col = vec4<f32>(phosCol * curvedLuma, col.a);

    // Subtle monochrome scanlines
    if (scanlinesAmt > 0.001) {
      let scanPos = workUV.y * scanlineCount * 3.14159265;
      let scanMod = mix(1.0, 0.65 + 0.35 * (0.5 + 0.5 * sin(scanPos)), scanlinesAmt);
      col = vec4<f32>(col.rgb * scanMod, col.a);
    }
  } else if (displayMode == 3) {
    // --- RETRO MATRIX (VFD / LCD) ---
    let gridCount = vec2<f32>(scanlineCount * aspect, scanlineCount);
    let cellCoord = fract(workUV * gridCount);
    let cellEdge = smoothstep(0.0, 0.12, cellCoord.x) * smoothstep(1.0, 0.88, cellCoord.x)
                 * smoothstep(0.0, 0.12, cellCoord.y) * smoothstep(1.0, 0.88, cellCoord.y);
    let vfdGlow = vec3<f32>(0.15, 0.85, 0.75); // Teal VFD glow
    col = vec4<f32>(mix(col.rgb * 0.25, col.rgb * cellEdge + vfdGlow * (1.0 - cellEdge) * 0.15, 0.85), col.a);
  }

  // 9. Luma Sag / Voltage Bloom
  if (lumaSag > 0.001) {
    let frameLuma = dot(col.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let sagFactor = smoothstep(0.65, 1.0, frameLuma) * lumaSag;
    col = vec4<f32>(col.rgb * (1.0 + sagFactor * 0.6), col.a);
  }

  // 10. RF Noise Snow
  if (noiseSnow > 0.001) {
    let grain = (hash12(workUV * 480.0 + vec2<f32>(timeSec * 77.1, timeSec * 31.9)) - 0.5) * 0.32 * noiseSnow;
    col = vec4<f32>(clamp(col.rgb + vec3<f32>(grain), vec3<f32>(0.0), vec3<f32>(1.0)), col.a);
  }

  // 11. Dual-Target Processing (Canvas vs Upstream Bounded)
  var out: StageOutput;
  if (processTarget == 1) {
    // Upstream Bounded Mode: effect MUST stop at the bounds of the upstream shape!
    let objAlpha = origSample.a * maskWeight;
    if (objAlpha < 0.001) {
      out.videoOut = vec4<f32>(0.0);
      out.matteOut = vec4<f32>(0.0);
      return out;
    }
    let finalRgb = mix(origSample.rgb, col.rgb, maskWeight);
    out.videoOut = vec4<f32>(finalRgb * origSample.a, origSample.a);
    out.matteOut = vec4<f32>(vec3<f32>(origSample.a), 1.0);
    return out;
  } else {
    // Canvas Mode: whole screen processed
    let isOutside = workUV.x < 0.0 || workUV.x > 1.0 || workUV.y < 0.0 || workUV.y > 1.0;
    if (isOutside) {
      out.videoOut = vec4<f32>(0.0, 0.0, 0.0, 1.0);
      out.matteOut = vec4<f32>(0.0, 0.0, 0.0, 1.0);
      return out;
    }
    let vig = calcVignette(workUV, vignetteAmt);
    let finalCol = vec4<f32>(col.rgb * vig, col.a);
    if (hasMask) {
      let blended = mix(origSample, finalCol, maskWeight);
      out.videoOut = blended;
      out.matteOut = vec4<f32>(vec3<f32>(blended.a), 1.0);
      return out;
    }
    out.videoOut = finalCol;
    out.matteOut = vec4<f32>(vec3<f32>(finalCol.a), 1.0);
    return out;
  }
}
`;
