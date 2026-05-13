export const VideoMixerWGSL = `
struct VideoMixerUniforms {
  v1: f32,
  v2: f32,
  v3: f32,
  v4: f32,
  v1Mode: u32, // 0: normal, 1: add, 2: screen, 3: mult
  v2Mode: u32,
  v3Mode: u32,
  v4Mode: u32,
  masterGain: f32,
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

fn blend(dst: vec3<f32>, src: vec3<f32>, fader: f32, mode: u32) -> vec3<f32> {
  let s = src * fader;
  if (mode == 0u) { // Normal (Crossfade/Overlay)
    return mix(dst, src, fader);
  } else if (mode == 1u) { // Add
    return clamp(dst + s, vec3<f32>(0.0), vec3<f32>(2.0)); // allow some headroom before final clamp
  } else if (mode == 2u) { // Screen
    return 1.0 - (1.0 - dst) * (1.0 - s);
  } else if (mode == 3u) { // Mult
    return dst * mix(vec3<f32>(1.0), src, fader);
  }
  return dst;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let c1 = textureSample(t1, sourceSampler, in.uv).rgb;
  let c2 = textureSample(t2, sourceSampler, in.uv).rgb;
  let c3 = textureSample(t3, sourceSampler, in.uv).rgb;
  let c4 = textureSample(t4, sourceSampler, in.uv).rgb;

  var res = vec3<f32>(0.0, 0.0, 0.0);
  
  res = blend(res, c1, uniforms.v1, uniforms.v1Mode);
  res = blend(res, c2, uniforms.v2, uniforms.v2Mode);
  res = blend(res, c3, uniforms.v3, uniforms.v3Mode);
  res = blend(res, c4, uniforms.v4, uniforms.v4Mode);

  return vec4<f32>(clamp(res * uniforms.masterGain, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
