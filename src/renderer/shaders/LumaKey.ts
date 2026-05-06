export const LumaKeyWGSL = `
struct LumaUniforms {
  threshold: f32,
  tolerance: f32,
  invertKey: u32,
};

@group(0) @binding(0) var<uniform> uniforms: LumaUniforms;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var color = textureSample(sourceTexture, sourceSampler, in.uv);
  
  // Calculate relative luminance (Rec. 709)
  let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  
  var alpha = 1.0;
  
  let lower = uniforms.threshold - uniforms.tolerance / 2.0;
  let upper = uniforms.threshold + uniforms.tolerance / 2.0;
  
  if (uniforms.tolerance == 0.0) {
    alpha = step(uniforms.threshold, luma);
  } else {
    alpha = smoothstep(lower, upper, luma);
  }
  
  if (uniforms.invertKey > 0u) {
    alpha = 1.0 - alpha;
  }

  // Combine with original alpha
  return vec4<f32>(color.rgb, color.a * alpha);
}
`;
