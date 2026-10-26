export const UVDisplaceWGSL = `
struct UVDisplaceUniforms {
  amountX: f32,
  amountY: f32,
  mode: u32,       // 0: cartesian, 1: radial, 2: luma
  wrapMode: u32,   // 0: clamp, 1: wrap, 2: mirror
};

@group(0) @binding(0) var<uniform> uniforms: UVDisplaceUniforms;
@group(0) @binding(1) var mainSampler: sampler;
@group(0) @binding(2) var mainTexture: texture_2d<f32>;
@group(0) @binding(3) var mapTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let mapSample = textureSample(mapTexture, mainSampler, uv);

  var warp = vec2<f32>(0.0, 0.0);

  if (uniforms.mode == 0u) {
    // CARTESIAN VECTOR MODE: Red drives X, Green drives Y (-0.5 .. +0.5 bipolar)
    warp = (mapSample.rg - vec2<f32>(0.5, 0.5)) * vec2<f32>(uniforms.amountX, uniforms.amountY);
  } else if (uniforms.mode == 1u) {
    // RADIAL / POLAR MODE: Displace outward from center based on map luminance
    let luma = dot(mapSample.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let dir = uv - vec2<f32>(0.5, 0.5);
    let len = length(dir);
    let normDir = select(vec2<f32>(0.0, 1.0), dir / max(len, 0.0001), len > 0.0001);
    warp = normDir * (luma - 0.5) * uniforms.amountX;
  } else {
    // LUMA GRADIENT MODE: Uses luma for diagonal refraction
    let luma = dot(mapSample.rgb, vec3<f32>(0.299, 0.587, 0.114));
    warp = vec2<f32>(luma - 0.5, (mapSample.r - mapSample.b) * 0.5) * vec2<f32>(uniforms.amountX, uniforms.amountY);
  }

  var p = uv + warp;

  if (uniforms.wrapMode == 0u) {
    // CLAMP
    p = clamp(p, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
  } else if (uniforms.wrapMode == 1u) {
    // WRAP / REPEAT
    p = fract(p);
  } else {
    // MIRROR
    let fl = floor(p);
    let fr = fract(p);
    p = select(fr, vec2<f32>(1.0) - fr, vec2<bool>(u32(abs(fl.x)) % 2u == 1u, u32(abs(fl.y)) % 2u == 1u));
  }

  return textureSample(mainTexture, mainSampler, p);
}
`;
