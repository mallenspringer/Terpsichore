export const AlphaAdjustWGSL = `
struct AlphaAdjustUniforms {
    amount: f32,
    bypass: f32,
    pad0: f32,
    pad1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: AlphaAdjustUniforms;
@group(0) @binding(1) var mainTexture: texture_2d<f32>;
@group(0) @binding(2) var mainSampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var color = textureSample(mainTexture, mainSampler, uv);
    
    if (uniforms.bypass > 0.5) {
        return color;
    }
    
    color.a = clamp(color.a * uniforms.amount, 0.0, 1.0);
    
    return color;
}
`;
