export const SpawnWGSL = `
struct SpawnUniforms {
  pos: vec2<f32>,
  scale: f32,
  rotation: f32,
  opacity: f32,
  aspect: f32,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: SpawnUniforms;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var uv = in.uv;
  
  // 1. Center the UVs (-0.5 to 0.5)
  var p = uv - 0.5;
  
  // 2. Apply Aspect Correction to the coordinate system
  p.x = p.x * uniforms.aspect;

  // 3. Translation (Bipolar -1 to 1)
  // We subtract the uniform because we are moving the LOOKUP 
  // opposite to the intended object movement.
  p.x = p.x - uniforms.pos.x * uniforms.aspect;
  p.y = p.y - uniforms.pos.y;

  // 4. Scale (Standard division for zoom)
  p = p / uniforms.scale;

  // 5. Rotation
  let c = cos(-uniforms.rotation);
  let s = sin(-uniforms.rotation);
  p = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);

  // 6. Restore Aspect and Un-center
  p.x = p.x / uniforms.aspect;
  let final_uv = p + 0.5;

  // 7. Sample (Always call this outside of branches)
  let color = textureSample(sourceTexture, sourceSampler, final_uv);

  // 8. Bounds Check (Apply as a mask to avoid divergent control flow)
  let mask = step(0.0, final_uv.x) * step(final_uv.x, 1.0) * 
             step(0.0, final_uv.y) * step(final_uv.y, 1.0);

  return vec4<f32>(color.rgb, color.a * uniforms.opacity * mask);
}
`;
