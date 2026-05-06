export const LumaSplitterWGSL = `
struct Uniforms {
    threshold1: f32,
    threshold2: f32,
    softness: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct FragmentOutput {
    @location(0) composite: vec4<f32>,
    @location(1) low: vec4<f32>,
    @location(2) mid: vec4<f32>,
    @location(3) high: vec4<f32>,
};

@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> FragmentOutput {
    let color = textureSample(srcTex, smp, uv);
    
    // Perceived luminance (ITU-R BT.601)
    let luma = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    
    let s = max(uniforms.softness, 0.001);
    
    // Calculate masks with smooth transitions
    // Low band: 1.0 below threshold1
    let low_mask = 1.0 - smoothstep(uniforms.threshold1 - s, uniforms.threshold1 + s, luma);
    
    // Mid band: 1.0 between threshold1 and threshold2
    let mid_mask = smoothstep(uniforms.threshold1 - s, uniforms.threshold1 + s, luma) * 
                  (1.0 - smoothstep(uniforms.threshold2 - s, uniforms.threshold2 + s, luma));
                  
    // High band: 1.0 above threshold2
    let high_mask = smoothstep(uniforms.threshold2 - s, uniforms.threshold2 + s, luma);
    
    var out: FragmentOutput;
    out.composite = color; // Passthrough
    out.low = vec4<f32>(vec3<f32>(low_mask), 1.0);
    out.mid = vec4<f32>(vec3<f32>(mid_mask), 1.0);
    out.high = vec4<f32>(vec3<f32>(high_mask), 1.0);
    
    return out;
}
`;
