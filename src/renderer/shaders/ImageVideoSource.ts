export const ImageVideoSourceWGSL = `
struct MediaUniforms {
  objectFit: f32, // 0.0 = cover, 1.0 = contain, 2.0 = fill
  mediaRatio: f32,
  canvasRatio: f32,
  mirror: f32,    // 0.0 = normal, 1.0 = mirrored horizontally
};

@group(0) @binding(0) var<uniform> uniforms: MediaUniforms;
@group(0) @binding(1) var mediaTexture: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var uv = in.uv;
  if (uniforms.mirror > 0.5) {
    uv.x = 1.0 - uv.x;
  }

  if (uniforms.objectFit < 0.5) { // Cover
    if (uniforms.mediaRatio > uniforms.canvasRatio) {
      let scale = uniforms.canvasRatio / uniforms.mediaRatio;
      uv.x = (uv.x - 0.5) * scale + 0.5;
    } else {
      let scale = uniforms.mediaRatio / uniforms.canvasRatio;
      uv.y = (uv.y - 0.5) * scale + 0.5;
    }
  } else if (uniforms.objectFit < 1.5) { // Contain
    if (uniforms.mediaRatio > uniforms.canvasRatio) {
      let scale = uniforms.mediaRatio / uniforms.canvasRatio;
      uv.y = (uv.y - 0.5) * scale + 0.5;
    } else {
      let scale = uniforms.canvasRatio / uniforms.mediaRatio;
      uv.x = (uv.x - 0.5) * scale + 0.5;
    }
  }

  let color = textureSample(mediaTexture, texSampler, uv);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  return color;
}
`;

export const VideoSourceWGSL = `
struct MediaUniforms {
  objectFit: f32, // 0.0 = cover, 1.0 = contain, 2.0 = fill
  mediaRatio: f32,
  canvasRatio: f32,
  mirror: f32,    // 0.0 = normal, 1.0 = mirrored horizontally
};

@group(0) @binding(0) var<uniform> uniforms: MediaUniforms;
@group(0) @binding(1) var videoTexture: texture_external;
@group(0) @binding(2) var texSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_video(in: VertexOutput) -> @location(0) vec4<f32> {
  var uv = in.uv;
  if (uniforms.mirror > 0.5) {
    uv.x = 1.0 - uv.x;
  }

  if (uniforms.objectFit < 0.5) { // Cover
    if (uniforms.mediaRatio > uniforms.canvasRatio) {
      let scale = uniforms.canvasRatio / uniforms.mediaRatio;
      uv.x = (uv.x - 0.5) * scale + 0.5;
    } else {
      let scale = uniforms.mediaRatio / uniforms.canvasRatio;
      uv.y = (uv.y - 0.5) * scale + 0.5;
    }
  } else if (uniforms.objectFit < 1.5) { // Contain
    if (uniforms.mediaRatio > uniforms.canvasRatio) {
      let scale = uniforms.mediaRatio / uniforms.canvasRatio;
      uv.y = (uv.y - 0.5) * scale + 0.5;
    } else {
      let scale = uniforms.canvasRatio / uniforms.mediaRatio;
      uv.x = (uv.x - 0.5) * scale + 0.5;
    }
  }

  let color = textureSampleBaseClampToEdge(videoTexture, texSampler, uv);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  return color;
}
`;
