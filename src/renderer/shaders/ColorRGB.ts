export const ColorRGBWGSL = `
struct ColorRGBUniforms {
  r: f32,
  g: f32,
  b: f32,
  hasInput: u32,
  rMode: u32, // 0 = add, 1 = mult
  gMode: u32, // 0 = add, 1 = mult
  bMode: u32, // 0 = add, 1 = mult
};

@group(0) @binding(0) var<uniform> uniforms: ColorRGBUniforms;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct FragmentOutput {
  @location(0) composite: vec4<f32>,
  @location(1) red: vec4<f32>,
  @location(2) green: vec4<f32>,
  @location(3) blue: vec4<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
  var base: vec4<f32>;
  let hasInput = uniforms.hasInput > 0u;
  
  if (hasInput) {
    base = textureSample(sourceTexture, sourceSampler, in.uv);
  } else {
    base = vec4<f32>(1.0, 1.0, 1.0, 1.0); 
  }

  var finalR = base.r;
  var finalG = base.g;
  var finalB = base.b;

  // Process channels using mapped fader values from Renderer
  if (uniforms.rMode == 0u) { finalR = clamp(finalR + uniforms.r, 0.0, 1.0); }
  else { finalR = clamp(finalR * uniforms.r, 0.0, 1.0); }
  
  if (uniforms.gMode == 0u) { finalG = clamp(finalG + uniforms.g, 0.0, 1.0); }
  else { finalG = clamp(finalG * uniforms.g, 0.0, 1.0); }
  
  if (uniforms.bMode == 0u) { finalB = clamp(finalB + uniforms.b, 0.0, 1.0); }
  else { finalB = clamp(finalB * uniforms.b, 0.0, 1.0); }

  let composite = vec4<f32>(finalR, finalG, finalB, base.a);
  
  return FragmentOutput(
    composite,
    vec4<f32>(finalR, 0.0, 0.0, 1.0),
    vec4<f32>(0.0, finalG, 0.0, 1.0),
    vec4<f32>(0.0, 0.0, finalB, 1.0)
  );
}
`;
