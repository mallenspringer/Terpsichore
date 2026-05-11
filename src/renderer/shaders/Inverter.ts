export const InverterWGSL = `
  @group(0) @binding(0) var<uniform> params: vec4<f32>; // x: mix, y: videoMode (0:rgb, 1:luma, 2:chroma), z: active (0/1), w: unused
  @group(0) @binding(1) var src: texture_2d<f32>;
  @group(0) @binding(2) var smp: sampler;

  @fragment fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let color = textureSample(src, smp, uv);
    if (params.z < 0.5) { return color; }

    var inverted = color.rgb;
    let mode = i32(params.y);

    if (mode == 0) {
      // Full RGB Invert
      inverted = 1.0 - color.rgb;
    } else if (mode == 1) {
      // Luma Only Invert (Invert lightness, maintain hue/sat)
      let luma = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
      let invLuma = 1.0 - luma;
      if (luma > 0.001) {
        inverted = color.rgb * (invLuma / luma);
      } else {
        inverted = vec3<f32>(invLuma);
      }
    } else if (mode == 2) {
      // Chroma Only Invert (Invert hue/sat, maintain luma)
      let luma = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
      let invColor = 1.0 - color.rgb;
      let invLuma = dot(invColor, vec3<f32>(0.299, 0.587, 0.114));
      if (invLuma > 0.001) {
        inverted = invColor * (luma / invLuma);
      } else {
        inverted = vec3<f32>(luma);
      }
    }

    let finalRgb = mix(color.rgb, inverted, params.x);
    return vec4<f32>(finalRgb, color.a);
  }
`;
