export const SimpleFeedbackWGSL = `
struct FeedbackUniforms {
  feedbackAmount: f32,
  zoom: f32,
  angle: f32,
};

@group(0) @binding(0) var<uniform> uniforms: FeedbackUniforms;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>; // Current frame
@group(0) @binding(2) var prevTexture: texture_2d<f32>; // Previous frame
@group(0) @binding(3) var texSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let current = textureSample(sourceTexture, texSampler, in.uv);
  
  // Transform UVs for previous frame (zoom & rotate)
  var prevUv = in.uv;
  prevUv = prevUv - 0.5;
  
  // Zoom
  prevUv = prevUv / uniforms.zoom;
  
  // Rotate
  let c = cos(-uniforms.angle);
  let s = sin(-uniforms.angle);
  let rotUV = vec2<f32>(
    prevUv.x * c - prevUv.y * s,
    prevUv.x * s + prevUv.y * c
  );
  prevUv = rotUV;
  
  prevUv = prevUv + 0.5;
  
  var previous = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  let prevSample = textureSample(prevTexture, texSampler, prevUv);
  if (prevUv.x >= 0.0 && prevUv.x <= 1.0 && prevUv.y >= 0.0 && prevUv.y <= 1.0) {
    previous = prevSample;
  }
  
  // Mix current and transformed previous frame
  // The current frame usually has alpha. We blend them based on feedbackAmount.
  let blended = mix(current, previous, uniforms.feedbackAmount);
  
  // If current frame has high alpha, it should overwrite the feedback (standard over composite)
  // Actually, a classic video feedback loop usually adds or screen-blends, or simply mixes.
  // For standard "trail" feedback, we want the current frame to appear solid on top of the fading trail.
  let finalRgb = current.rgb * current.a + blended.rgb * (1.0 - current.a) * uniforms.feedbackAmount;
  let finalAlpha = max(current.a, previous.a * uniforms.feedbackAmount);
  
  return vec4<f32>(finalRgb, finalAlpha);
}
`;
