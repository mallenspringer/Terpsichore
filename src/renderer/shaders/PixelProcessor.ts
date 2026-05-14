
export const PixelProcessorFragmentWGSL = `
struct PixelUniforms {
    posterizeActive: u32,
    posterizeLevels: f32,
    thresholdActive: u32,
    thresholdValue: f32,
    thresholdSoftness: f32,
    edgeActive: u32,
    edgeAmount: f32,
    edgeThreshold: f32,
    bypass: u32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
};

@group(0) @binding(0) var<uniform> ui: PixelUniforms;
@group(0) @binding(1) var t_input: texture_2d<f32>;
@group(0) @binding(2) var s_input: sampler;

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    if (ui.bypass != 0u) {
        return textureSample(t_input, s_input, uv);
    }

    var color = textureSample(t_input, s_input, uv);
    var res = color.rgb;

    // 1. Posterize
    if (ui.posterizeActive != 0u) {
        let levels = max(1.0, ui.posterizeLevels);
        res = floor(res * levels) / levels;
    }

    // 2. Threshold
    if (ui.thresholdActive != 0u) {
        let luma = dot(res, vec3<f32>(0.299, 0.587, 0.114));
        let soft = max(0.001, ui.thresholdSoftness);
        let val = smoothstep(ui.thresholdValue - soft, ui.thresholdValue + soft, luma);
        res = vec3<f32>(val);
    }

    // 3. Edge Detection (Sobel-ish)
    if (ui.edgeActive != 0u) {
        let size = vec2<f32>(textureDimensions(t_input));
        let texel = 1.0 / size;
        
        let lumaCenter = dot(res, vec3<f32>(0.299, 0.587, 0.114));
        
        // Simple finite difference for edges
        let lumaR = dot(textureSample(t_input, s_input, uv + vec2<f32>(texel.x, 0.0)).rgb, vec3<f32>(0.299, 0.587, 0.114));
        let lumaU = dot(textureSample(t_input, s_input, uv + vec2<f32>(0.0, texel.y)).rgb, vec3<f32>(0.299, 0.587, 0.114));
        
        let edge = abs(lumaR - lumaCenter) + abs(lumaU - lumaCenter);
        let edgeVal = smoothstep(ui.edgeThreshold, ui.edgeThreshold + 0.05, edge);
        
        res = mix(res, vec3<f32>(1.0), edgeVal * ui.edgeAmount);
    }

    return vec4<f32>(res, color.a);
}
`;
