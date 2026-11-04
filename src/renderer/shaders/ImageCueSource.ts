export const ImageCueSourceWGSL = `
struct CueUniforms {
  objectFit: u32,          // 0 = fill, 1 = cover, 2 = contain, 3 = center
  transitionType: u32,     // 0 = cut, 1 = crossfade, 2 = fade_black
  transitionProgress: f32, // 0.0 to 1.0
  canvasRatio: f32,
  mediaRatioCurrent: f32,
  mediaRatioPrev: f32,
  scaleXCurrent: f32,      // canvasWidth / mediaWidthCurrent
  scaleXPrev: f32,         // canvasWidth / mediaWidthPrev
};

@group(0) @binding(0) var<uniform> uniforms: CueUniforms;
@group(0) @binding(1) var textureCurrent: texture_2d<f32>;
@group(0) @binding(2) var texturePrev: texture_2d<f32>;
@group(0) @binding(3) var texSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn computeUV(rawUV: vec2<f32>, fit: u32, mediaRatio: f32, canvasRatio: f32, scale1to1X: f32) -> vec2<f32> {
  var uv = rawUV;
  if (fit == 0u) {
    // Fill (stretch) - unmodified
    return uv;
  } else if (fit == 1u) {
    // Cover
    if (mediaRatio > canvasRatio) {
      let scale = canvasRatio / mediaRatio;
      uv.x = (uv.x - 0.5) * scale + 0.5;
    } else {
      let scale = mediaRatio / canvasRatio;
      uv.y = (uv.y - 0.5) * scale + 0.5;
    }
  } else if (fit == 2u) {
    // Contain
    if (mediaRatio > canvasRatio) {
      let scale = mediaRatio / canvasRatio;
      uv.y = (uv.y - 0.5) * scale + 0.5;
    } else {
      let scale = canvasRatio / mediaRatio;
      uv.x = (uv.x - 0.5) * scale + 0.5;
    }
  } else if (fit == 3u) {
    // Center (1:1 native pixel scale & true aspect ratio, never stretched/skewed)
    let scaleX = max(scale1to1X, 0.0001);
    let scaleY = scaleX * (mediaRatio / canvasRatio);
    uv.x = (uv.x - 0.5) * scaleX + 0.5;
    uv.y = (uv.y - 0.5) * scaleY + 0.5;
  }
  return uv;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let p = clamp(uniforms.transitionProgress, 0.0, 1.0);

  // Sample both textures unconditionally in uniform control flow (WGSL requirement)
  let uvCurr = computeUV(in.uv, uniforms.objectFit, uniforms.mediaRatioCurrent, uniforms.canvasRatio, uniforms.scaleXCurrent);
  let rawCurr = textureSample(textureCurrent, texSampler, uvCurr);
  let inBoundsCurr = uvCurr.x >= 0.0 && uvCurr.x <= 1.0 && uvCurr.y >= 0.0 && uvCurr.y <= 1.0;
  let colorCurr = select(vec4<f32>(0.0), rawCurr, inBoundsCurr);

  let uvPrev = computeUV(in.uv, uniforms.objectFit, uniforms.mediaRatioPrev, uniforms.canvasRatio, uniforms.scaleXPrev);
  let rawPrev = textureSample(texturePrev, texSampler, uvPrev);
  let inBoundsPrev = uvPrev.x >= 0.0 && uvPrev.x <= 1.0 && uvPrev.y >= 0.0 && uvPrev.y <= 1.0;
  let colorPrev = select(vec4<f32>(0.0), rawPrev, inBoundsPrev);

  // Fast path: Hard Cut or transition complete
  if (uniforms.transitionType == 0u || p >= 1.0) {
    return colorCurr;
  }

  if (uniforms.transitionType == 1u) {
    // Crossfade (smooth alpha and color blend)
    return mix(colorPrev, colorCurr, p);
  } else if (uniforms.transitionType == 2u) {
    // Fade out / Fade in (dips down to 0 at p=0.5, then rises up)
    if (p < 0.5) {
      let t = 1.0 - (p * 2.0);
      return colorPrev * t;
    } else {
      let t = (p - 0.5) * 2.0;
      return colorCurr * t;
    }
  }

  return colorCurr;
}
`;
