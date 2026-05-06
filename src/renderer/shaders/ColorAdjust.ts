export const ColorAdjustWGSL = `
struct ColorUniforms {
  hue: f32,
  saturation: f32,
  contrast: f32,
  brightness: f32,
  invert: u32,
};

@group(0) @binding(0) var<uniform> uniforms: ColorUniforms;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

// RGB to HSV conversion
fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
    let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));

    let d = q.x - min(q.w, q.y);
    let e = 1.0e-10;
    return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB conversion
fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var color = textureSample(sourceTexture, sourceSampler, in.uv);
  if (color.a == 0.0) {
    return color; // Preserve pure transparency
  }

  // Hue and Saturation
  var hsv = rgb2hsv(color.rgb);
  hsv.x = fract(hsv.x + uniforms.hue / 360.0);
  hsv.y = clamp(hsv.y * uniforms.saturation, 0.0, 1.0);
  var rgb = hsv2rgb(hsv);

  // Brightness and Contrast
  rgb = rgb + uniforms.brightness;
  rgb = (rgb - 0.5) * uniforms.contrast + 0.5;
  rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

  // Invert
  if (uniforms.invert > 0u) {
    rgb = vec3<f32>(1.0) - rgb;
  }

  return vec4<f32>(rgb, color.a);
}
`;
