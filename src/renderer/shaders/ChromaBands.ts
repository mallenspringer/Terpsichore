// WGSL Shader for ChromaBands Effect (Chromatic Quantization & Hue Cel-Shading)

export const ChromaBandsWGSL = `
struct ChromaBandsUniforms {
  // params0: x = bandCount (2..8), y = spatialSmoothing (0..1), z = chromaGate (0..0.5), w = hueCV (-1..1)
  params0: vec4<f32>,
  // params1: x = outlineEnabled (0 or 1), y = outlineWidth (1..8 px), z = outlineOpacity (0..1), w = aspect (w/h)
  params1: vec4<f32>,
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

// Converts RGB to YCbCr (Rec.709)
// Returns vec3<f32>(Y in 0..1, Cb in -0.5..0.5, Cr in -0.5..0.5)
fn rgbToYCbCr(rgb: vec3<f32>) -> vec3<f32> {
  let y = clamp(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let cb = (-0.2126 * rgb.r - 0.7152 * rgb.g + 0.9278 * rgb.b) / 1.8556;
  let cr = (0.7874 * rgb.r - 0.7152 * rgb.g - 0.0722 * rgb.b) / 1.5748;
  return vec3<f32>(y, cb, cr);
}

// Samples smoothed chroma (Cb, Cr) using edge-preserving bilateral filter
fn sampleSmoothedChroma(uv: vec2<f32>) -> vec3<f32> {
  let centerRgb = textureSampleLevel(videoTex, smp, uv, 0.0).rgb;
  let centerYCbCr = rgbToYCbCr(centerRgb);
  let smoothing = u.params0.y;

  if (smoothing <= 0.005) {
    return centerYCbCr;
  }

  let aspect = max(0.1, u.params1.w);
  let radius = smoothing * 0.008;
  let sigmaR = max(0.04, 0.22 - smoothing * 0.12);
  let invTwoSigmaR2 = 1.0 / (2.0 * sigmaR * sigmaR);

  var totalWeight = 1.0;
  var accumChroma = centerYCbCr;

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
    let tapYCbCr = rgbToYCbCr(tapRgb);
    let diff = length(tapYCbCr.yz - centerYCbCr.yz);
    let w = exp(-diff * diff * invTwoSigmaR2);
    accumChroma = accumChroma + tapYCbCr * w;
    totalWeight = totalWeight + w;
  }

  return accumChroma / totalWeight;
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

// Classifies chroma into one of bandCount bands (0..bandCount-1)
fn classifyChromaBand(ycbcr: vec3<f32>, bandCount: i32) -> i32 {
  let cb = ycbcr.y;
  let cr = ycbcr.z;
  let chromaMag = length(vec2<f32>(cb, cr));
  let gate = u.params0.z;

  // Below-gate chroma noise maps to base band (0)
  if (chromaMag < gate) {
    return 0;
  }

  // Calculate hue angle around chromatic circle: atan2 in [-PI, PI] mapped to [0.0, 1.0)
  let pi = 3.14159265359;
  let angle = atan2(cr, cb); // -pi..pi
  var hueNorm = (angle + pi) / (2.0 * pi); // 0.0..1.0

  // Apply hue rotation CV
  let hueCv = u.params0.w;
  hueNorm = fract(hueNorm + hueCv);

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

  let centerYCbCr = sampleSmoothedChroma(uv);
  let centerBand = classifyChromaBand(centerYCbCr, bandCount);
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

    let bL = classifyChromaBand(sampleSmoothedChroma(uv + vec2<f32>(-dx, 0.0)), bandCount);
    let bR = classifyChromaBand(sampleSmoothedChroma(uv + vec2<f32>(dx, 0.0)), bandCount);
    let bU = classifyChromaBand(sampleSmoothedChroma(uv + vec2<f32>(0.0, -dy)), bandCount);
    let bD = classifyChromaBand(sampleSmoothedChroma(uv + vec2<f32>(0.0, dy)), bandCount);

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

