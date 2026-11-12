export const DataMoshWGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct DataMoshUniforms {
  params0: vec4<f32>, // x = processTarget (0=canvas, 1=upstream_bounded), y = vectorGain, z = decay, w = threshold
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
  
  // Current frame baseline sample (using textureSampleLevel for unconditional uniform control flow)
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

  // Optical Flow Motion Vector Estimation at macroblock center
  let delta = (vec2<f32>(1.0) / max(vec2<f32>(1.0), dims)) * max(1.0, blockSize * 0.5);
  
  let currLuma = rgbToLuma(textureSampleLevel(currTex, smp, blockUV, 0.0).rgb);
  let prevLuma = rgbToLuma(textureSampleLevel(prevTex, smp, blockUV, 0.0).rgb);
  let dtLuma = currLuma - prevLuma;

  let lumaXPlus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV + vec2<f32>(delta.x, 0.0), 0.0).rgb);
  let lumaXMinus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV - vec2<f32>(delta.x, 0.0), 0.0).rgb);
  let dxLuma = (lumaXPlus - lumaXMinus) * 0.5;

  let lumaYPlus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV + vec2<f32>(0.0, delta.y), 0.0).rgb);
  let lumaYMinus = rgbToLuma(textureSampleLevel(currTex, smp, blockUV - vec2<f32>(0.0, delta.y), 0.0).rgb);
  let dyLuma = (lumaYPlus - lumaYMinus) * 0.5;

  let gradSq = dxLuma * dxLuma + dyLuma * dyLuma + 0.002;
  var flowVec = - (dtLuma * vec2<f32>(dxLuma, dyLuma)) / gradSq;

  // Threshold floor
  let flowLen = length(flowVec);
  if (flowLen < u.params0.w) {
    flowVec = vec2<f32>(0.0);
  }

  // Directional drift bias
  flowVec += vec2<f32>(u.params1.z, u.params1.w) * 0.015;

  // Mask attenuation
  var maskVal = 1.0;
  if (u.params2.z > 0.5) {
    maskVal = textureSampleLevel(maskTex, smp, in.uv, 0.0).r;
  }

  // Amplification
  var displacement = flowVec * u.params0.y * maskVal;

  // Bitrot Noise / Macroblock corruption
  let noiseAmt = u.params2.x;
  if (noiseAmt > 0.005) {
    let blockSeed = floor(in.uv * dims / max(4.0, blockSize));
    let rnd = hash21(blockSeed + vec2<f32>(floor(u.params2.w * 8.0) * 17.13, 31.41));
    if (rnd < noiseAmt * 0.3) {
      let angle = hash21(blockSeed + vec2<f32>(5.7, 9.1)) * 6.2831853;
      displacement += vec2<f32>(cos(angle), sin(angle)) * (0.04 * (rnd / max(0.001, noiseAmt)));
    }
  }

  // Displaced lookup into the accumulation texture
  let targetUV = in.uv - displacement;
  let clampedUV = clamp(targetUV, vec2<f32>(0.0005), vec2<f32>(0.9995));
  let accumSample = textureSampleLevel(accumTex, smp, clampedUV, 0.0);

  // Chroma Bleed / Subcarrier YUV smear
  let bleed = u.params1.y;
  var smoshColor = accumSample.rgb;
  if (bleed > 0.005) {
    let rUV = clamp(in.uv - displacement * (1.0 + bleed * 0.6), vec2<f32>(0.0005), vec2<f32>(0.9995));
    let bUV = clamp(in.uv - displacement * (1.0 - bleed * 0.6), vec2<f32>(0.0005), vec2<f32>(0.9995));
    let rVal = textureSampleLevel(accumTex, smp, rUV, 0.0).r;
    let bVal = textureSampleLevel(accumTex, smp, bUV, 0.0).b;
    smoshColor = vec3<f32>(mix(accumSample.r, rVal, bleed), accumSample.g, mix(accumSample.b, bVal, bleed));
  }

  // Persistent Smear Decay Blend
  let decay = clamp(u.params0.z, 0.7, 0.999);
  
  // If there's virtually no motion in this block, let current frame breathe through slightly
  let motionWeight = clamp(length(displacement) * 20.0, 0.0, 1.0);
  let effectiveDecay = mix(decay * 0.95, decay, motionWeight);

  let blendedRGB = mix(currRaw.rgb, smoshColor, effectiveDecay);
  let blendedA = mix(currRaw.a, accumSample.a, effectiveDecay);

  let finalColor = vec4<f32>(blendedRGB, blendedA);

  out.videoOut = finalColor;
  out.matteOut = vec4<f32>(vec3<f32>(finalColor.a), 1.0);
  return out;
}
`;
