export const AlphaAdjustWGSL = `
struct AlphaAdjustUniforms {
    amount: f32,
    bypass: f32,
    padding: vec2<f32>
};

@group(0) @binding(0) var mainTexture: texture_2d<f32>;
@group(0) @binding(1) var mainSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: AlphaAdjustUniforms;

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / vec2<f32>(textureDimensions(mainTexture));
    var color = textureSample(mainTexture, mainSampler, uv);
    
    if (uniforms.bypass > 0.5) {
        return color;
    }
    
    color.a *= clamp(uniforms.amount, 0.0, 1.0);
    
    return color;
}
`;
