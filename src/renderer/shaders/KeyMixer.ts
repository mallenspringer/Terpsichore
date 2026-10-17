export const KeyMixerWGSL = `
struct KeyMixerUniforms {
  mode: u32,               // 0: luma, 1: chroma
  threshold: f32,          // 0.0 .. 1.0
  tolerance: f32,          // 0.0 .. 1.0
  spillSuppression: f32,   // 0.0 .. 1.0
  keyColorR: f32,          // 0.0 .. 1.0
  keyColorG: f32,          // 0.0 .. 1.0
  keyColorB: f32,          // 0.0 .. 1.0
  invertMask: u32,         // 0: false, 1: true
  blendMode: u32,          // 0: normal, 1: add, 2: screen, 3: mult
  masterGain: f32,         // 0.0 .. 2.0
  outputMode: u32,         // 0: composite, 1: matte only, 2: fg keyed only
  padding: f32,
};

@group(0) @binding(0) var<uniform> uniforms: KeyMixerUniforms;
@group(0) @binding(1) var bgTex: texture_2d<f32>;
@group(0) @binding(2) var fgTex: texture_2d<f32>;
@group(0) @binding(3) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn blend(dst: vec4<f32>, src_rgb: vec3<f32>, src_a: f32, mode: u32) -> vec4<f32> {
  let sa = clamp(src_a, 0.0, 1.0);
  let sc = src_rgb;

  if (mode == 0u) { // Normal / Over
    let out_rgb = sc * sa + dst.rgb * (1.0 - sa);
    let out_a = sa + dst.a * (1.0 - sa);
    return vec4<f32>(out_rgb, out_a);
  } else if (mode == 1u) { // Add
    return vec4<f32>(dst.rgb + (sc * sa), max(dst.a, sa));
  } else if (mode == 2u) { // Screen
    let screened = 1.0 - (1.0 - dst.rgb) * (1.0 - sc * sa);
    return vec4<f32>(screened, max(dst.a, sa));
  } else if (mode == 3u) { // Mult
    let prod = dst.rgb * sc;
    let out_rgb = mix(dst.rgb, prod, sa);
    let out_a = max(dst.a, sa);
    return vec4<f32>(out_rgb, out_a);
  }
  return dst;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let bg = textureSample(bgTex, sourceSampler, in.uv);
  let fg = textureSample(fgTex, sourceSampler, in.uv);

  var matte = 1.0;
  var deSpilled = fg.rgb;

  if (uniforms.mode == 0u) {
    // LUMA KEYING
    let luma = dot(fg.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let tLow = clamp(uniforms.threshold - uniforms.tolerance * 0.5, 0.0, 1.0);
    let tHigh = clamp(uniforms.threshold + max(uniforms.tolerance * 0.5, 0.001), 0.001, 1.0);
    matte = smoothstep(tLow, tHigh, luma);
  } else {
    // CHROMA KEYING
    let keyCol = vec3<f32>(uniforms.keyColorR, uniforms.keyColorG, uniforms.keyColorB);
    let dist = length(fg.rgb - keyCol);
    let tLow = clamp(uniforms.threshold, 0.0, 1.0);
    let tHigh = clamp(uniforms.threshold + max(uniforms.tolerance, 0.001), 0.001, 2.0);
    matte = smoothstep(tLow, tHigh, dist);

    // Edge Spill Suppression: desaturate key color fringing
    if (uniforms.spillSuppression > 0.0) {
      if (uniforms.keyColorG > uniforms.keyColorR && uniforms.keyColorG > uniforms.keyColorB) {
        // Green spill suppression
        let maxOther = max(fg.r, fg.b);
        if (fg.g > maxOther) {
          deSpilled.g = mix(fg.g, maxOther, uniforms.spillSuppression);
        }
      } else if (uniforms.keyColorB > uniforms.keyColorR && uniforms.keyColorB > uniforms.keyColorG) {
        // Blue spill suppression
        let maxOther = max(fg.r, fg.g);
        if (fg.b > maxOther) {
          deSpilled.b = mix(fg.b, maxOther, uniforms.spillSuppression);
        }
      } else {
        // Red / general spill suppression
        let maxOther = max(fg.g, fg.b);
        if (fg.r > maxOther) {
          deSpilled.r = mix(fg.r, maxOther, uniforms.spillSuppression);
        }
      }
    }
  }

  // Optional mask inversion
  if (uniforms.invertMask == 1u) {
    matte = 1.0 - matte;
  }
  matte = clamp(matte * fg.a, 0.0, 1.0);

  // Matte only preview mode
  if (uniforms.outputMode == 1u) {
    return vec4<f32>(vec3<f32>(matte), 1.0);
  }

  // Keyed FG only mode (with transparent BG)
  if (uniforms.outputMode == 2u) {
    return vec4<f32>(deSpilled * matte, matte);
  }

  // Composite over BG
  let composited = blend(bg, deSpilled, matte, uniforms.blendMode);
  let final_rgb = clamp(composited.rgb * uniforms.masterGain, vec3<f32>(0.0), vec3<f32>(1.0));
  let final_alpha = clamp(composited.a, 0.0, 1.0);

  return vec4<f32>(final_rgb, final_alpha);
}
`;
