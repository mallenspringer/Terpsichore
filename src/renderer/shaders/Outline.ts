// WGSL Shader for Outline Effect (Contour & Edge Synthesizer)

export const OutlineWGSL = `
struct OutlineUniforms {
  // params0: x = edgeMode (0..4), y = bandCount (2..8), z = lineWidth (1..16 px), w = lineOpacity (0..1)
  params0: vec4<f32>,
  // params1: x = bgMode (0..3), y = colorMode (0..2), z = threshold (0..1), w = aspect (w/h)
  params1: vec4<f32>,
  // params2: x = timeSec, y = spatialSmoothing (0..1), z = analogDirection (0 = horiz, 1 = vert), w = pulseActive (0 or 1)
  params2: vec4<f32>,
  // params3: x = pulseAmount (0..4), y = pulseSpeed (-5..5), z = pulseFreq (0.2..12), w = pulseMode (0..3)
  params3: vec4<f32>,
  // lineColor: RGBA
  lineColor: vec4<f32>,
  // 8 Palette Colors
  color0: vec4<f32>,
  color1: vec4<f32>,
  color2: vec4<f32>,
  color3: vec4<f32>,
  color4: vec4<f32>,
  color5: vec4<f32>,
  color6: vec4<f32>,
  color7: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: OutlineUniforms;
@group(0) @binding(1) var videoTex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct OutlineOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

fn rgbToRec709Luma(rgb: vec3<f32>) -> f32 {
  return clamp(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
}

fn rgbToHsv(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn sampleSmoothedLuma(uv: vec2<f32>) -> f32 {
  let centerRgb = textureSampleLevel(videoTex, smp, uv, 0.0).rgb;
  let centerLuma = rgbToRec709Luma(centerRgb);
  let smoothing = u.params2.y;

  if (smoothing <= 0.005) {
    return centerLuma;
  }

  let aspect = max(0.1, u.params1.w);
  let radius = smoothing * 0.008;
  let sigmaR = max(0.04, 0.22 - smoothing * 0.12);
  let invTwoSigmaR2 = 1.0 / (2.0 * sigmaR * sigmaR);

  var totalWeight = 1.0;
  var accumLuma = centerLuma;

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

fn classifyLumaBand(luma: f32, count: i32) -> i32 {
  let stepVal = 1.0 / f32(count);
  let idx = clamp(i32(floor(luma / stepVal)), 0, count - 1);
  return idx;
}

fn classifyHueBand(hsv: vec3<f32>, count: i32) -> i32 {
  // If saturation is extremely low (grayscale), assign to neutral sector
  if (hsv.y < 0.04) {
    return 0;
  }
  let stepVal = 1.0 / f32(count);
  return clamp(i32(floor(hsv.x / stepVal)), 0, count - 1);
}

fn getPaletteColor(idx: i32) -> vec4<f32> {
  let i = idx % 8;
  if (i == 0) { return u.color0; }
  if (i == 1) { return u.color1; }
  if (i == 2) { return u.color2; }
  if (i == 3) { return u.color3; }
  if (i == 4) { return u.color4; }
  if (i == 5) { return u.color5; }
  if (i == 6) { return u.color6; }
  return u.color7;
}

struct DetectionResult {
  edge: f32,       // 0.0 .. 1.0 edge intensity
  bandIndex: i32,  // Classified band index (for palette lookup)
  angle: f32,      // Gradient tangent angle theta in radians (-PI..PI)
};

fn getPulseMultiplier(uv: vec2<f32>, approxAngle: f32) -> f32 {
  if (u.params2.w < 0.5) {
    return 1.0;
  }
  let amount = max(0.0, u.params3.x);
  if (amount <= 0.001) {
    return 1.0;
  }
  let speed = u.params3.y;
  let freq = max(0.2, u.params3.z);
  let mode = i32(u.params3.w + 0.5);
  let time = u.params2.x * speed;
  let aspect = max(0.1, u.params1.w);

  var phase = 0.0;
  if (mode == 0) {
    // Contour Flow: travels around silhouette / contour perimeter
    let p = uv - vec2<f32>(0.5, 0.5);
    let polar = atan2(p.y, p.x * aspect);
    phase = (polar + approxAngle * 0.5) * freq + time * 6.28318;
  } else if (mode == 1) {
    // Radial Ripple: concentric rings radiating from center
    let p = uv - vec2<f32>(0.5, 0.5);
    let r = length(vec2<f32>(p.x * aspect, p.y));
    phase = r * freq * 12.56637 - time * 6.28318;
  } else if (mode == 2) {
    // Horizontal Sweep: left to right
    phase = uv.x * freq * 6.28318 - time * 6.28318;
  } else {
    // Vertical Sweep: top to bottom
    phase = uv.y * freq * 6.28318 - time * 6.28318;
  }

  // Graduated wave profile: cosine squared for smooth bell swell
  let wave = cos(phase) * 0.5 + 0.5;
  let bell = wave * wave;
  return 1.0 + amount * bell;
}

fn detectEdges(uv: vec2<f32>) -> DetectionResult {
  let edgeMode = i32(u.params0.x + 0.5);
  let bandCount = clamp(i32(u.params0.y + 0.5), 2, 8);
  let baseLineWidth = max(0.5, u.params0.z);
  let aspect = max(0.1, u.params1.w);
  let thresh = max(0.01, u.params1.z);

  let pVec = uv - vec2<f32>(0.5, 0.5);
  let approxAngle = atan2(pVec.y, pVec.x * aspect);
  let pulseMul = getPulseMultiplier(uv, approxAngle);
  let lineWidth = baseLineWidth * pulseMul;

  let rad = lineWidth * 0.0016;
  let dx = rad / aspect;
  let dy = rad;

  var res: DetectionResult;
  res.edge = 0.0;
  res.bandIndex = 0;
  res.angle = 0.0;

  // 1. Luma Bands Mode (0)
  if (edgeMode == 0) {
    let centerLuma = sampleSmoothedLuma(uv);
    let centerBand = classifyLumaBand(centerLuma, bandCount);
    res.bandIndex = centerBand;

    let bL = classifyLumaBand(sampleSmoothedLuma(uv + vec2<f32>(-dx, 0.0)), bandCount);
    let bR = classifyLumaBand(sampleSmoothedLuma(uv + vec2<f32>(dx, 0.0)), bandCount);
    let bU = classifyLumaBand(sampleSmoothedLuma(uv + vec2<f32>(0.0, -dy)), bandCount);
    let bD = classifyLumaBand(sampleSmoothedLuma(uv + vec2<f32>(0.0, dy)), bandCount);

    if (bL != centerBand || bR != centerBand || bU != centerBand || bD != centerBand) {
      res.edge = 1.0;
    }
    let gx = f32(bR - bL);
    let gy = f32(bD - bU);
    res.angle = atan2(gy, gx);
    return res;
  }

  // 2. Chroma Bands Mode (1)
  if (edgeMode == 1) {
    let centerRgb = textureSampleLevel(videoTex, smp, uv, 0.0).rgb;
    let centerHsv = rgbToHsv(centerRgb);
    let centerBand = classifyHueBand(centerHsv, bandCount);
    res.bandIndex = centerBand;

    let hL = classifyHueBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(-dx, 0.0), 0.0).rgb), bandCount);
    let hR = classifyHueBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(dx, 0.0), 0.0).rgb), bandCount);
    let hU = classifyHueBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, -dy), 0.0).rgb), bandCount);
    let hD = classifyHueBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, dy), 0.0).rgb), bandCount);

    if (hL != centerBand || hR != centerBand || hU != centerBand || hD != centerBand) {
      res.edge = 1.0;
    }
    let gx = f32(hR - hL);
    let gy = f32(hD - hU);
    res.angle = atan2(gy, gx);
    return res;
  }

  // 3. Focus Peaking Mode (2) - Sobel Gradient High-Pass
  if (edgeMode == 2) {
    let tl = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(-dx, -dy), 0.0).rgb);
    let tc = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, -dy), 0.0).rgb);
    let tr = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(dx, -dy), 0.0).rgb);
    let ml = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(-dx, 0.0), 0.0).rgb);
    let mr = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(dx, 0.0), 0.0).rgb);
    let bl = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(-dx, dy), 0.0).rgb);
    let bc = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, dy), 0.0).rgb);
    let br = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(dx, dy), 0.0).rgb);

    let gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
    let gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
    let mag = sqrt(gx * gx + gy * gy) * 0.25;

    let cutoff = thresh * 0.4;
    res.edge = smoothstep(cutoff, cutoff + 0.12, mag);
    res.angle = atan2(gy, gx);
    res.bandIndex = clamp(i32(floor(mag * f32(bandCount))), 0, bandCount - 1);
    return res;
  }

  // 4. Manga DoG Mode (3) - Difference of Gaussians
  if (edgeMode == 3) {
    let lumaTight = sampleSmoothedLuma(uv);
    // Sample wide neighborhood
    let wDx = dx * 2.4;
    let wDy = dy * 2.4;
    let lW1 = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(-wDx, 0.0), 0.0).rgb);
    let lW2 = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(wDx, 0.0), 0.0).rgb);
    let lW3 = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, -wDy), 0.0).rgb);
    let lW4 = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, wDy), 0.0).rgb);
    let lumaWide = (lW1 + lW2 + lW3 + lW4) * 0.25;

    let diff = abs(lumaTight - lumaWide);
    let cutoff = thresh * 0.12;
    res.edge = smoothstep(cutoff, cutoff + 0.08, diff * 3.5);
    let gx = lW2 - lW1;
    let gy = lW4 - lW3;
    res.angle = atan2(gy, gx);
    res.bandIndex = clamp(i32(floor(diff * 8.0)), 0, 7);
    return res;
  }

  // 5. Analog Differentiator Mode (4) - Scanline Derivative
  let isVertical = u.params2.z > 0.5;
  var d = 0.0;
  if (!isVertical) {
    let left = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv - vec2<f32>(dx * 1.5, 0.0), 0.0).rgb);
    let right = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(dx * 1.5, 0.0), 0.0).rgb);
    d = (right - left) * 2.5;
    res.angle = select(3.14159, 0.0, d >= 0.0);
  } else {
    let top = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv - vec2<f32>(0.0, dy * 1.5), 0.0).rgb);
    let btm = rgbToRec709Luma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, dy * 1.5), 0.0).rgb);
    d = (btm - top) * 2.5;
    res.angle = select(-1.57079, 1.57079, d >= 0.0);
  }

  let cutoff = thresh * 0.15;
  res.edge = smoothstep(cutoff, cutoff + 0.1, abs(d));
  res.bandIndex = clamp(i32(floor(abs(d) * 4.0)), 0, 7);
  return res;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> OutlineOutput {
  let videoSample = textureSampleLevel(videoTex, smp, uv, 0.0);
  let detection = detectEdges(uv);

  let bgMode = i32(u.params1.x + 0.5);
  let colorMode = i32(u.params1.y + 0.5);
  let opacity = clamp(u.params0.w, 0.0, 1.0);

  // Determine line color
  var strokeColor = u.lineColor;
  if (colorMode == 1) {
    // Palette In: map by bandIndex or gradient angle
    let bandCount = clamp(i32(u.params0.y + 0.5), 2, 8);
    let edgeMode = i32(u.params0.x + 0.5);
    if (edgeMode == 0 || edgeMode == 1) {
      strokeColor = getPaletteColor(detection.bandIndex);
    } else {
      // Continuous angle mapping across 8 palette entries
      let normAngle = (detection.angle + 3.14159265) / 6.2831853;
      let angleSlot = clamp(i32(floor(normAngle * 8.0)), 0, 7);
      strokeColor = getPaletteColor(angleSlot);
    }
  } else if (colorMode == 2) {
    // Sample Video: colorize using underlying video RGB
    strokeColor = vec4<f32>(videoSample.rgb, 1.0);
  }

  let lineAlpha = detection.edge * opacity * strokeColor.a;

  var finalColor = videoSample;

  // 0. Over Video (Ink - Multiply/Darken)
  if (bgMode == 0) {
    let blendedRgb = mix(videoSample.rgb, strokeColor.rgb, lineAlpha);
    let blendedA = max(videoSample.a, lineAlpha);
    finalColor = vec4<f32>(blendedRgb, blendedA);
  }
  // 1. Over Video (Neon / Glow - Additive Screen)
  else if (bgMode == 1) {
    let neonRgb = videoSample.rgb + strokeColor.rgb * lineAlpha;
    let blendedA = max(videoSample.a, lineAlpha);
    finalColor = vec4<f32>(neonRgb, blendedA);
  }
  // 2. Lines Only (Transparent Alpha)
  else if (bgMode == 2) {
    finalColor = vec4<f32>(strokeColor.rgb, lineAlpha);
  }
  // 3. Lines Only (Black Background)
  else if (bgMode == 3) {
    finalColor = vec4<f32>(strokeColor.rgb * lineAlpha, 1.0);
  }

  var out: OutlineOutput;
  out.videoOut = finalColor;
  out.matteOut = vec4<f32>(detection.edge, detection.edge, detection.edge, 1.0);
  return out;
}
`;

