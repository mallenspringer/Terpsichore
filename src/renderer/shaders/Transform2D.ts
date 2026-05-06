export const Transform2DWGSL = `
struct TransformUniforms {
  translate: vec2<f32>,
  scale: vec2<f32>,
  rotation: f32, // in radians
  spin: f32,     // degrees per second
  time: f32,
  aspect: f32,
};

@group(0) @binding(0) var<uniform> uniforms: TransformUniforms;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var uv = in.uv;
  uv = uv - 0.5;
  
  // 1. Aspect Correction: Square the coordinate space before rotating
  uv.x = uv.x * uniforms.aspect;

  // 2. Calculate total rotation: Base Offset + (Velocity * Time)
  let total_rot = uniforms.rotation + (uniforms.spin * uniforms.time * 0.0174533);
  
  // 3. Scale
  uv = uv / uniforms.scale;
  
  // 4. Rotate in "Square" space
  let c = cos(-total_rot);
  let s = sin(-total_rot);
  uv = vec2<f32>(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
  
  // 5. Un-correct Aspect: Return to stretched canvas space
  uv.x = uv.x / uniforms.aspect;

  // 6. Translate
  uv = uv - uniforms.translate;
  uv = uv + 0.5;

  let color = textureSample(sourceTexture, sourceSampler, uv);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
  
  return color;
}
`;
