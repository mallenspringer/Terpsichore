export const DataMoshWGSL = /* wgsl */ `
struct DataMoshUniforms {
  params0: vec4<f32>, // x = processTarget (0=canvas, 1=upstream_bounded), y = vectorGain, z = frameRetention, w = threshold (motion floor)
  params1: vec4<f32>, // x = macroblockSize, y = chromaBleed, z = biasStepPxX, w = biasStepPxY
  params2: vec4<f32>, // x = noiseGlitch, y = isKeyframe (1.0 = reset), z = hasMask, w = timeSec
  params3: vec4<f32>, // x = aspect, y = refreshThreshold, z = motionCutMode (1.0 = motion_thresh), w = motionThreshold
};

@group(0) @binding(0) var<uniform> u: DataMoshUniforms;
@group(0) @binding(1) var currTex: texture_2d<f32>;
@group(0) @binding(2) var prevTex: texture_2d<f32>;
@group(0) @binding(3) var accumTex: texture_2d<f32>;
@group(0) @binding(4) var maskTex: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;

struct FragmentOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

struct Patch5 {
  p0: vec4<f32>,
  p1: vec4<f32>,
  p2: vec4<f32>,
  p3: vec4<f32>,
  p4: vec4<f32>,
};

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453123);
}

fn samplePatch5(tex: texture_2d<f32>, centerUV: vec2<f32>, tapR: vec2<f32>) -> Patch5 {
  var p: Patch5;
  p.p0 = textureSampleLevel(tex, smp, clamp(centerUV, vec2<f32>(0.0005), vec2<f32>(0.9995)), 0.0);
  p.p1 = textureSampleLevel(tex, smp, clamp(centerUV + vec2<f32>( tapR.x,  tapR.y), vec2<f32>(0.0005), vec2<f32>(0.9995)), 0.0);
  p.p2 = textureSampleLevel(tex, smp, clamp(centerUV + vec2<f32>(-tapR.x,  tapR.y), vec2<f32>(0.0005), vec2<f32>(0.9995)), 0.0);
  p.p3 = textureSampleLevel(tex, smp, clamp(centerUV + vec2<f32>( tapR.x, -tapR.y), vec2<f32>(0.0005), vec2<f32>(0.9995)), 0.0);
  p.p4 = textureSampleLevel(tex, smp, clamp(centerUV + vec2<f32>(-tapR.x, -tapR.y), vec2<f32>(0.0005), vec2<f32>(0.9995)), 0.0);
  return p;
}

fn patchDiff(a: Patch5, b: Patch5, isBounded: bool) -> f32 {
  let invSqrt3 = 0.57735027;
  let rgbDiff = (
    length(a.p0.rgb - b.p0.rgb) +
    length(a.p1.rgb - b.p1.rgb) +
    length(a.p2.rgb - b.p2.rgb) +
    length(a.p3.rgb - b.p3.rgb) +
    length(a.p4.rgb - b.p4.rgb)
  ) * (0.2 * invSqrt3);
  if (!isBounded) {
    return rgbDiff;
  }
  let aDiff = (
    abs(a.p0.a - b.p0.a) +
    abs(a.p1.a - b.p1.a) +
    abs(a.p2.a - b.p2.a) +
    abs(a.p3.a - b.p3.a) +
    abs(a.p4.a - b.p4.a)
  ) * 0.2;
  return max(rgbDiff, aDiff);
}

fn detectSceneCut(isBounded: bool, cutThresh: f32) -> bool {
  let invSqrt3 = 0.57735027;
  var diffSum: f32 = 0.0;
  var weightSum: f32 = 0.0;
  for (var gy: u32 = 0u; gy < 4u; gy = gy + 1u) {
    for (var gx: u32 = 0u; gx < 4u; gx = gx + 1u) {
      let gUV = vec2<f32>((f32(gx) + 0.5) * 0.25, (f32(gy) + 0.5) * 0.25);
      let sNow = textureSampleLevel(currTex, smp, gUV, 0.0);
      let sPrev = textureSampleLevel(prevTex, smp, gUV, 0.0);
      let rgbD = length(sNow.rgb - sPrev.rgb) * invSqrt3;
      if (isBounded) {
        let w = select(0.0, 1.0, max(sNow.a, sPrev.a) > 0.05);
        diffSum += max(rgbD, abs(sNow.a - sPrev.a)) * w;
        weightSum += w;
      } else {
        diffSum += rgbD;
        weightSum += 1.0;
      }
    }
  }
  let sceneDiff = diffSum / max(1.0, weightSum);
  return sceneDiff > cutThresh;
}

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> FragmentOutput {
  var out: FragmentOutput;
  let iDims = vec2<i32>(textureDimensions(currTex));
  let dims = vec2<f32>(iDims);
  let texel = vec2<f32>(1.0) / max(vec2<f32>(1.0), dims);
  let pixelCoord = clamp(vec2<i32>(floor(uv * dims)), vec2<i32>(0), iDims - vec2<i32>(1));
  let isBounded = u.params0.x > 0.5;

  // Current live input sample
  let currRaw = textureSampleLevel(currTex, smp, uv, 0.0);

  // Explicit Keyframe Reset (init / periodic / manual / CV trigger)
  if (u.params2.y > 0.5) {
    out.videoOut = currRaw;
    out.matteOut = vec4<f32>(vec3<f32>(currRaw.a), 1.0);
    return out;
  }

  // GPU Scene-Cut Detection (Motion Spike Keyframe Mode)
  if (u.params3.z > 0.5 && detectSceneCut(isBounded, u.params3.w)) {
    out.videoOut = currRaw;
    out.matteOut = vec4<f32>(vec3<f32>(currRaw.a), 1.0);
    return out;
  }

  // Macroblock Grid Quantization
  let blockSize = max(1.0, u.params1.x);
  var blockUV = uv;
  if (blockSize > 1.5) {
    let blockCoord = floor(uv * dims / blockSize) * blockSize + vec2<f32>(blockSize * 0.5);
    blockUV = clamp(blockCoord / dims, vec2<f32>(0.0005), vec2<f32>(0.9995));
  }

  // ── 5-Tap Macroblock Patch Temporal Difference ──
  let tapR = max(1.0, blockSize * 0.3) * texel;
  let currPatch = samplePatch5(currTex, blockUV, tapR);
  let prevPatch = samplePatch5(prevTex, blockUV, tapR);
  let zeroSAD = patchDiff(currPatch, prevPatch, isBounded);

  let motionFloor = u.params0.w;
  let refreshThresh = u.params3.y;

  // Check whether this macroblock already holds frozen/diverged mosh pixels
  let accumAtBlock = textureSampleLevel(accumTex, smp, blockUV, 0.0);
  let moshDivRgb = length(currPatch.p0.rgb - accumAtBlock.rgb) * 0.57735027;
  let moshDiv = select(moshDivRgb, max(moshDivRgb, abs(currPatch.p0.a - accumAtBlock.a)), isBounded);
  let isAlreadyFrozen = moshDiv > max(0.02, motionFloor * 0.5);

  var flowVec = vec2<f32>(0.0);
  var bestSAD = zeroSAD;

  // ── Coarse-to-Fine Patch Block Matching (MPEG P-Frame Vector Extraction) ──
  if (zeroSAD > motionFloor) {
    var minSAD = zeroSAD * 0.96; // Slight zero-vector preference to reject grain
    var bestOffset = vec2<f32>(0.0);

    let searchDirs = array<vec2<f32>, 8>(
      vec2<f32>( 1.0,  0.0), vec2<f32>(-1.0,  0.0),
      vec2<f32>( 0.0,  1.0), vec2<f32>( 0.0, -1.0),
      vec2<f32>( 0.7071,  0.7071), vec2<f32>(-0.7071,  0.7071),
      vec2<f32>( 0.7071, -0.7071), vec2<f32>(-0.7071, -0.7071)
    );

    // Coarse Stage 1: Far & Mid rings (captures fast pans & normal movement)
    let rFar = max(4.0, round(blockSize * 1.25));
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
      let off = searchDirs[i] * rFar * texel;
      let sad = patchDiff(currPatch, samplePatch5(prevTex, blockUV + off, tapR), isBounded);
      if (sad < minSAD) {
        minSAD = sad;
        bestOffset = off;
      }
    }

    let rMid = max(2.0, round(blockSize * 0.45));
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
      let off = searchDirs[i] * rMid * texel;
      let sad = patchDiff(currPatch, samplePatch5(prevTex, blockUV + off, tapR), isBounded);
      if (sad < minSAD) {
        minSAD = sad;
        bestOffset = off;
      }
    }

    // Coarse-to-Fine Stage 2: Local refinement around bestOffset (captures 1-4px slow drift)
    let seedOffset = bestOffset;
    let rFine = max(1.0, round(blockSize * 0.15));
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
      let off = seedOffset + searchDirs[i] * rFine * texel;
      let sad = patchDiff(currPatch, samplePatch5(prevTex, blockUV + off, tapR), isBounded);
      if (sad < minSAD) {
        minSAD = sad;
        bestOffset = off;
      }
    }

    if (rFine > 1.5) {
      let fineSeed = bestOffset;
      for (var i: u32 = 0u; i < 4u; i = i + 1u) {
        let off = fineSeed + searchDirs[i] * texel;
        let sad = patchDiff(currPatch, samplePatch5(prevTex, blockUV + off, tapR), isBounded);
        if (sad < minSAD) {
          minSAD = sad;
          bestOffset = off;
        }
      }
    }

    bestSAD = minSAD;

    // bestOffset = prevPos - currPos (backward). Negate to get forward motion vector!
    flowVec = -bestOffset;
  }

  // ── Selective Intra-Block Refresh (Re-drop already-frozen blocks on high change/residual) ──
  let isIntraRefresh = (refreshThresh < 0.995) && isAlreadyFrozen && (zeroSAD > refreshThresh || bestSAD > refreshThresh);
  if (isIntraRefresh) {
    out.videoOut = currRaw;
    out.matteOut = vec4<f32>(vec3<f32>(currRaw.a), 1.0);
    return out;
  }

  // ── Forward Advection, Directional Bias & Masking (Quantized to Integer Texels) ──
  var dispUV = flowVec * u.params0.y;
  var biasPx = vec2<f32>(u.params1.z, u.params1.w);

  if (u.params2.z > 0.5) {
    let maskVal = textureSampleLevel(maskTex, smp, uv, 0.0).r;
    dispUV *= maskVal;
    biasPx *= maskVal;
  }

  var dispPx = round(dispUV * dims + biasPx);

  // ── Macroblock Bitrot & Packet Loss Dropout ──
  let noiseAmt = u.params2.x;
  if (noiseAmt > 0.005) {
    let blockSeed = floor(uv * dims / max(4.0, blockSize));
    let rnd = hash21(blockSeed + vec2<f32>(floor(u.params2.w * 12.0) * 17.13, 31.41));
    if (rnd < noiseAmt * 0.35) {
      let angle = hash21(blockSeed + vec2<f32>(5.7, 9.1)) * 6.2831853;
      let jumpPx = (4.0 + rnd * 24.0) * max(0.5, blockSize / 16.0);
      dispPx += round(vec2<f32>(cos(angle), sin(angle)) * jumpPx);
    }
  }

  // ── Exact Texel Lookup into Persistent Accumulation Buffer (No Bilinear Mush) ──
  let targetPx = pixelCoord - vec2<i32>(dispPx);
  let inBounds = targetPx.x >= 0 && targetPx.x < iDims.x && targetPx.y >= 0 && targetPx.y < iDims.y;
  let clampedPx = clamp(targetPx, vec2<i32>(0), iDims - vec2<i32>(1));
  let accumSample = select(currRaw, textureLoad(accumTex, clampedPx, 0), inBounds);

  // Upstream bounded target: preserve trails while keeping untouched transparent background clean
  if (isBounded && max(currRaw.a, accumSample.a) < 0.002) {
    out.videoOut = vec4<f32>(0.0);
    out.matteOut = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return out;
  }

  // ── Chroma Bleed / Subcarrier RGB Split along Drift Vector ──
  let bleed = u.params1.y;
  var smoshColor = accumSample.rgb;
  if (bleed > 0.005 && (dispPx.x != 0.0 || dispPx.y != 0.0)) {
    let rOff = vec2<i32>(round(dispPx * (1.0 + bleed * 0.75)));
    let bOff = vec2<i32>(round(dispPx * (1.0 - bleed * 0.75)));
    let rPx = clamp(pixelCoord - rOff, vec2<i32>(0), iDims - vec2<i32>(1));
    let bPx = clamp(pixelCoord - bOff, vec2<i32>(0), iDims - vec2<i32>(1));
    let rVal = textureLoad(accumTex, rPx, 0).r;
    let bVal = textureLoad(accumTex, bPx, 0).b;
    smoshColor = vec3<f32>(mix(accumSample.r, rVal, bleed), accumSample.g, mix(accumSample.b, bVal, bleed));
  }

  // ── Hold Duration / Smear Decay Blending ──
  let retention = clamp(u.params0.z, 0.0, 1.0);
  if (retention >= 0.9999) {
    out.videoOut = vec4<f32>(smoshColor, accumSample.a);
    out.matteOut = vec4<f32>(vec3<f32>(accumSample.a), 1.0);
    return out;
  }
  if (retention <= 0.0001) {
    out.videoOut = currRaw;
    out.matteOut = vec4<f32>(vec3<f32>(currRaw.a), 1.0);
    return out;
  }

  let rawBlend = 1.0 - retention;
  var blendedRGB = mix(smoshColor, currRaw.rgb, rawBlend);
  var blendedA = mix(accumSample.a, currRaw.a, rawBlend);

  // Stochastic 1-LSB assist prevents 8-bit UNORM stalling during slow (5s-60s) holds
  if (rawBlend < 0.25) {
    let jitter = hash21(vec2<f32>(pixelCoord) + vec2<f32>(fract(u.params2.w * 60.0) * 19.31, 7.13));
    let diffRGB = currRaw.rgb - smoshColor;
    let stepRGB = abs(diffRGB) * rawBlend;
    let probRGB = clamp(stepRGB * 255.0, vec3<f32>(0.0), vec3<f32>(1.0));
    let nudgeRGB = select(vec3<f32>(0.0), sign(diffRGB) * (1.0 / 255.0), vec3<f32>(jitter) < probRGB);
    let assistedRGB = clamp(smoshColor + nudgeRGB, min(smoshColor, currRaw.rgb), max(smoshColor, currRaw.rgb));
    blendedRGB = select(blendedRGB, assistedRGB, stepRGB < vec3<f32>(0.5 / 255.0));

    let diffA = currRaw.a - accumSample.a;
    let stepA = abs(diffA) * rawBlend;
    let probA = clamp(stepA * 255.0, 0.0, 1.0);
    let nudgeA = select(0.0, sign(diffA) * (1.0 / 255.0), jitter < probA);
    let assistedA = clamp(accumSample.a + nudgeA, min(accumSample.a, currRaw.a), max(accumSample.a, currRaw.a));
    blendedA = select(blendedA, assistedA, stepA < (0.5 / 255.0));
  }

  let finalColor = vec4<f32>(blendedRGB, blendedA);
  out.videoOut = finalColor;
  out.matteOut = vec4<f32>(vec3<f32>(finalColor.a), 1.0);
  return out;
}
`;
