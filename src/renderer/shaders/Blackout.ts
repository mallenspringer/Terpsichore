/**
 * Two-pass WebGPU shader suite for Blackout / Erasure Poetry Synthesizer:
 * - Pass 1 (BlackoutWordsWGSL): Instanced per-word quads packing 4 semantic channels
 *   into an intermediate RGBA plate:
 *     r = surviving visible glyph alpha
 *     g = censor bar / tape / redaction fill alpha
 *     b = bloom / halo / bleach / CRT glitch energy
 *     a = raw clean word glyph alpha
 * - Pass 2 (BlackoutCompositeWGSL): Fullscreen post-pass combining multi-tap glow/bleed blur,
 *   paper texture & live video_in compositing, ColorPalette mapping, all 9 style renders,
 *   and dual MRT output (location 0 = video_out, location 1 = matte_out).
 */

export const BlackoutWordsWGSL = /* wgsl */ `
struct WordsUniforms {
  // x: aspect, y: timeSec, z: styleId (0..8), w: styleIntensity
  params0: vec4<f32>,
  // x: softness, y: jitterAmount, z: 0, w: 0
  params1: vec4<f32>,
};

struct WordInstance {
  // x0, y0, w, h (normalized 0..1 page coordinates)
  rect: vec4<f32>,
  // u0, v0, u1, v1 (normalized atlas coordinates)
  uvRect: vec4<f32>,
  // x: conceal (0..1), y: wordSeed (0..1), z: barAngleRad, w: gapBridgeRight (normalized)
  state: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: WordsUniforms;
@group(0) @binding(1) var<storage, read> words: array<WordInstance>;
@group(0) @binding(2) var wordAtlas: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) qUv: vec2<f32>,
  @location(1) glyphUv: vec2<f32>,
  @location(2) state: vec4<f32>,
  @location(3) padMetrics: vec4<f32>, // leftPadFrac, rightBridgeFrac, vPadFrac, boxAspect
};

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn overPremult(dst: vec4<f32>, srcPremult: vec4<f32>) -> vec4<f32> {
  return srcPremult + dst * (1.0 - srcPremult.a);
}

fn valueNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let uu = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2<f32>(0.0, 0.0)), hash21(i + vec2<f32>(1.0, 0.0)), uu.x),
    mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), uu.x),
    uu.y
  );
}

@vertex
fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32
) -> VSOut {
  let w = words[iid];
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0)
  );
  let corner = quad[vid];

  // Expand quad slightly for marker overhangs, drop shadows, glow, and horizontal space bridging
  let leftPad = clamp(w.rect.w * 0.22, 0.002, 0.018);
  let rightPad = max(leftPad, w.state.w + leftPad * 0.65);
  let vPad = clamp(w.rect.w * 0.36, 0.004, 0.024);

  let qX0 = w.rect.x - leftPad;
  let qY0 = w.rect.y - vPad;
  let qW = max(0.0001, w.rect.z + leftPad + rightPad);
  let qH = max(0.0001, w.rect.w + vPad * 2.0);

  // Micro tremor driven by jitter_cv & wordSeed when concealed or modulated
  let jit = u.params1.y;
  let t = u.params0.y;
  let jx = (sin(t * 27.0 + w.state.y * 62.8) * 0.0045) * jit;
  let jy = (cos(t * 31.0 + w.state.y * 41.3) * 0.0065) * jit;

  let pageX = qX0 + corner.x * qW + jx;
  let pageY = qY0 + corner.y * qH + jy;

  let clipX = pageX * 2.0 - 1.0;
  let clipY = 1.0 - pageY * 2.0;

  // Map outer quad corner back into inner strict word UV [0..1]
  let innerX = (corner.x * qW - leftPad) / max(0.0001, w.rect.z);
  let innerY = (corner.y * qH - vPad) / max(0.0001, w.rect.w);

  var out: VSOut;
  out.pos = vec4<f32>(clipX, clipY, 0.0, 1.0);
  out.qUv = corner;
  out.glyphUv = vec2<f32>(
    mix(w.uvRect.x, w.uvRect.z, innerX),
    mix(w.uvRect.y, w.uvRect.w, innerY)
  );
  out.state = w.state;
  out.padMetrics = vec4<f32>(leftPad / qW, rightPad / qW, vPad / qH, qW / qH);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let conceal = clamp(in.state.x, 0.0, 1.0);
  let wordSeed = in.state.y;
  let angle = in.state.z;
  let styleId = u32(round(u.params0.z));
  let intensity = clamp(u.params0.w, 0.0, 1.0);
  let soft = clamp(u.params1.x, 0.0, 1.0);
  let timeSec = u.params0.y;

  // Sample crisp glyph strictly within inner word atlas bounds
  let insideAtlas = in.glyphUv.x >= 0.0 && in.glyphUv.x <= 1.0 && in.glyphUv.y >= 0.0 && in.glyphUv.y <= 1.0;
  var rawGlyph = 0.0;
  if (insideAtlas) {
    // Prevent UV bleeding from neighboring atlas cells using word bounds check
    let localWordUv = vec2<f32>(
      (in.qUv.x - in.padMetrics.x) / max(0.001, 1.0 - in.padMetrics.x - in.padMetrics.y),
      (in.qUv.y - in.padMetrics.z) / max(0.001, 1.0 - in.padMetrics.z * 2.0)
    );
    if (localWordUv.x >= 0.0 && localWordUv.x <= 1.0 && localWordUv.y >= 0.0 && localWordUv.y <= 1.0) {
      rawGlyph = textureSampleLevel(wordAtlas, samp, in.glyphUv, 0.0).a;
    }
  }

  // Normalized bar-strip coordinates centered over the word + optional right bridge
  let localBarUv = vec2<f32>(in.qUv.x, in.qUv.y);
  let barCenter = vec2<f32>(0.5, 0.5);
  let dp = localBarUv - barCenter;

  // Rotate slightly for tape / cutup or zine marker styles
  let cs = cos(angle);
  let sn = sin(angle);
  let rotP = vec2<f32>(dp.x * cs - dp.y * sn, dp.x * sn + dp.y * cs) + barCenter;

  var visibleGlyph = rawGlyph;
  var barAlpha = 0.0;
  var glowEnergy = 0.0;

  if (styleId == 0u) {
    // 0: FADE (simple smooth fade of erased words, optional faint whisper ghost via intensity)
    let ghostFloor = mix(0.0, 0.14, 1.0 - intensity);
    let vis = mix(1.0, ghostFloor, conceal);
    visibleGlyph = rawGlyph * vis;
    glowEnergy = 0.0;
  } else if (styleId == 1u) {
    // 1: DISSOLVE (organic stipple/grain breakup of erased words)
    let grain = valueNoise(in.qUv * vec2<f32>(46.0, 22.0) + vec2<f32>(wordSeed * 37.0, wordSeed * 19.0));
    let fine = hash21(floor(in.qUv * vec2<f32>(120.0, 48.0)) + vec2<f32>(wordSeed * 13.0, 7.0));
    let n = grain * 0.65 + fine * 0.35;
    let feather = max(0.06, 0.08 + soft * 0.35);
    let survive = smoothstep(conceal - feather * 0.4, conceal + feather, n + (1.0 - conceal) * 0.25);
    visibleGlyph = rawGlyph * mix(1.0, survive, step(0.005, conceal));
    glowEnergy = rawGlyph * conceal * (1.0 - survive) * intensity * 0.6;
  } else if (styleId == 2u) {
    // 2: WHITEOUT GLOW (blooming washout obscuring erased words into radiant haze)
    let wordBoxMask = smoothstep(0.0, 0.12, in.qUv.x) * smoothstep(1.0, 0.88, in.qUv.x)
                    * smoothstep(0.02, 0.28, in.qUv.y) * smoothstep(0.98, 0.72, in.qUv.y);
    visibleGlyph = rawGlyph * (1.0 - conceal * 0.55);
    let haze = (rawGlyph * 0.85 + wordBoxMask * (0.45 + 0.55 * intensity)) * conceal;
    glowEnergy = clamp(haze, 0.0, 1.0);
  } else if (styleId == 3u) {
    // 3: SPOTLIGHT NEGATIVE (unselected prose dims to faint mist; surviving words glow)
    let dimFloor = mix(0.28, 0.04, intensity);
    visibleGlyph = rawGlyph * mix(1.0, dimFloor, conceal);
    glowEnergy = rawGlyph * (1.0 - conceal) * (0.45 + 0.55 * intensity);
  } else if (styleId == 4u) {
    // 4: SHARPIE ZINE (heavy uneven ink marker bars + ragged edge wobble)
    let edgeNoise = (valueNoise(vec2<f32>(localBarUv.x * 18.0 + wordSeed * 43.0, wordSeed * 11.0)) - 0.5) * 0.14 * (0.4 + intensity);
    let yMin = 0.16 + edgeNoise;
    let yMax = 0.84 - edgeNoise * 0.8;
    let endJitterL = (valueNoise(vec2<f32>(localBarUv.y * 12.0, wordSeed * 29.0)) - 0.5) * 0.06;
    let endJitterR = (valueNoise(vec2<f32>(localBarUv.y * 14.0, wordSeed * 53.0)) - 0.5) * 0.06;
    let leftCut = 0.02 + endJitterL;
    let rightCut = 0.98 + endJitterR;

    // Swipe-in animation along X as conceal rises 0 -> 1
    let wipeRight = mix(leftCut, rightCut, smoothstep(0.0, 0.92, conceal));
    let feather = max(0.015, soft * 0.08);
    let maskX = smoothstep(leftCut - feather, leftCut + feather, localBarUv.x)
              * (1.0 - smoothstep(wipeRight - feather, wipeRight + feather, localBarUv.x));
    let maskY = smoothstep(yMin - feather, yMin + feather, localBarUv.y)
              * (1.0 - smoothstep(yMax - feather, yMax + feather, localBarUv.y));
    barAlpha = maskX * maskY * step(0.02, conceal);
    visibleGlyph = rawGlyph * (1.0 - barAlpha * 0.92);
    glowEnergy = barAlpha * intensity * 0.35; // capillary bleed mask
  } else if (styleId == 5u) {
    // 5: CLASSIFIED REDACT (razor-crisp solid rectangular censor blocks)
    let wipeX = mix(0.02, 0.98, conceal);
    let maskX = step(0.02, localBarUv.x) * step(localBarUv.x, wipeX);
    let maskY = step(0.14, localBarUv.y) * step(localBarUv.y, 0.86);
    barAlpha = maskX * maskY * step(0.02, conceal);
    visibleGlyph = rawGlyph * (1.0 - barAlpha);
    glowEnergy = 0.0;
  } else if (styleId == 6u) {
    // 6: CUT-UP COLLAGE (tilted opaque paper/tape strip + subtle drop shadow)
    let tornL = 0.03 + (valueNoise(vec2<f32>(rotP.y * 28.0, wordSeed * 17.0)) - 0.5) * 0.04;
    let tornR = 0.97 + (valueNoise(vec2<f32>(rotP.y * 28.0, wordSeed * 31.0)) - 0.5) * 0.04;
    let tapeMask = smoothstep(tornL, tornL + 0.02, rotP.x) * (1.0 - smoothstep(tornR - 0.02, tornR, rotP.x))
                 * smoothstep(0.14, 0.17, rotP.y) * (1.0 - smoothstep(0.83, 0.86, rotP.y));
    let shadowShift = vec2<f32>(-0.02, -0.06);
    let shP = rotP + shadowShift;
    let shadowMask = smoothstep(tornL - 0.02, tornL + 0.03, shP.x) * (1.0 - smoothstep(tornR - 0.03, tornR + 0.02, shP.x))
                   * smoothstep(0.12, 0.20, shP.y) * (1.0 - smoothstep(0.80, 0.88, shP.y));
    let barFade = smoothstep(0.05, 0.85, conceal);
    barAlpha = tapeMask * barFade;
    visibleGlyph = rawGlyph * (1.0 - barAlpha * 0.95);
    glowEnergy = max(0.0, shadowMask * (1.0 - tapeMask)) * barFade * 0.85;
  } else if (styleId == 7u) {
    // 7: ACID ERASURE (bleach smudge dissolving word edges outward into pulp haze)
    let n = valueNoise(localBarUv * vec2<f32>(16.0, 9.0) + vec2<f32>(wordSeed * 41.0, timeSec * 0.2));
    let smudge = smoothstep(0.05, 0.25, localBarUv.x) * smoothstep(0.95, 0.75, localBarUv.x)
               * smoothstep(0.1, 0.35, localBarUv.y) * smoothstep(0.9, 0.65, localBarUv.y);
    let bleach = conceal * (0.45 + 0.55 * n) * smudge;
    visibleGlyph = rawGlyph * max(0.0, 1.0 - conceal * (0.7 + 0.45 * n));
    barAlpha = 0.0;
    glowEnergy = clamp(bleach * (0.5 + 0.5 * intensity), 0.0, 1.0);
  } else {
    // 8: SIGNAL CENSOR (CRT rolling static / mosaic cutout over concealed tokens)
    let cell = floor(localBarUv * vec2<f32>(22.0, 8.0));
    let blink = hash21(cell + vec2<f32>(floor(timeSec * 14.0), wordSeed * 71.0));
    let scan = 0.5 + 0.5 * sin(localBarUv.y * 42.0 + timeSec * 18.0);
    let strip = step(0.04, localBarUv.x) * step(localBarUv.x, 0.96) * step(0.18, localBarUv.y) * step(localBarUv.y, 0.82);
    let staticBlock = step(1.0 - conceal * 0.95, blink) * strip * conceal;
    visibleGlyph = rawGlyph * (1.0 - conceal * 0.92);
    barAlpha = staticBlock * 0.35;
    glowEnergy = staticBlock * (0.5 + 0.5 * scan) * (0.4 + 0.6 * intensity);
  }

  return vec4<f32>(visibleGlyph, barAlpha, glowEnergy, rawGlyph);
}
`;

export const BlackoutCompositeWGSL = /* wgsl */ `
struct CompositeUniforms {
  // x: styleId (0..8), y: styleIntensity, z: paperOpacity, w: timeSec
  mode0: vec4<f32>,
  // x: hasVideoIn, y: matteTarget (0=surviving, 1=redaction), z: aspect, w: jitterAmount
  mode1: vec4<f32>,
  // x: usePalette, y: palCount, z: palInterpolation, w: invertMask
  palMeta: vec4<f32>,
  paperColor: vec4<f32>,
  textColor: vec4<f32>,
  barColor: vec4<f32>,
  accentColor: vec4<f32>,
  palColors: array<vec4<f32>, 8>,
  palPositions: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> u: CompositeUniforms;
@group(0) @binding(1) var plateTex: texture_2d<f32>;
@group(0) @binding(2) var videoInTex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct FSOut {
  @location(0) video_out: vec4<f32>,
  @location(1) matte_out: vec4<f32>,
};

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn overPremult(dst: vec4<f32>, srcPremult: vec4<f32>) -> vec4<f32> {
  return srcPremult + dst * (1.0 - srcPremult.a);
}

fn samplePalette(t: f32) -> vec4<f32> {
  let count = u32(max(1.0, u.palMeta.y));
  if (count == 1u) { return u.palColors[0]; }
  let interp = u.palMeta.z;
  let clampedT = clamp(t, 0.0, 1.0);
  var i = 0u;
  for (var k = 0u; k < count - 1u; k++) {
    let idxNext = k + 1u;
    let pNext = u.palPositions[idxNext / 4u][idxNext % 4u];
    if (clampedT >= pNext) { i = idxNext; }
  }
  if (i >= count - 1u) { return u.palColors[count - 1u]; }
  let p0 = u.palPositions[i / 4u][i % 4u];
  let p1 = u.palPositions[(i + 1u) / 4u][(i + 1u) % 4u];
  let span = max(0.0001, p1 - p0);
  let localT = clamp((clampedT - p0) / span, 0.0, 1.0);
  let sharpT = smoothstep(0.5 - (1.0 - interp) * 0.49, 0.5 + (1.0 - interp) * 0.49, localT);
  return mix(u.palColors[i], u.palColors[i + 1u], mix(localT, sharpT, 1.0 - interp));
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var out: VSOut;
  out.pos = vec4<f32>(pos[vid], 0.0, 1.0);
  out.uv = vec2<f32>(pos[vid].x * 0.5 + 0.5, 1.0 - (pos[vid].y * 0.5 + 0.5));
  return out;
}

@fragment
fn fs_main(in: VSOut) -> FSOut {
  let styleId = u32(round(u.mode0.x));
  let intensity = clamp(u.mode0.y, 0.0, 1.0);
  let paperOp = clamp(u.mode0.z, 0.0, 1.0);
  let timeSec = u.mode0.w;
  let hasVideo = u.mode1.x > 0.5;
  let matteTarget = u.mode1.y;
  let aspect = max(0.2, u.mode1.z);
  let jit = u.mode1.w;

  let plate = textureSampleLevel(plateTex, samp, in.uv, 0.0);
  let visGlyph = plate.r;
  let barMask = plate.g;
  let rawGlyph = plate.a;

  // Multi-tap isotropic bloom/bleed halo from plate.b
  let blurR = mix(0.005, 0.022, intensity) * (1.0 + jit * 0.5);
  var bloomSum = plate.b * 0.24;
  let ringDirs = array<vec2<f32>, 8>(
    vec2<f32>( 1.0,  0.0), vec2<f32>(-1.0,  0.0),
    vec2<f32>( 0.0,  1.0), vec2<f32>( 0.0, -1.0),
    vec2<f32>( 0.707,  0.707), vec2<f32>(-0.707,  0.707),
    vec2<f32>( 0.707, -0.707), vec2<f32>(-0.707, -0.707)
  );
  for (var k = 0u; k < 8u; k++) {
    let off = ringDirs[k] * vec2<f32>(blurR / aspect, blurR);
    bloomSum += textureSampleLevel(plateTex, samp, in.uv + off * 0.55, 0.0).b * 0.06;
    bloomSum += textureSampleLevel(plateTex, samp, in.uv + off * 1.15, 0.0).b * 0.035;
  }
  let bloom = clamp(bloomSum, 0.0, 1.5);

  // Palette overrides
  var paperCol = u.paperColor.rgb;
  var textCol = u.textColor.rgb;
  var barCol = u.barColor.rgb;
  var accentCol = u.accentColor.rgb;
  if (u.palMeta.x > 0.5) {
    paperCol = samplePalette(0.05).rgb;
    barCol = samplePalette(0.32).rgb;
    accentCol = samplePalette(0.68).rgb;
    textCol = samplePalette(0.95).rgb;
  }

  // Style-adaptive paper surface
  let paperGrain = (hash21(floor(in.uv * vec2<f32>(640.0, 360.0))) - 0.5) * 0.05;
  var surfRgb = paperCol + paperGrain * (0.5 + 0.5 * intensity);
  if (styleId == 3u) {
    // Spotlight Negative favors deep dark charcoal/obsidian canvas when not palette-overridden
    if (u.palMeta.x < 0.5) {
      surfRgb = vec3<f32>(0.04, 0.04, 0.055) + paperGrain * 0.3;
      textCol = vec3<f32>(0.96, 0.95, 0.92);
    }
  } else if (styleId == 8u) {
    // Signal Censor dark CRT phosphor slate
    if (u.palMeta.x < 0.5) {
      let scanDark = 0.92 + 0.08 * sin(in.uv.y * 720.0);
      surfRgb = vec3<f32>(0.03, 0.045, 0.04) * scanDark;
      textCol = vec3<f32>(0.72, 0.98, 0.80);
    }
  }

  // Blend paper over optional video_in (in premultiplied RGBA so transparent BG works cleanly for all 9 styles)
  let paperPremult = vec4<f32>(surfRgb * paperOp, paperOp);
  var bg = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  if (hasVideo) {
    let vid = textureSampleLevel(videoInTex, samp, in.uv, 0.0);
    let vidPremult = vec4<f32>(vid.rgb * vid.a, vid.a);
    bg = overPremult(vidPremult, paperPremult);
  } else {
    bg = paperPremult;
  }

  // Porter-Duff premultiplied composition for foreground text, shadows, bleed, censor strips & glow
  var comp = bg;
  let fgGlyph = vec4<f32>(textCol * visGlyph, visGlyph);

  if (styleId == 2u) {
    // WHITEOUT GLOW: surviving words + bright haze bloom that washes out erased regions
    comp = overPremult(comp, fgGlyph);
    let wash = clamp(bloom * (0.85 + 1.15 * intensity), 0.0, 1.0);
    let glowHue = mix(vec3<f32>(1.0, 0.99, 0.96), accentCol, 0.25);
    comp = overPremult(comp, vec4<f32>(glowHue * wash, wash));
  } else if (styleId == 3u) {
    // SPOTLIGHT NEGATIVE: halo behind surviving glowing glyphs over dark or transparent BG
    let halo = clamp(bloom * (0.7 + 1.1 * intensity), 0.0, 1.0);
    let haloHue = mix(accentCol, textCol, 0.45);
    comp = overPremult(comp, vec4<f32>(haloHue * halo * 0.85, halo * 0.85));
    comp = overPremult(comp, fgGlyph);
  } else if (styleId == 4u) {
    // SHARPIE ZINE: text, capillary marker bleed shadow, then uneven marker bar
    comp = overPremult(comp, fgGlyph);
    let bleedA = clamp(bloom * 0.65, 0.0, 0.65);
    comp = overPremult(comp, vec4<f32>(barCol * 0.65 * bleedA, bleedA));
    comp = overPremult(comp, vec4<f32>(barCol * barMask, barMask));
  } else if (styleId == 6u) {
    // CUT-UP COLLAGE: cast drop shadow + opaque tilted paper/tape strip
    comp = overPremult(comp, fgGlyph);
    let shadA = clamp(plate.b * 0.72 + bloom * 0.18, 0.0, 0.72);
    comp = overPremult(comp, vec4<f32>(vec3<f32>(0.02) * shadA, shadA));
    let stripCol = mix(paperCol * 0.92 + 0.04, barCol, 0.25);
    comp = overPremult(comp, vec4<f32>(stripCol * barMask, barMask));
  } else if (styleId == 7u) {
    // ACID ERASURE: smudged bleach haze over fading words
    comp = overPremult(comp, fgGlyph);
    let bleachCol = mix(paperCol, accentCol, 0.3);
    let haze = clamp(bloom * 0.85 + plate.b * 0.5, 0.0, 0.95);
    let hazeA = clamp(haze * 0.78, 0.0, 0.95);
    comp = overPremult(comp, vec4<f32>(bleachCol * hazeA, hazeA));
  } else if (styleId == 8u) {
    // SIGNAL CENSOR: phosphor surviving text + scanline CRT static blocks
    comp = overPremult(comp, fgGlyph);
    let staticCol = mix(accentCol, vec3<f32>(0.9, 1.0, 0.95), hash21(floor(in.uv * vec2<f32>(320.0, 180.0)) + timeSec * 12.0));
    let glitchAmt = clamp((plate.b + bloom * 0.45) * 0.92, 0.0, 1.0);
    comp = overPremult(comp, vec4<f32>(staticCol * glitchAmt, glitchAmt));
  } else {
    // FADE (0), DISSOLVE (1), CLASSIFIED REDACT (5)
    comp = overPremult(comp, fgGlyph);
    if (styleId == 1u) {
      let emberA = clamp(bloom * 0.45, 0.0, 0.45);
      comp = overPremult(comp, vec4<f32>(accentCol * emberA, emberA));
    }
    comp = overPremult(comp, vec4<f32>(barCol * barMask, barMask));
  }

  // Convert back to crisp straight-alpha RGBA for Renderer layer compositing
  let outAlpha = clamp(comp.a, 0.0, 1.0);
  var outRgb = vec3<f32>(0.0);
  if (outAlpha > 0.0001) {
    outRgb = clamp(comp.rgb / outAlpha, vec3<f32>(0.0), vec3<f32>(1.0));
  }

  // Matte output: surviving words mask vs redaction/bar/censor shapes
  var matteVal = visGlyph;
  if (matteTarget > 0.5) {
    matteVal = max(barMask, max(clamp(rawGlyph - visGlyph, 0.0, 1.0), clamp(plate.b * 0.8, 0.0, 1.0)));
  }

  var res: FSOut;
  res.video_out = vec4<f32>(outRgb, outAlpha);
  res.matte_out = vec4<f32>(matteVal, matteVal, matteVal, 1.0);
  return res;
}
`;
