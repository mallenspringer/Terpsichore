export const TriggeredGateWGSL = `
struct Params {
  gate_active: f32
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    if (params.gate_active > 0.5) {
        return textureSample(srcTex, smp, uv);
    } else {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
}
`;
