// WGSL Shader for LumaBands Effect (Luminance Quantization & Ink Cel-Shading)

export const LumaBandsWGSL = `
struct LumaBandsUniforms {
  // params0: x = bandCount (2..8), y = spatialSmoothing (0..1), z = feather (0..1), w = thresholdCV (-1..1)
  params0: vec4<f32>,
  // params1: x = outlineEnabled (0 or 1), y = outlineWidth (1..8 px), z = outlineOpacity (0..1), w = aspect (w/h)
  params1: vec4<f32>,
  // outlineColor: RGBA
  outlineColor: vec4<f32>,
  // thresholds0: cutoffs for bands 0..3 (normalized 0.0..1.0)
  thresholds0: vec4<f32>,
  // thresholds1: cutoffs for bands 4..7 (normalized 0.0..1.0)
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

@group(0) @binding(0) var<uniform> u: LumaBandsUniforms;
@group(0) @binding(1) var videoTex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct LumaBandsOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

fn rgbToRec709Luma(rgb: vec3<f32>) -> f32 {
  return clamp(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
}

fn sampleSmoothedLuma(uv: vec2<f32>) -> f32 {
  let centerRgb = textureSampleLevel(videoTex, smp, uv, 0.0).rgb;
  let centerLuma = rgbToRec709Luma(centerRgb);
  let smoothing = u.params0.y;

  if (smoothing <= 0.005) {
    return centerLuma;
  }

  // Edge-preserving bilateral cross-filter to flatten textures into broad solid swathes
  let aspect = max(0.1, u.params1.w);
  let radius = smoothing * 0.008;
  let sigmaR = max(0.04, 0.22 - smoothing * 0.12);
  let invTwoSigmaR2 = 1.0 / (2.0 * sigmaR * sigmaR);

  var totalWeight = 1.0;
  var accumLuma = centerLuma;

  // 8 direction taps (4 orthogonal, 4 diagonal)
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
    let tapLuma = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + offsets[i], 0.0).rgb);
    let diff = tapLuma - centerLuma;
    let w = exp(-diff * diff * invTwoSigmaR2);
    accumLuma = accumLuma + tapLuma * w;
    totalWeight = totalWeight + w;
  }

  return accumLuma / totalWeight;
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
  
  // Apply threshold_cv offset
  let cv = u.params0.w * 0.25;
  return clamp(t + cv, 0.0, 1.0);
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

fn classifyBand(luma: f32, bandCount: i32) -> i32 {
  for (var i = 0; i < 7; i = i + 1) {
    if (i >= bandCount - 1) {
      return i;
    }
    let thresh = getThreshold(i);
    if (luma <= thresh) {
      return i;
    }
  }
  return bandCount - 1;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> LumaBandsOutput {
  let bandCount = clamp(i32(u.params0.x + 0.5), 2, 8);
  let aspect = max(0.1, u.params1.w);

  let centerLuma = sampleSmoothedLuma(uv);
  let centerBand = classifyBand(centerLuma, bandCount);
  let baseColor = getBandColor(centerBand);

  var finalColor = baseColor;

  // Ink Outline: Detect boundaries where adjacent pixels belong to a different band
  let outlineEnabled = u.params1.x > 0.5;
  let outlineWidth = u.params1.y;
  let outlineOpacity = clamp(u.params1.z, 0.0, 1.0);

  if (outlineEnabled && outlineWidth > 0.05 && outlineOpacity > 0.005) {
    let rad = outlineWidth * 0.0016;
    let dx = rad / aspect;
    let dy = rad;

    let bL = classifyBand(sampleSmoothedLuma(uv + vec2<f32>(-dx, 0.0)), bandCount);
    let bR = classifyBand(sampleSmoothedLuma(uv + vec2<f32>(dx, 0.0)), bandCount);
    let bU = classifyBand(sampleSmoothedLuma(uv + vec2<f32>(0.0, -dy)), bandCount);
    let bD = classifyBand(sampleSmoothedLuma(uv + vec2<f32>(0.0, dy)), bandCount);

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

  // Matte output: Normalized integer band index for downstream masking or glyph mapping
  let matteVal = f32(centerBand) / max(1.0, f32(bandCount - 1));

  var out: LumaBandsOutput;
  out.videoOut = finalColor;
  out.matteOut = vec4<f32>(matteVal, matteVal, matteVal, 1.0);
  return out;
}
`;

