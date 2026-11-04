export const TextMakerStage1WGSL = /* wgsl */ `
struct Stage1Uniforms {
  params0: vec4<f32>,      // [aspect, timeSec, transitionMode, transitionProgress]
  params1: vec4<f32>,      // [colorFillMode, gradientDir, colorCycleSpeed, colorCv]
  params2: vec4<f32>,      // [headerOverrideEnabled, headerSplitV, startV, lineStepV]
  bounds: vec4<f32>,       // [minU, minV, maxU, maxV]
  edgeFlags: vec4<f32>,    // [outlineEnabled, outlineWidth, shadowEnabled, shadowAmount]
  edgeParams: vec4<f32>,   // [shadowAngleRad, extrudeEnabled, extrudeAmount, extrudeAngleRad]
  glowParams: vec4<f32>,   // [glowEnabled, glowAmount, useCustomPalette, palCount]
  palMeta: vec4<f32>,      // [palInterpolation, lineCount, 0, 0]
  textColor: vec4<f32>,
  textColorB: vec4<f32>,
  headerColor: vec4<f32>,
  outlineColor: vec4<f32>,
  shadowColor: vec4<f32>,
  extrudeColor: vec4<f32>,
  glowColor: vec4<f32>,
  palColors: array<vec4<f32>, 8>,
  palPositions: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> u: Stage1Uniforms;
@group(0) @binding(1) var currTex: texture_2d<f32>;
@group(0) @binding(2) var prevTex: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

fn getPalPos(idx: i32) -> f32 {
  if (idx < 4) {
    return u.palPositions[0][idx];
  }
  return u.palPositions[1][idx - 4];
}

fn samplePalette(tRaw: f32) -> vec4<f32> {
  let count = i32(u.glowParams.w);
  if (count <= 0) {
    return u.textColor;
  }
  if (count == 1) {
    return u.palColors[0];
  }
  let t = clamp(tRaw, 0.0, 1.0);
  let interp = i32(u.palMeta.x);

  for (var i = 0; i < 7; i = i + 1) {
    if (i + 1 >= count) {
      break;
    }
    let p0 = getPalPos(i);
    let p1 = getPalPos(i + 1);
    if (t >= p0 && t <= p1) {
      let span = max(0.0001, p1 - p0);
      var localT = clamp((t - p0) / span, 0.0, 1.0);
      if (interp == 1) {
        // Stepped hardware palette
        return u.palColors[i];
      } else if (interp == 2) {
        // Smoothstep
        localT = localT * localT * (3.0 - 2.0 * localT);
      }
      return mix(u.palColors[i], u.palColors[i + 1], localT);
    }
  }
  return u.palColors[count - 1];
}

fn shiftHue(col: vec3<f32>, shift: f32) -> vec3<f32> {
  if (abs(shift) < 0.001) {
    return col;
  }
  let k = vec3<f32>(0.57735, 0.57735, 0.57735);
  let angle = shift * 6.2831853;
  let cosA = cos(angle);
  return clamp(col * cosA + cross(k, col) * sin(angle) + k * dot(k, col) * (1.0 - cosA), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn evaluateFaceColor(uv: vec2<f32>) -> vec4<f32> {
  let aspect = max(0.1, u.params0.x);
  let timeSec = u.params0.y;
  let fillMode = i32(u.params1.x);
  let gradDir = i32(u.params1.y);
  let cycleSpeed = u.params1.z;
  let colorCv = u.params1.w;

  let headerOverride = u.params2.x > 0.5;
  let headerSplitV = u.params2.y;
  let startV = u.params2.z;
  let lineStepV = max(0.01, u.params2.w);
  let lineCount = max(1.0, u.palMeta.y);

  let isHeader = headerOverride && (uv.y < headerSplitV);
  if (isHeader && u.glowParams.z < 0.5) {
    let hRgb = shiftHue(u.headerColor.rgb, colorCv);
    return vec4<f32>(hRgb, u.headerColor.a);
  }

  let lineV = fract(max(0.0, uv.y - startV) / lineStepV);
  let blockV = clamp((uv.y - u.bounds.y) / max(0.01, u.bounds.w - u.bounds.y), 0.0, 1.0);
  let blockU = clamp((uv.x - u.bounds.x) / max(0.01, u.bounds.z - u.bounds.x), 0.0, 1.0);

  var gradT = lineV;
  if (gradDir == 1) {
    gradT = blockV;
  } else if (gradDir == 2) {
    gradT = blockU;
  }

  if (u.glowParams.z > 0.5) {
    // External ColorPalette connected via palette_in (honoring stop weights and order)
    if (fillMode == 1) {
      // Weighted Spatial Gradient
      return samplePalette(fract(gradT + colorCv));
    } else if (fillMode == 2) {
      // Weighted Color Cycle (stop weights control dwell proportion)
      let cycleT = fract(timeSec * cycleSpeed + colorCv + blockV * 0.25);
      return samplePalette(cycleT);
    } else if (fillMode == 3) {
      // Per-Line Step through ordered palette stops
      let lineIdx = floor(max(0.0, uv.y - startV) / lineStepV);
      let stepT = clamp(lineIdx / max(1.0, lineCount - 1.0), 0.0, 1.0);
      return samplePalette(fract(stepT + colorCv));
    } else {
      // Solid mode with palette: uses primary stop or scrubs via color_cv
      return samplePalette(fract(colorCv));
    }
  }

  // Internal Videonics color swatches
  if (fillMode == 1) {
    let c = mix(u.textColor, u.textColorB, gradT);
    return vec4<f32>(shiftHue(c.rgb, colorCv), c.a);
  } else if (fillMode == 2) {
    let phase = fract(timeSec * cycleSpeed + colorCv + blockU * 0.2 + blockV * 0.2);
    return vec4<f32>(shiftHue(u.textColor.rgb, phase), u.textColor.a);
  } else if (fillMode == 3) {
    let lineIdx = i32(floor(max(0.0, uv.y - startV) / lineStepV));
    let baseC = select(u.textColor, u.textColorB, (lineIdx % 2) == 1);
    return vec4<f32>(shiftHue(baseC.rgb, colorCv), baseC.a);
  }
  return vec4<f32>(shiftHue(u.textColor.rgb, colorCv), u.textColor.a);
}

fn overPremult(dst: vec4<f32>, srcPremult: vec4<f32>) -> vec4<f32> {
  return srcPremult + dst * (1.0 - srcPremult.a);
}

fn sampleGlyphAlpha(tex: texture_2d<f32>, uv: vec2<f32>) -> f32 {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }
  return textureSampleLevel(tex, smp, uv, 0.0).a;
}

fn renderStyledGlyphs(tex: texture_2d<f32>, uv: vec2<f32>) -> vec4<f32> {
  let aspect = max(0.1, u.params0.x);
  let outlineEnabled = u.edgeFlags.x > 0.5;
  let outlineWidth = u.edgeFlags.y;
  let shadowEnabled = u.edgeFlags.z > 0.5;
  let shadowAmount = clamp(u.edgeFlags.w, 0.0, 1.5);

  let shadowAngle = u.edgeParams.x;
  let extrudeEnabled = u.edgeParams.y > 0.5;
  let extrudeAmount = clamp(u.edgeParams.z, 0.0, 1.5);
  let extrudeAngle = u.edgeParams.w;

  let glowEnabled = u.glowParams.x > 0.5;
  let glowAmount = clamp(u.glowParams.y, 0.0, 1.5);

  var acc = vec4<f32>(0.0, 0.0, 0.0, 0.0);

  // 1. Neon Glow (Multi-ring 12-tap Kawase/Gaussian bloom)
  if (glowEnabled && glowAmount > 0.005) {
    let rad = glowAmount * 0.028;
    var glowSum = 0.0;
    for (var i = 0; i < 8; i = i + 1) {
      let ang = f32(i) * 0.78539816;
      let dir = vec2<f32>(cos(ang) / aspect, sin(ang));
      glowSum = glowSum + sampleGlyphAlpha(tex, uv + dir * rad * 0.5) * 0.14;
      glowSum = glowSum + sampleGlyphAlpha(tex, uv + dir * rad) * 0.08;
    }
    let gAlpha = clamp(glowSum * glowAmount * 1.25, 0.0, 1.0) * u.glowColor.a;
    acc = overPremult(acc, vec4<f32>(u.glowColor.rgb * gAlpha, gAlpha));
  }

  // 2. Drop Shadow (Directional offset + soft 5-tap filter)
  if (shadowEnabled && shadowAmount > 0.005) {
    let sDir = vec2<f32>(cos(shadowAngle) / aspect, sin(shadowAngle));
    let sDist = shadowAmount * 0.025;
    let sCenter = uv - sDir * sDist;
    let spread = 0.0018;
    let sA = (
      sampleGlyphAlpha(tex, sCenter) * 0.4 +
      sampleGlyphAlpha(tex, sCenter + vec2<f32>(spread, 0.0)) * 0.15 +
      sampleGlyphAlpha(tex, sCenter - vec2<f32>(spread, 0.0)) * 0.15 +
      sampleGlyphAlpha(tex, sCenter + vec2<f32>(0.0, spread)) * 0.15 +
      sampleGlyphAlpha(tex, sCenter - vec2<f32>(0.0, spread)) * 0.15
    );
    let shadAlpha = clamp(sA * min(1.0, shadowAmount * 1.4), 0.0, 1.0) * u.shadowColor.a;
    acc = overPremult(acc, vec4<f32>(u.shadowColor.rgb * shadAlpha, shadAlpha));
  }

  // 3. 3D Extrude / Bevel (Directional ray-march with bevel shading)
  if (extrudeEnabled && extrudeAmount > 0.005) {
    let eDir = vec2<f32>(cos(extrudeAngle) / aspect, sin(extrudeAngle));
    let maxDist = extrudeAmount * 0.032;
    var hitAlpha = 0.0;
    var hitStep = 1.0;
    for (var s = 1; s <= 10; s = s + 1) {
      let frac = f32(s) / 10.0;
      let a = sampleGlyphAlpha(tex, uv - eDir * maxDist * frac);
      if (a > hitAlpha) {
        hitAlpha = a;
        hitStep = frac;
      }
    }
    if (hitAlpha > 0.01) {
      // Shade extruded side with depth gradient for authentic 3D bevel look
      let shade = mix(1.25, 0.55, hitStep);
      let extRgb = clamp(u.extrudeColor.rgb * shade, vec3<f32>(0.0), vec3<f32>(1.0));
      let extA = hitAlpha * u.extrudeColor.a;
      acc = overPremult(acc, vec4<f32>(extRgb * extA, extA));
    }
  }

  // 4. Hard Outline (8-tap dilation border)
  if (outlineEnabled && outlineWidth > 0.005) {
    let oRad = outlineWidth * 0.009;
    var maxNeighbor = 0.0;
    for (var i = 0; i < 8; i = i + 1) {
      let ang = f32(i) * 0.78539816;
      let offset = vec2<f32>(cos(ang) / aspect, sin(ang)) * oRad;
      maxNeighbor = max(maxNeighbor, sampleGlyphAlpha(tex, uv + offset));
    }
    let outA = clamp(maxNeighbor * 1.2, 0.0, 1.0) * u.outlineColor.a;
    acc = overPremult(acc, vec4<f32>(u.outlineColor.rgb * outA, outA));
  }

  // 5. Primary Character Face
  let faceMask = sampleGlyphAlpha(tex, uv);
  if (faceMask > 0.001) {
    let faceCol = evaluateFaceColor(uv);
    let fA = faceMask * faceCol.a;
    acc = overPremult(acc, vec4<f32>(faceCol.rgb * fA, fA));
  }

  return acc;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let transMode = i32(u.params0.z);
  let p = clamp(u.params0.w, 0.0, 1.0);

  if (p >= 0.999 || transMode == 0 || transMode == 3) {
    return renderStyledGlyphs(currTex, uv);
  }

  if (transMode == 1) {
    // Crossfade (pure premultiplied alpha interpolation -> zero black dip)
    let prevCol = renderStyledGlyphs(prevTex, uv);
    let currCol = renderStyledGlyphs(currTex, uv);
    return prevCol * (1.0 - p) + currCol * p;
  }

  if (transMode == 2) {
    // Fade Out -> Fade In (fades through 100% transparent, never black)
    if (p < 0.5) {
      let outAlpha = clamp(1.0 - p * 2.0, 0.0, 1.0);
      return renderStyledGlyphs(prevTex, uv) * outAlpha;
    } else {
      let inAlpha = clamp((p - 0.5) * 2.0, 0.0, 1.0);
      return renderStyledGlyphs(currTex, uv) * inAlpha;
    }
  }

  if (transMode == 4) {
    // Directional Wipe Left-to-Right
    let soft = 0.04;
    let mask = smoothstep(p - soft, p + soft, uv.x);
    let currCol = renderStyledGlyphs(currTex, uv);
    let prevCol = renderStyledGlyphs(prevTex, uv);
    return mix(currCol, prevCol, mask);
  }

  if (transMode == 5) {
    // Venetian Blinds (12 horizontal slats)
    let slat = fract(uv.y * 12.0);
    let mask = step(p, slat);
    let currCol = renderStyledGlyphs(currTex, uv);
    let prevCol = renderStyledGlyphs(prevTex, uv);
    return mix(currCol, prevCol, mask);
  }

  if (transMode == 6) {
    // Slide / Push Up
    let prevUV = vec2<f32>(uv.x, uv.y + p);
    let currUV = vec2<f32>(uv.x, uv.y - (1.0 - p));
    var res = vec4<f32>(0.0);
    if (prevUV.y >= 0.0 && prevUV.y <= 1.0) {
      res = renderStyledGlyphs(prevTex, prevUV);
    }
    if (currUV.y >= 0.0 && currUV.y <= 1.0) {
      res = overPremult(res, renderStyledGlyphs(currTex, currUV));
    }
    return res;
  }

  return renderStyledGlyphs(currTex, uv);
}
`;

export const TextMakerStage2WGSL = /* wgsl */ `
struct Stage2Uniforms {
  layoutParams: vec4<f32>,   // [layoutMode, posX, posY, scrollOffset]
  bounds: vec4<f32>,         // [minU, minV, maxU, maxV]
  lineMetrics: vec4<f32>,    // [startV, lineStepV, lineCount, backdropMode]
  backdropCol: vec4<f32>,    // RGBA
  borderCol: vec4<f32>,      // RGBA
  bgParams: vec4<f32>,       // [backdropBorderWidth, bgMode, hasVideoIn, aspect]
  bgColorA: vec4<f32>,
  bgColorB: vec4<f32>,
  analogFlags: vec4<f32>,    // [analogFxMaster, pixelateEnabled, chromaBleedEnabled, scanlinesEnabled]
  analogAmounts: vec4<f32>,  // [pixelateAmount, chromaBleedAmount, scanlinesAmount, jitterAmount]
  analogExtra: vec4<f32>,    // [jitterEnabled, noiseEnabled, noiseAmount, timeSec]
};

struct Stage2Output {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Stage2Uniforms;
@group(0) @binding(1) var plateTex: texture_2d<f32>;
@group(0) @binding(2) var videoInTex: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn overPremult(dst: vec4<f32>, srcPremult: vec4<f32>) -> vec4<f32> {
  return srcPremult + dst * (1.0 - srcPremult.a);
}

fn renderInternalBg(uv: vec2<f32>) -> vec4<f32> {
  let bgMode = i32(u.bgParams.y);
  if (bgMode == 0) {
    // Transparent (default when no video_in is connected)
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
  if (bgMode == 1) {
    // Solid color
    return vec4<f32>(u.bgColorA.rgb * u.bgColorA.a, u.bgColorA.a);
  }
  if (bgMode == 2) {
    // Classic 90s two-tone vertical horizon gradient
    let c = mix(u.bgColorA, u.bgColorB, uv.y);
    return vec4<f32>(c.rgb * c.a, c.a);
  }
  // SMPTE / Videonics Color Bars (bgMode == 3)
  let barIdx = i32(clamp(floor(uv.x * 7.0), 0.0, 6.0));
  var barRgb = vec3<f32>(0.75, 0.75, 0.75);
  if (barIdx == 1) { barRgb = vec3<f32>(0.75, 0.75, 0.0); }
  else if (barIdx == 2) { barRgb = vec3<f32>(0.0, 0.75, 0.75); }
  else if (barIdx == 3) { barRgb = vec3<f32>(0.0, 0.75, 0.0); }
  else if (barIdx == 4) { barRgb = vec3<f32>(0.75, 0.0, 0.75); }
  else if (barIdx == 5) { barRgb = vec3<f32>(0.75, 0.0, 0.0); }
  else if (barIdx == 6) { barRgb = vec3<f32>(0.0, 0.0, 0.75); }
  return vec4<f32>(barRgb, 1.0);
}

fn mapPlateUV(uv: vec2<f32>) -> vec2<f32> {
  let layoutMode = i32(u.layoutParams.x);
  let posX = u.layoutParams.y;
  let posY = u.layoutParams.z;
  let scrollOffset = u.layoutParams.w;

  if (layoutMode == 1) {
    // Lower Third placement (shifted to bottom safe zone + user offset)
    return vec2<f32>(uv.x - posX * 0.4, uv.y - 0.28 - posY * 0.4);
  }
  if (layoutMode == 2) {
    // Vertical Roll (wraps vertically)
    return vec2<f32>(uv.x - posX * 0.4, fract(uv.y + scrollOffset));
  }
  if (layoutMode == 3) {
    // Horizontal Crawl / Ticker (single line at posY)
    return vec2<f32>(fract(uv.x + scrollOffset), uv.y - posY * 0.4);
  }
  // Standard Page mode
  return vec2<f32>(uv.x - posX * 0.45, uv.y - posY * 0.45);
}

fn evaluateBackdrop(plateUV: vec2<f32>, screenUV: vec2<f32>) -> vec4<f32> {
  let backdropMode = i32(u.lineMetrics.w);
  if (backdropMode == 0 || u.lineMetrics.z < 0.5) {
    return vec4<f32>(0.0);
  }
  let borderW = u.bgParams.x * 0.012;
  let aspect = max(0.1, u.bgParams.w);
  let bWx = borderW / aspect;
  let bWy = borderW;

  let minU = u.bounds.x;
  let minV = u.bounds.y;
  let maxU = u.bounds.z;
  let maxV = u.bounds.w;

  if (backdropMode == 1) {
    // Tight Box around the text block
    if (plateUV.x >= minU - bWx && plateUV.x <= maxU + bWx && plateUV.y >= minV - bWy && plateUV.y <= maxV + bWy) {
      let isBorder = borderW > 0.0005 && (
        plateUV.x < minU || plateUV.x > maxU || plateUV.y < minV || plateUV.y > maxV
      );
      let c = select(u.backdropCol, u.borderCol, isBorder);
      return vec4<f32>(c.rgb * c.a, c.a);
    }
    return vec4<f32>(0.0);
  }

  if (backdropMode == 2) {
    // Full-Width Horizontal Banner
    if (plateUV.y >= minV - bWy && plateUV.y <= maxV + bWy) {
      let isBorder = borderW > 0.0005 && (plateUV.y < minV || plateUV.y > maxV);
      let c = select(u.backdropCol, u.borderCol, isBorder);
      return vec4<f32>(c.rgb * c.a, c.a);
    }
    return vec4<f32>(0.0);
  }

  if (backdropMode == 3) {
    // Individual Line Strips
    let startV = u.lineMetrics.x;
    let stepV = max(0.01, u.lineMetrics.y);
    let count = u.lineMetrics.z;
    let relV = plateUV.y - startV;
    let lineIdx = floor(relV / stepV);
    let localV = fract(relV / stepV);
    if (lineIdx >= 0.0 && lineIdx < count && plateUV.x >= minU - bWx && plateUV.x <= maxU + bWx && localV >= 0.08 && localV <= 0.92) {
      let isBorder = borderW > 0.0005 && (localV < 0.16 || localV > 0.84 || plateUV.x < minU || plateUV.x > maxU);
      let c = select(u.backdropCol, u.borderCol, isBorder);
      return vec4<f32>(c.rgb * c.a, c.a);
    }
  }

  return vec4<f32>(0.0);
}

fn sampleTitleForeground(screenUV: vec2<f32>) -> vec4<f32> {
  let plateUV = mapPlateUV(screenUV);
  let boxPremult = evaluateBackdrop(plateUV, screenUV);
  var textPremult = vec4<f32>(0.0);
  if (plateUV.x >= 0.0 && plateUV.x <= 1.0 && plateUV.y >= 0.0 && plateUV.y <= 1.0) {
    textPremult = textureSampleLevel(plateTex, smp, plateUV, 0.0);
  }
  return overPremult(boxPremult, textPremult);
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> Stage2Output {
  let masterFx = u.analogFlags.x > 0.5;
  let pixOn = masterFx && (u.analogFlags.y > 0.5) && (u.analogAmounts.x > 0.005);
  let bleedOn = masterFx && (u.analogFlags.z > 0.5) && (u.analogAmounts.y > 0.005);
  let scanOn = masterFx && (u.analogFlags.w > 0.5) && (u.analogAmounts.z > 0.005);
  let jitterOn = masterFx && (u.analogExtra.x > 0.5) && (u.analogAmounts.w > 0.005);
  let noiseOn = masterFx && (u.analogExtra.y > 0.5) && (u.analogExtra.z > 0.005);
  let timeSec = u.analogExtra.w;

  var workUV = uv;

  // 1. H-Sync Jitter / VHS Line Tear
  if (jitterOn) {
    let jAmt = u.analogAmounts.w;
    let scanY = floor(workUV.y * 240.0);
    let lineNoise = hash12(vec2<f32>(scanY, floor(timeSec * 30.0))) * 2.0 - 1.0;
    let tearBand = smoothstep(0.85, 1.0, sin(workUV.y * 12.0 - timeSec * 4.5));
    workUV.x = workUV.x + (lineNoise * 0.004 + tearBand * lineNoise * 0.018) * jAmt;
  }

  // 2. Pixel Grid / Hardware Era Downsample (320x200 / 320x240 TitleMaker grid)
  if (pixOn) {
    let pAmt = u.analogAmounts.x;
    let gridY = mix(720.0, 180.0, clamp(pAmt, 0.0, 1.0));
    let gridX = gridY * max(1.0, u.bgParams.w);
    workUV = (floor(workUV * vec2<f32>(gridX, gridY)) + vec2<f32>(0.5)) / vec2<f32>(gridX, gridY);
  }

  // 3. Sample Title Foreground + Optional NTSC Chroma Bleed / Smear
  var fg = sampleTitleForeground(workUV);
  if (bleedOn) {
    let bAmt = u.analogAmounts.y * 0.018;
    let fgL = sampleTitleForeground(workUV - vec2<f32>(bAmt, 0.0));
    let fgL2 = sampleTitleForeground(workUV - vec2<f32>(bAmt * 2.0, 0.0));
    let fgR = sampleTitleForeground(workUV + vec2<f32>(bAmt * 0.6, 0.0));
    // Horizontal chroma smear trailing to the right of bright edges
    let smearedR = fg.r * 0.55 + fgL.r * 0.30 + fgL2.r * 0.15;
    let smearedB = fg.b * 0.55 + fgR.b * 0.30 + fgL.b * 0.15;
    let smearedA = max(fg.a, (fgL.a * 0.45 + fgL2.a * 0.2) * u.analogAmounts.y);
    fg = vec4<f32>(smearedR, fg.g, smearedB, smearedA);
  }

  // 4. Composite over External Video (Genlock) or Internal Background
  var bg = renderInternalBg(uv);
  if (u.bgParams.z > 0.5) {
    bg = textureSampleLevel(videoInTex, smp, uv, 0.0);
  }

  var comp = overPremult(bg, fg);

  // 5. CRT Scanlines & Analog Luma Snow (applied where composite has visibility)
  if (scanOn && comp.a > 0.001) {
    let sAmt = u.analogAmounts.z;
    let scanWave = 0.5 + 0.5 * sin(uv.y * 480.0 * 3.14159265);
    let scanFactor = mix(1.0, 0.65 + 0.35 * scanWave, sAmt);
    comp = vec4<f32>(comp.rgb * scanFactor, comp.a);
  }

  if (noiseOn && comp.a > 0.001) {
    let nAmt = u.analogExtra.z;
    let grain = (hash12(uv * 512.0 + vec2<f32>(timeSec * 71.3, timeSec * 19.7)) - 0.5) * 0.28 * nAmt;
    comp = vec4<f32>(clamp(comp.rgb + vec3<f32>(grain * comp.a), vec3<f32>(0.0), vec3<f32>(1.0)), comp.a);
  }

  let matteVal = clamp(fg.a, 0.0, 1.0);
  var out: Stage2Output;
  out.videoOut = comp;
  out.matteOut = vec4<f32>(matteVal, matteVal, matteVal, 1.0);
  return out;
}
`;

