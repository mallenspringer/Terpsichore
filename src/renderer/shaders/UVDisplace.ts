export const UVDisplaceWGSL = `
struct UVDisplaceUniforms {
  amountX: f32,
  amountY: f32,
  mode: u32,       // 0: cartesian, 1: radial, 2: luma
  wrapMode: u32,   // 0: clamp, 1: wrap, 2: mirror, 3: soft_wrap
  polarity: u32,   // 0: bipolar, 1: unipolar
  edgeFalloff: f32,// 0.0 .. 0.5 (margin width to smoothly fade warp near boundaries)
  softWrapWidth: f32, // crossfade width for soft wrap (e.g. 0.12)
  _pad: f32,
};

@group(0) @binding(0) var<uniform> uniforms: UVDisplaceUniforms;
@group(0) @binding(1) var mainSampler: sampler;
@group(0) @binding(2) var mainTexture: texture_2d<f32>;
@group(0) @binding(3) var mapTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn getSoftCoord(coord: f32, w: f32) -> vec4<f32> {
  let frac = coord - floor(coord);
  if (frac >= w && frac <= (1.0 - w)) {
    return vec4<f32>(frac, frac, 0.0, 0.0);
  }
  var t: f32;
  if (frac > (1.0 - w)) {
    t = (frac - (1.0 - w)) / (2.0 * w);
  } else {
    t = (frac + w) / (2.0 * w);
  }
  let x_out = (1.0 - w) + t * w;
  let x_in = t * w;
  let weight = smoothstep(0.0, 1.0, t);
  return vec4<f32>(x_out, x_in, weight, 1.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let mapSample = textureSampleLevel(mapTexture, mainSampler, uv, 0.0);

  var warp = vec2<f32>(0.0, 0.0);

  if (uniforms.mode == 0u) {
    // CARTESIAN VECTOR MODE
    var mapOffset = mapSample.rg;
    if (uniforms.polarity == 0u) {
      // Bipolar: -0.5 .. +0.5 (neutral gray 0.5 = 0 offset)
      mapOffset = mapOffset - vec2<f32>(0.5, 0.5);
    }
    // Unipolar: 0.0 .. +1.0 (black 0.0 = 0 offset)
    warp = mapOffset * vec2<f32>(uniforms.amountX, uniforms.amountY);
  } else if (uniforms.mode == 1u) {
    // RADIAL / POLAR MODE
    let luma = dot(mapSample.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let dir = uv - vec2<f32>(0.5, 0.5);
    let len = length(dir);
    let normDir = select(vec2<f32>(0.0, 1.0), dir / max(len, 0.0001), len > 0.0001);
    var mag = luma;
    if (uniforms.polarity == 0u) {
      mag = luma - 0.5;
    }
    warp = normDir * mag * uniforms.amountX;
  } else {
    // LUMA GRADIENT MODE
    let luma = dot(mapSample.rgb, vec3<f32>(0.299, 0.587, 0.114));
    var lumaOffset = luma;
    if (uniforms.polarity == 0u) {
      lumaOffset = luma - 0.5;
    }
    warp = vec2<f32>(lumaOffset, (mapSample.r - mapSample.b) * 0.5) * vec2<f32>(uniforms.amountX, uniforms.amountY);
  }

  // Edge Falloff: smoothly attenuates displacement to zero near the outer canvas boundaries
  if (uniforms.edgeFalloff > 0.001) {
    let edgeDist = min(uv, vec2<f32>(1.0) - uv);
    let falloff = smoothstep(vec2<f32>(0.0), vec2<f32>(uniforms.edgeFalloff), edgeDist);
    warp = warp * falloff.x * falloff.y;
  }

  var p = uv + warp;

  if (uniforms.wrapMode == 0u) {
    // CLAMP
    p = clamp(p, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
    return textureSampleLevel(mainTexture, mainSampler, p, 0.0);
  } else if (uniforms.wrapMode == 1u) {
    // WRAP / REPEAT
    p = fract(p);
    return textureSampleLevel(mainTexture, mainSampler, p, 0.0);
  } else if (uniforms.wrapMode == 2u) {
    // MIRROR
    let fl = floor(p);
    let fr = fract(p);
    p = select(fr, vec2<f32>(1.0) - fr, vec2<bool>(u32(abs(fl.x)) % 2u == 1u, u32(abs(fl.y)) % 2u == 1u));
    return textureSampleLevel(mainTexture, mainSampler, p, 0.0);
  } else {
    // SOFT WRAP (SEAMLESS OVERLAP CROSSFADE)
    let w = clamp(uniforms.softWrapWidth, 0.02, 0.45);
    let cx = getSoftCoord(p.x, w);
    let cy = getSoftCoord(p.y, w);

    if (cx.w < 0.5 && cy.w < 0.5) {
      return textureSampleLevel(mainTexture, mainSampler, vec2<f32>(cx.x, cy.x), 0.0);
    }
    let s00 = textureSampleLevel(mainTexture, mainSampler, vec2<f32>(cx.x, cy.x), 0.0);
    let s10 = textureSampleLevel(mainTexture, mainSampler, vec2<f32>(cx.y, cy.x), 0.0);
    let s01 = textureSampleLevel(mainTexture, mainSampler, vec2<f32>(cx.x, cy.y), 0.0);
    let s11 = textureSampleLevel(mainTexture, mainSampler, vec2<f32>(cx.y, cy.y), 0.0);

    let top = mix(s00, s10, cx.z);
    let bot = mix(s01, s11, cx.z);
    return mix(top, bot, cy.z);
  }
}
`;
