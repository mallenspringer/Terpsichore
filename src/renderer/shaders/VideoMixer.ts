export const VideoMixerWGSL = `
struct VideoMixerUniforms {
  v1: f32,
  v2: f32,
  v3: f32,
  v4: f32,
  v1Alpha: f32,
  v2Alpha: f32,
  v3Alpha: f32,
  v4Alpha: f32,
  v1Mode: u32, // 0: normal, 1: add, 2: screen, 3: mult
  v2Mode: u32,
  v3Mode: u32,
  v4Mode: u32,
  masterGain: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> uniforms: VideoMixerUniforms;
@group(0) @binding(1) var t1: texture_2d<f32>;
@group(0) @binding(2) var t2: texture_2d<f32>;
@group(0) @binding(3) var t3: texture_2d<f32>;
@group(0) @binding(4) var t4: texture_2d<f32>;
@group(0) @binding(5) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn blend(dst: vec4<f32>, src: vec4<f32>, level: f32, alpha: f32, mode: u32) -> vec4<f32> {
  // Combine input alpha with fader level and manual alpha control
  let src_a = clamp(src.a * alpha * level, 0.0, 1.0);
  let src_c = src.rgb * level;

  if (mode == 0u) { // Normal (Over operator)
    let out_rgb = src_c * src_a + dst.rgb * (1.0 - src_a);
    let out_a = src_a + dst.a * (1.0 - src_a);
    return vec4<f32>(out_rgb, out_a);
  } else if (mode == 1u) { // Add
    return vec4<f32>(dst.rgb + (src_c * src_a), max(dst.a, src_a));
  } else if (mode == 2u) { // Screen
    let screened = 1.0 - (1.0 - dst.rgb) * (1.0 - src_c * src_a);
    return vec4<f32>(screened, max(dst.a, src_a));
  } else if (mode == 3u) { // Mult
    let multed = dst.rgb * mix(vec3<f32>(1.0), src_c, src_a);
    return vec4<f32>(multed, dst.a);
  }
  return dst;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let c1 = textureSample(t1, sourceSampler, in.uv);
  let c2 = textureSample(t2, sourceSampler, in.uv);
  let c3 = textureSample(t3, sourceSampler, in.uv);
  let c4 = textureSample(t4, sourceSampler, in.uv);

  // Start with pure transparent alpha (0.0)
  var res = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  
  // Blend layers in order (bottom to top)
  res = blend(res, c1, uniforms.v1, uniforms.v1Alpha, uniforms.v1Mode);
  res = blend(res, c2, uniforms.v2, uniforms.v2Alpha, uniforms.v2Mode);
  res = blend(res, c3, uniforms.v3, uniforms.v3Alpha, uniforms.v3Mode);
  res = blend(res, c4, uniforms.v4, uniforms.v4Alpha, uniforms.v4Mode);

  // Apply master gain and force alpha to 1.0 for final output
  let final_rgb = clamp(res.rgb * uniforms.masterGain, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(final_rgb, 1.0);
}
`;
