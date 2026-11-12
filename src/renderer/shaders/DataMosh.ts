export const DataMoshWGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct DataMoshUniforms {
  params0: vec4<f32>, // x = processTarget (0=canvas, 1=upstream_bounded), y = vectorGain, z = decay, w = threshold (motion floor)
  params1: vec4<f32>, // x = macroblockSize, y = chromaBleed, z = biasX, w = biasY
  params2: vec4<f32>, // x = noiseGlitch, y = isKeyframe (1.0 = reset), z = hasMask, w = timeSec
  params3: vec4<f32>, // x = aspect, y = 0, z = 0, w = 0
};

@group(0) @binding(0) var<uniform> u: DataMoshUniforms;
@group(0) @binding(1) var currTex: texture_2d<f32>;
@group(0) @binding(2) var prevTex: texture_2d<f32>;
@group(0) @binding(3) var accumTex: texture_2d<f32>;
@group(0) @binding(4) var maskTex: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var out: VertexOutput;
  out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  out.uv = pos[vertexIndex] * 0.5 + 0.5;
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

fn rgbToLuma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453123);
}

struct FragmentOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
  var out: FragmentOutput;
  let dims = vec2<f32>(textureDimensions(currTex));
  let texel = vec2<f32>(1.0) / max(vec2<f32>(1.0), dims);
  
  // Current frame baseline sample
  let currRaw = textureSampleLevel(currTex, smp, in.uv, 0.0);

  // Upstream bounded target: if pixel is fully transparent in source, keep clean transparent
  if (u.params0.x > 0.5 && currRaw.a < 0.002) {
    out.videoOut = vec4<f32>(0.0);
    out.matteOut = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return out;
  }

  // Keyframe reset: immediately snapshot current raw frame into accumulation buffer
  if (u.params2.y > 0.5) {
    out.videoOut = currRaw;
    out.matteOut = vec4<f32>(vec3<f32>(currRaw.a), 1.0);
    return out;
  }

  // Macroblock Quantization Grid
  let blockSize = max(1.0, u.params1.x);
  var blockUV = in.uv;
  if (blockSize > 1.5) {
    let blockCoord = floor(in.uv * dims / blockSize) * blockSize + vec2<f32>(blockSize * 0.5);
    blockUV = blockCoord / dims;
  }

  // ── Multi-Point Macroblock Temporal Difference (Noise Gating) ──
  let halfBlock = (blockSize * 0.35) * texel;
  let currC = textureSampleLevel(currTex, smp, blockUV, 0.0).rgb;
  let prevC = textureSampleLevel(prevTex, smp, blockUV, 0.0).rgb;
  
  let curr0 = textureSampleLevel(currTex, smp, blockUV + vec2<f32>(halfBlock.x, halfBlock.y), 0.0).rgb;
  let prev0 = textureSampleLevel(prevTex, smp, blockUV + vec2<f32>(halfBlock.x, halfBlock.y), 0.0).rgb;
  
  let curr1 = textureSampleLevel(currTex, smp, blockUV - vec2<f32>(halfBlock.x, halfBlock.y), 0.0).rgb;
  let prev1 = textureSampleLevel(prevTex, smp, blockUV - vec2<f32>(halfBlock.x, halfBlock.y), 0.0).rgb;

  let blockDiff = (length(currC - prevC) + length(curr0 - prev0) + length(curr1 - prev1)) * 0.333333;
  let motionFloor = u.params0.w;

  var flowVec = vec2<f32>(0.0);

  // ── Block Matching Motion Vector Search (MPEG P-Frame Vector Extraction) ──
  if (blockDiff > motionFloor) {
    var minSAD = blockDiff * 0.94; // Biased threshold to lock zero vector on minor changes
    var bestOffset = vec2<f32>(0.0);

    // Multi-scale candidate radii for small, medium, and fast large motions (sweeps/pans)
    let step1 = max(1.0, blockSize * 0.5);
    let step2 = max(2.0, blockSize * 1.25);
    let step3 = max(4.0, blockSize * 2.5);

    let searchDirs = array<vec2<f32>, 8>(
      vec2<f32>( 1.0,  0.0), vec2<f32>(-1.0,  0.0),
      vec2<f32>( 0.0,  1.0), vec2<f32>( 0.0, -1.0),
      vec2<f32>( 0.707,  0.707), vec2<f32>(-0.707,  0.707),
      vec2<f32>( 0.707, -0.707), vec2<f32>(-0.707, -0.707)
    );

    // Radius 1: Near search
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
      let off = searchDirs[i] * step1 * texel;
      let s = textureSampleLevel(prevTex, smp, blockUV + off, 0.0).rgb;
      let sad = length(currC - s);
      if (sad < minSAD) {
        minSAD = sad;
        bestOffset = off;
      }
    }

    // Radius 2: Mid search
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
      let off = searchDirs[i] * step2 * texel;
      let s = textureSampleLevel(prevTex, smp, blockUV + off, 0.0).rgb;
      let sad = length(currC - s);
      if (sad < minSAD) {
        minSAD = sad;
        bestOffset = off;
      }
    }

    // Radius 3: Far search (fast moving subjects across screen)
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
      let off = searchDirs[i] * step3 * texel;
      let s = textureSampleLevel(prevTex, smp, blockUV + off, 0.0).rgb;
      let sad = length(currC - s);
      if (sad < minSAD) {
        minSAD = sad;
        bestOffset = off;
      }
    }

    if (length(bestOffset) > 0.00001) {
      // Displace towards the matched reference block
      flowVec = bestOffset * 1.5;
    } else {
      // Fine sub-pixel optical flow gradient fallback
      let delta = texel * max(1.0, blockSize * 0.5);
      let dtLuma = rgbToLuma(currC) - rgbToLuma(prevC);
      let lumaXPlus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV + vec2<f32>(delta.x, 0.0), 0.0).rgb);
      let lumaXMinus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV - vec2<f32>(delta.x, 0.0), 0.0).rgb);
      let dxLuma = (lumaXPlus - lumaXMinus) * 0.5;
      let lumaYPlus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV + vec2<f32>(0.0, delta.y), 0.0).rgb);
      let lumaYMinus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV - vec2<f32>(0.0, delta.y), 0.0).rgb);
      let dyLuma = (lumaYPlus - lumaYMinus) * 0.5;
      let gradSq = dxLuma * dxLuma + dyLuma * dyLuma + 0.001;
      flowVec = - (dtLuma * vec2<f32>(dxLuma, dyLuma)) / gradSq * delta * 2.5;
    }
  }

  // ── Directional Flow Drift & Amplification ──
  var displacement = flowVec * u.params0.y;
  
  // Continuous directional drift bias (X / Y)
  displacement += vec2<f32>(u.params1.z, - u.params1.w) * 0.015 * max(0.5, u.params0.y);

  // Mask attenuation
  if (u.params2.z > 0.5) {
    displacement *= textureSampleLevel(maskTex, smp, in.uv, 0.0).r;
  }

  // ── Macroblock Bitrot & Packet Loss Dropout ──
  let noiseAmt = u.params2.x;
  if (noiseAmt > 0.005) {
    let blockSeed = floor(in.uv * dims / max(4.0, blockSize));
    let rnd = hash21(blockSeed + vec2<f32>(floor(u.params2.w * 10.0) * 17.13, 31.41));
    if (rnd < noiseAmt * 0.35) {
      let angle = hash21(blockSeed + vec2<f32>(5.7, 9.1)) * 6.2831853;
      let jumpDist = (0.01 + rnd * 0.05) * (blockSize / 16.0);
      displacement += vec2<f32>(cos(angle), sin(angle)) * jumpDist;
    }
  }

  // ── Displaced Lookup into Persistent Accumulation Buffer ──
  let targetUV = in.uv - displacement;
  let clampedUV = clamp(targetUV, vec2<f32>(0.0005), vec2<f32>(0.9995));
  let accumSample = textureSampleLevel(accumTex, smp, clampedUV, 0.0);

  // ── Chroma Bleed / Subcarrier YUV Smear ──
  let bleed = u.params1.y;
  var smoshColor = accumSample.rgb;
  if (bleed > 0.005) {
    let rUV = clamp(in.uv - displacement * (1.0 + bleed * 0.75), vec2<f32>(0.0005), vec2<f32>(0.9995));
    let bUV = clamp(in.uv - displacement * (1.0 - bleed * 0.75), vec2<f32>(0.0005), vec2<f32>(0.9995));
    let rVal = textureSampleLevel(accumTex, smp, rUV, 0.0).r;
    let bVal = textureSampleLevel(accumTex, smp, bUV, 0.0).b;
    smoshColor = vec3<f32>(mix(accumSample.r, rVal, bleed), accumSample.g, mix(accumSample.b, bVal, bleed));
  }

  // ── Smear Persistence & Decay Blending ──
  // decay = 1.0 (100%): Infinite hold until next I-frame! Displaced mosh overwrites canvas completely.
  // decay < 1.0: Live video gradually bleeds back into the smear.
  let decay = clamp(u.params0.z, 0.0, 1.0);

  let blendedRGB = mix(currRaw.rgb, smoshColor, decay);
  let blendedA = mix(currRaw.a, accumSample.a, decay);

  let finalColor = vec4<f32>(blendedRGB, blendedA);

  out.videoOut = finalColor;
  out.matteOut = vec4<f32>(vec3<f32>(finalColor.a), 1.0);
  return out;
}
`;
