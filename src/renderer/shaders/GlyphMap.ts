// WGSL Shader for GlyphMap Effect (ASCII Synthesis & Typographic Cel-Shading)

export const GlyphMapWGSL = `
struct GlyphMapUniforms {
  // params0: x = bandCount (2..8), y = mapMode (0=luma, 1=chroma, 2=upstream), z = spatialSmoothing (0..1), w = cellSize (6..64)
  params0: vec4<f32>,
  // params1: x = colorMode (0=layer, 1=video, 2=matrix, 3=amber, 4=mono, 5=inherit), y = bgMode (0=trans, 1=black, 2=dim_vid), z = dimVideoOpacity (0..1), w = aspect
  params1: vec4<f32>,
  // params2: x = chromaGate (0..0.5), y = chromaSensitivity (0.5..5.0), z = hueShift (-1..1), w = unused
  params2: vec4<f32>,
  // params3: x = gridCols, y = gridRows, z = scrollX (cols), w = scrollY (rows)
  params3: vec4<f32>,
  // params4: x = outlineEnabled (0 or 1), y = outlineWidth (px), z = outlineOpacity (0..1), w = timeSec
  params4: vec4<f32>,
  // outlineColor: RGBA
  outlineColor: vec4<f32>,
  // monochromeColor: RGBA
  monochromeColor: vec4<f32>,
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

@group(0) @binding(0) var<uniform> u: GlyphMapUniforms;
@group(0) @binding(1) var videoTex: texture_2d<f32>;
@group(0) @binding(2) var bandsTex: texture_2d<f32>;
@group(0) @binding(3) var atlasTex: texture_2d<f32>;
@group(0) @binding(4) var<storage, read> gridData: array<u32>;
@group(0) @binding(5) var smp: sampler;

struct GlyphMapOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

fn rgbToLuma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

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

// Classify Luma
fn classifyLumaBand(luma: f32, bandCount: i32) -> i32 {
  for (var i = 0; i < 7; i = i + 1) {
    if (i >= bandCount - 1) { return i; }
    if (luma <= getThreshold(i)) { return i; }
  }
  return bandCount - 1;
}

// Classify Chroma
fn classifyChromaBand(hsv: vec3<f32>, bandCount: i32) -> i32 {
  let sensitivity = max(0.1, u.params2.y);
  let sBoosted = clamp(hsv.y * sensitivity, 0.0, 1.0);
  let gate = u.params2.x;
  if (sBoosted < gate) { return 0; }

  let hueShift = u.params2.z;
  var hueNorm = fract(hsv.x + hueShift + 1.0);

  for (var i = 0; i < 7; i = i + 1) {
    if (i >= bandCount - 1) { return i; }
    if (hueNorm <= getThreshold(i)) { return i; }
  }
  return bandCount - 1;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> GlyphMapOutput {
  let bandCount = clamp(i32(u.params0.x + 0.5), 2, 8);
  let mapMode = i32(round(u.params0.y));
  let cellSize = max(6.0, u.params0.w);

  let dims = vec2<f32>(textureDimensions(videoTex));
  let canvasW = max(1.0, dims.x);
  let canvasH = max(1.0, dims.y);

  let gridCols = max(1.0, u.params3.x);
  let gridRows = max(1.0, u.params3.y);

  let px = uv.x * canvasW;
  let py = uv.y * canvasH;

  let col = clamp(i32(px / cellSize), 0, i32(gridCols) - 1);
  let row = clamp(i32(py / cellSize), 0, i32(gridRows) - 1);

  let cellCenterUV = vec2<f32>(
    (f32(col) + 0.5) * cellSize / canvasW,
    (f32(row) + 0.5) * cellSize / canvasH
  );

  let cellU = fract(px / cellSize);
  let cellV = fract(py / cellSize);

  // Determine Layer Band Index for this cell
  var bandIdx = 0;
  if (mapMode == 2) {
    // Upstream matte locked mode (matte encodes 0.0 .. 1.0)
    let mVal = textureSampleLevel(bandsTex, smp, cellCenterUV, 0.0).r;
    bandIdx = clamp(i32(round(mVal * f32(bandCount - 1))), 0, bandCount - 1);
  } else if (mapMode == 1) {
    // Internal Chroma Mode
    let rgb = textureSampleLevel(videoTex, smp, cellCenterUV, 0.0).rgb;
    let hsv = rgbToHsv(rgb);
    bandIdx = classifyChromaBand(hsv, bandCount);
  } else {
    // Internal Luma Mode (Default)
    let rgb = textureSampleLevel(videoTex, smp, cellCenterUV, 0.0).rgb;
    let luma = rgbToLuma(rgb);
    bandIdx = classifyLumaBand(luma, bandCount);
  }

  // Look up Character Code for (bandIdx, cell)
  let scrollX = i32(round(u.params3.z));
  let scrollY = i32(round(u.params3.w));
  let effCol = (col + scrollX) % i32(gridCols);
  let effRow = (row + scrollY) % i32(gridRows);
  let wrappedCol = select(effCol + i32(gridCols), effCol, effCol >= 0);
  let wrappedRow = select(effRow + i32(gridRows), effRow, effRow >= 0);

  let cellIndex = wrappedRow * i32(gridCols) + wrappedCol;
  let totalCells = i32(gridCols * gridRows);
  let charCode = gridData[bandIdx * totalCells + cellIndex];

  // Sample Font Atlas: 16 cols x 16 rows (1024x1024 texture with 64x64 px cells, ASCII 32..126)
  let charIdx = clamp(i32(charCode) - 32, 0, 94);
  let atlasCol = f32(charIdx % 16);
  let atlasRow = f32(charIdx / 16);
  let atlasUV = vec2<f32>(
    (atlasCol + cellU) / 16.0,
    (atlasRow + cellV) / 16.0
  );

  let atlasSample = textureSampleLevel(atlasTex, smp, atlasUV, 0.0);
  let glyphAlpha = clamp(atlasSample.a, 0.0, 1.0);

  // Determine Glyph Color
  let colorMode = i32(round(u.params1.x));
  var glyphColor = vec4<f32>(1.0);
  if (colorMode == 0) {
    glyphColor = getBandColor(bandIdx);
  } else if (colorMode == 1) {
    glyphColor = textureSampleLevel(videoTex, smp, cellCenterUV, 0.0);
  } else if (colorMode == 2) {
    // Matrix Green
    glyphColor = vec4<f32>(0.0, 1.0, 0.35, 1.0);
  } else if (colorMode == 3) {
    // Amber CRT
    glyphColor = vec4<f32>(1.0, 0.70, 0.05, 1.0);
  } else if (colorMode == 4) {
    // Monochrome
    glyphColor = u.monochromeColor;
  } else if (colorMode == 5) {
    // Inherited Style
    glyphColor = u.monochromeColor;
  } else if (colorMode == 6) {
    // Invert Video (high-contrast punch against background bands)
    let vidUnder = textureSampleLevel(videoTex, smp, cellCenterUV, 0.0).rgb;
    glyphColor = vec4<f32>(vec3<f32>(1.0) - vidUnder, 1.0);
  }

  // Background Compositing
  let bgMode = i32(round(u.params1.y));
  var bgColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  if (bgMode == 0) {
    // Full Upstream Video / Bands (100% Superimposed)
    bgColor = textureSampleLevel(videoTex, smp, uv, 0.0);
  } else if (bgMode == 1) {
    // Solid Black
    bgColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  } else if (bgMode == 2) {
    // Dimmed Video
    let rawVid = textureSampleLevel(videoTex, smp, uv, 0.0);
    bgColor = vec4<f32>(rawVid.rgb * u.params1.z, 1.0);
  } else {
    // Transparent (Alpha 0)
    bgColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  var finalColor = mix(bgColor, glyphColor, glyphAlpha);

  // Ink Boundary Outlines (parity with LumaBands & ChromaBands)
  let outlineEnabled = u.params4.x > 0.5;
  let outlineWidth = u.params4.y;
  let outlineOpacity = clamp(u.params4.z, 0.0, 1.0);
  let aspect = max(0.1, u.params1.w);

  if (outlineEnabled && outlineWidth > 0.05 && outlineOpacity > 0.005) {
    let rad = outlineWidth * 0.0016;
    let dx = rad / aspect;
    let dy = rad;

    var isEdge = 0.0;
    if (mapMode == 2) {
      let mL = textureSampleLevel(bandsTex, smp, uv + vec2<f32>(-dx, 0.0), 0.0).r;
      let mR = textureSampleLevel(bandsTex, smp, uv + vec2<f32>(dx, 0.0), 0.0).r;
      let mU = textureSampleLevel(bandsTex, smp, uv + vec2<f32>(0.0, -dy), 0.0).r;
      let mD = textureSampleLevel(bandsTex, smp, uv + vec2<f32>(0.0, dy), 0.0).r;

      let bL = clamp(i32(round(mL * f32(bandCount - 1))), 0, bandCount - 1);
      let bR = clamp(i32(round(mR * f32(bandCount - 1))), 0, bandCount - 1);
      let bU = clamp(i32(round(mU * f32(bandCount - 1))), 0, bandCount - 1);
      let bD = clamp(i32(round(mD * f32(bandCount - 1))), 0, bandCount - 1);

      let mCenter = textureSampleLevel(bandsTex, smp, uv, 0.0).r;
      let bCenter = clamp(i32(round(mCenter * f32(bandCount - 1))), 0, bandCount - 1);

      if (bL != bCenter || bR != bCenter || bU != bCenter || bD != bCenter) {
        isEdge = 1.0;
      }
    } else if (mapMode == 1) {
      let cCenter = classifyChromaBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv, 0.0).rgb), bandCount);
      let cL = classifyChromaBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(-dx, 0.0), 0.0).rgb), bandCount);
      let cR = classifyChromaBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(dx, 0.0), 0.0).rgb), bandCount);
      let cU = classifyChromaBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, -dy), 0.0).rgb), bandCount);
      let cD = classifyChromaBand(rgbToHsv(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, dy), 0.0).rgb), bandCount);

      if (cL != cCenter || cR != cCenter || cU != cCenter || cD != cCenter) {
        isEdge = 1.0;
      }
    } else {
      let lCenter = classifyLumaBand(rgbToLuma(textureSampleLevel(videoTex, smp, uv, 0.0).rgb), bandCount);
      let lL = classifyLumaBand(rgbToLuma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(-dx, 0.0), 0.0).rgb), bandCount);
      let lR = classifyLumaBand(rgbToLuma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(dx, 0.0), 0.0).rgb), bandCount);
      let lU = classifyLumaBand(rgbToLuma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, -dy), 0.0).rgb), bandCount);
      let lD = classifyLumaBand(rgbToLuma(textureSampleLevel(videoTex, smp, uv + vec2<f32>(0.0, dy), 0.0).rgb), bandCount);

      if (lL != lCenter || lR != lCenter || lU != lCenter || lD != lCenter) {
        isEdge = 1.0;
      }
    }

    if (isEdge > 0.5) {
      let inkAlpha = outlineOpacity * u.outlineColor.a;
      let inkRgb = u.outlineColor.rgb;
      let blendedRgb = mix(finalColor.rgb, inkRgb, inkAlpha);
      let blendedA = max(finalColor.a, inkAlpha);
      finalColor = vec4<f32>(blendedRgb, blendedA);
    }
  }

  var out: GlyphMapOutput;
  out.videoOut = finalColor;
  out.matteOut = vec4<f32>(glyphAlpha, glyphAlpha, glyphAlpha, 1.0);
  return out;
}
`;

