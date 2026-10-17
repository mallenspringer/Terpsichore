export const VideoMathWGSL = `
struct VideoMathUniforms {
  operation: u32,   // 0: add, 1: subtract, 2: multiply, 3: min, 4: max, 5: difference, 6: screen, 7: divide, 8: average
  gainA: f32,
  gainB: f32,
  offset: f32,
  clampOutput: u32, // 0: false, 1: true
  masterGain: f32,
  pad0: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: VideoMathUniforms;
@group(0) @binding(1) var aTex: texture_2d<f32>;
@group(0) @binding(2) var bTex: texture_2d<f32>;
@group(0) @binding(3) var sourceSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let sampleA = textureSample(aTex, sourceSampler, in.uv);
  let sampleB = textureSample(bTex, sourceSampler, in.uv);

  let a = sampleA.rgb * uniforms.gainA;
  let b = sampleB.rgb * uniforms.gainB;
  var res = vec3<f32>(0.0);

  switch (uniforms.operation) {
    case 0u: { // Add
      res = a + b;
    }
    case 1u: { // Subtract
      res = a - b;
    }
    case 2u: { // Multiply
      res = a * b;
    }
    case 3u: { // Min
      res = min(a, b);
    }
    case 4u: { // Max
      res = max(a, b);
    }
    case 5u: { // Difference
      res = abs(a - b);
    }
    case 6u: { // Screen
      res = 1.0 - (1.0 - a) * (1.0 - b);
    }
    case 7u: { // Divide
      res = a / max(b, vec3<f32>(0.001));
    }
    case 8u: { // Average
      res = (a + b) * 0.5;
    }
    default: {
      res = a + b;
    }
  }

  res = (res + uniforms.offset) * uniforms.masterGain;

  if (uniforms.clampOutput == 1u) {
    res = clamp(res, vec3<f32>(0.0), vec3<f32>(1.0));
  }

  let outAlpha = max(sampleA.a, sampleB.a);
  return vec4<f32>(res, outAlpha);
}
`;
