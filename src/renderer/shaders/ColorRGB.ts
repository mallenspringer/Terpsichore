export const ColorRGBWGSL = `
struct ColorRGBUniforms {
  r: f32,
  g: f32,
  b: f32,
  hasVInput: u32,
  hasRInput: u32,
  hasGInput: u32,
  hasBInput: u32,
  rMode: u32, // 0 = add, 1 = mult
  gMode: u32, // 0 = add, 1 = mult
  bMode: u32, // 0 = add, 1 = mult
  rInputMode: u32, // 0 = channel, 1 = luma
  gInputMode: u32, // 0 = channel, 1 = luma
  bInputMode: u32, // 0 = channel, 1 = luma
};

@group(0) @binding(0) var<uniform> uniforms: ColorRGBUniforms;
@group(0) @binding(1) var vTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@group(0) @binding(3) var rTexture: texture_2d<f32>;
@group(0) @binding(4) var gTexture: texture_2d<f32>;
@group(0) @binding(5) var bTexture: texture_2d<f32>;

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

fn get_luma(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
  let hasV = uniforms.hasVInput > 0u;
  let hasR = uniforms.hasRInput > 0u;
  let hasG = uniforms.hasGInput > 0u;
  let hasB = uniforms.hasBInput > 0u;
  let hasAnyInput = hasV || hasR || hasG || hasB;

  if (!hasAnyInput) {
    let finalR = clamp(uniforms.r, 0.0, 1.0);
    let finalG = clamp(uniforms.g, 0.0, 1.0);
    let finalB = clamp(uniforms.b, 0.0, 1.0);
    let comp = vec4<f32>(finalR, finalG, finalB, 1.0);
    return FragmentOutput(
      comp,
      vec4<f32>(finalR, 0.0, 0.0, 1.0),
      vec4<f32>(0.0, finalG, 0.0, 1.0),
      vec4<f32>(0.0, 0.0, finalB, 1.0)
    );
  }

  var baseRGB: vec3<f32>;
  var alpha: f32 = 1.0;

  if (hasV) {
    let samp = textureSample(vTexture, sourceSampler, in.uv);
    baseRGB = samp.rgb;
    alpha = samp.a;
  } else {
    baseRGB = vec3<f32>(0.0, 0.0, 0.0);
  }

  // Add discrete inputs
  if (hasR) {
    let samp = textureSample(rTexture, sourceSampler, in.uv).rgb;
    if (uniforms.rInputMode == 1u) {
      baseRGB.r += get_luma(samp);
    } else {
      baseRGB.r += samp.r;
    }
  }
  if (hasG) {
    let samp = textureSample(gTexture, sourceSampler, in.uv).rgb;
    if (uniforms.gInputMode == 1u) {
      baseRGB.g += get_luma(samp);
    } else {
      baseRGB.g += samp.g;
    }
  }
  if (hasB) {
    let samp = textureSample(bTexture, sourceSampler, in.uv).rgb;
    if (uniforms.bInputMode == 1u) {
      baseRGB.b += get_luma(samp);
    } else {
      baseRGB.b += samp.b;
    }
  }

  var finalR = baseRGB.r;
  var finalG = baseRGB.g;
  var finalB = baseRGB.b;

  // Process channels using mapped fader values from Renderer
  if (uniforms.rMode == 0u) { finalR = clamp(finalR + uniforms.r, 0.0, 1.0); }
  else { finalR = clamp(finalR * uniforms.r, 0.0, 1.0); }
  
  if (uniforms.gMode == 0u) { finalG = clamp(finalG + uniforms.g, 0.0, 1.0); }
  else { finalG = clamp(finalG * uniforms.g, 0.0, 1.0); }
  
  if (uniforms.bMode == 0u) { finalB = clamp(finalB + uniforms.b, 0.0, 1.0); }
  else { finalB = clamp(finalB * uniforms.b, 0.0, 1.0); }

  let composite = vec4<f32>(finalR, finalG, finalB, alpha);
  
  return FragmentOutput(
    composite,
    vec4<f32>(finalR, 0.0, 0.0, 1.0),
    vec4<f32>(0.0, finalG, 0.0, 1.0),
    vec4<f32>(0.0, 0.0, finalB, 1.0)
  );
}
`;
