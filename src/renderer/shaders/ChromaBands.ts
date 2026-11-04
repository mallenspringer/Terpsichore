// WGSL Shader for ChromaBands Effect (HSV Chromatic Quantization & Hue Cel-Shading)

export const ChromaBandsWGSL = `
struct ChromaBandsUniforms {
  // params0: x = bandCount (2..8), y = spatialSmoothing (0..1), z = chromaGate (0..0.5), w = totalHueShift (-1..1)
  params0: vec4<f32>,
  // params1: x = outlineEnabled (0 or 1), y = outlineWidth (1..8 px), z = outlineOpacity (0..1), w = aspect (w/h)
  params1: vec4<f32>,
  // params2: x = chromaSensitivity (0.5..5.0), y = gateMode (0=base_layer, 1=neutral_color), z = unused, w = unused
  params2: vec4<f32>,
  // outlineColor: RGBA
  outlineColor: vec4<f32>,
  // thresholds0: angular cutoffs for bands 0..3 (normalized 0.0..1.0, where 1.0 = 360 deg)
  thresholds0: vec4<f32>,
  // thresholds1: angular cutoffs for bands 4..7 (normalized 0.0..1.0, where 1.0 = 360 deg)
  thresholds1: vec4<f32>,
  // Band Colors 0..7
  color0: vec4<f32>,
  color1: vec4<f32>,
  color2: vec4<f32>,
  color3: vec4<f32>,
  color4: vec4<f32>,
  color5: vec4<f32>,
  color6: vec4<f32>,
  color7: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: ChromaBandsUniforms;
@group(0) @binding(1) var videoTex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct ChromaBandsOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

// Converts RGB to HSV
// Returns vec3<f32>(H in 0..1, S in 0..1, V in 0..1)
// H=0 (Red), H=0.166 (Yellow), H=0.333 (Green), H=0.5 (Cyan), H=0.666 (Blue), H=0.833 (Magenta)
fn rgbToHsv(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));

  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  let h = abs(q.z + (q.w - q.y) / (6.0 * d + e));
  let s = d / (q.x + e);
  let v = q.x;
  return vec3<f32>(h, s, v);
}

// Converts HSV to continuous 2D cartesian chroma vector with sensitivity scaling
fn hsvToChromaCartesian(hsv: vec3<f32>, sensitivity: f32) -> vec2<f32> {
  let sBoosted = clamp(hsv.y * sensitivity, 0.0, 1.0);
  let theta = hsv.x * 6.28318530718; // 2 * PI
  return vec2<f32>(sBoosted * cos(theta), sBoosted * sin(theta));
}

// Samples smoothed chroma vector using edge-preserving bilateral filter
fn sampleSmoothedChromaVector(uv: vec2<f32>) -> vec2<f32> {
  let centerRgb = textureSampleLevel(videoTex, smp, uv, 0.0).rgb;
  let centerHsv = rgbToHsv(centerRgb);
  let sensitivity = max(0.1, u.params2.x);
  let centerVec = hsvToChromaCartesian(centerHsv, sensitivity);
  let smoothing = u.params0.y;

  if (smoothing <= 0.005) {
    return centerVec;
  }

  let aspect = max(0.1, u.params1.w);
  let radius = smoothing * 0.008;
  let sigmaR = max(0.04, 0.22 - smoothing * 0.12);
  let invTwoSigmaR2 = 1.0 / (2.0 * sigmaR * sigmaR);

  var totalWeight = 1.0;
  var accumVec = centerVec;

  var offsets = array<vec2<f32>, 8>(
    vec2<f32>(1.0 / aspect, 0.0) * radius,
    vec2<f32>(-1.0 / aspect, 0.0) * radius,
    vec2<f32>(0.0, 1.0) * radius,
    vec2<f32>(0.0, -1.0) * radius,
    vec2<f32>(0.707 / aspect, 0.707) * radius,
    vec2<f32>(-0.707 / aspect, 0.707) * radius,
    vec2<f32>(0.707 / aspect, -0.707) * radius,
    vec2<f32>(-0.707 / aspect, -0.707) * radius
  );

  for (var i = 0; i < 8; i = i + 1) {
    let tapRgb = textureSampleLevel(videoTex, smp, uv + offsets[i], 0.0).rgb;
    let tapHsv = rgbToHsv(tapRgb);
    let tapVec = hsvToChromaCartesian(tapHsv, sensitivity);
    let diff = length(tapVec - centerVec);
    let w = exp(-diff * diff * invTwoSigmaR2);
    accumVec = accumVec + tapVec * w;
    totalWeight = totalWeight + w;
  }

  return accumVec / totalWeight;
}

fn getThreshold(idx: i32) -> f32 {
  var t = 1.0;
  if (idx == 0) { t = u.thresholds0.x; }
  else if (idx == 1) { t = u.thresholds0.y; }
  else if (idx == 2) { t = u.thresholds0.z; }
  else if (idx == 3) { t = u.thresholds0.w; }
  else if (idx == 4) { t = u.thresholds1.x; }
  else if (idx == 5) { t = u.thresholds1.y; }
  else if (idx == 6) { t = u.thresholds1.z; }
  else if (idx == 7) { t = u.thresholds1.w; }
  return clamp(t, 0.0, 1.0);
}

fn getBandColor(idx: i32) -> vec4<f32> {
  if (idx == 0) { return u.color0; }
  if (idx == 1) { return u.color1; }
  if (idx == 2) { return u.color2; }
  if (idx == 3) { return u.color3; }
  if (idx == 4) { return u.color4; }
  if (idx == 5) { return u.color5; }
  if (idx == 6) { return u.color6; }
  return u.color7;
}

// Classifies continuous chroma vector into one of bandCount bands (0..bandCount-1)
fn classifyChromaBand(chromaVec: vec2<f32>, bandCount: i32) -> i32 {
  let s = length(chromaVec);
  let gate = u.params0.z;

  // Below-gate chroma noise maps to base band (0)
  if (s < gate) {
    return 0;
  }

  // Calculate hue angle: atan2 in [-PI, PI] mapped to [0.0, 1.0)
  let pi = 3.14159265359;
  var hueNorm = fract((atan2(chromaVec.y, chromaVec.x) / (2.0 * pi)) + 1.0);

  // Apply hue rotation shift & CV
  let hueShift = u.params0.w;
  hueNorm = fract(hueNorm + hueShift + 1.0);

  for (var i = 0; i < 7; i = i + 1) {
    if (i >= bandCount - 1) {
      return i;
    }
    let thresh = getThreshold(i);
    if (hueNorm <= thresh) {
      return i;
    }
  }

  return bandCount - 1;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> ChromaBandsOutput {
  let bandCount = clamp(i32(u.params0.x + 0.5), 2, 8);
  let aspect = max(0.1, u.params1.w);

  let centerVec = sampleSmoothedChromaVector(uv);
  let centerBand = classifyChromaBand(centerVec, bandCount);
  let baseColor = getBandColor(centerBand);

  var finalColor = baseColor;

  // Ink Outline: Detect boundaries where adjacent pixels belong to a different chroma band
  let outlineEnabled = u.params1.x > 0.5;
  let outlineWidth = u.params1.y;
  let outlineOpacity = clamp(u.params1.z, 0.0, 1.0);

  if (outlineEnabled && outlineWidth > 0.05 && outlineOpacity > 0.005) {
    let rad = outlineWidth * 0.0016;
    let dx = rad / aspect;
    let dy = rad;

    let bL = classifyChromaBand(sampleSmoothedChromaVector(uv + vec2<f32>(-dx, 0.0)), bandCount);
    let bR = classifyChromaBand(sampleSmoothedChromaVector(uv + vec2<f32>(dx, 0.0)), bandCount);
    let bU = classifyChromaBand(sampleSmoothedChromaVector(uv + vec2<f32>(0.0, -dy)), bandCount);
    let bD = classifyChromaBand(sampleSmoothedChromaVector(uv + vec2<f32>(0.0, dy)), bandCount);

    var isEdge = 0.0;
    if (bL != centerBand || bR != centerBand || bU != centerBand || bD != centerBand) {
      isEdge = 1.0;
    }

    if (isEdge > 0.5) {
      let inkAlpha = outlineOpacity * u.outlineColor.a;
      let inkRgb = u.outlineColor.rgb;
      let blendedRgb = mix(finalColor.rgb, inkRgb, inkAlpha);
      let blendedA = max(finalColor.a, inkAlpha);
      finalColor = vec4<f32>(blendedRgb, blendedA);
    }
  }

  let matteVal = f32(centerBand) / max(1.0, f32(bandCount - 1));

  var out: ChromaBandsOutput;
  out.videoOut = finalColor;
  out.matteOut = vec4<f32>(matteVal, matteVal, matteVal, 1.0);
  return out;
}
`;
