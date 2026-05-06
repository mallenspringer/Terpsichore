export const RGBMixerWGSL = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> levels: vec4<f32>; // r, g, b, unused
@group(0) @binding(1) var r_tex: texture_2d<f32>;
@group(0) @binding(2) var g_tex: texture_2d<f32>;
@group(0) @binding(3) var b_tex: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let r_samp = textureSample(r_tex, smp, in.uv).r * levels.r;
    let g_samp = textureSample(g_tex, smp, in.uv).g * levels.g;
    let b_samp = textureSample(b_tex, smp, in.uv).b * levels.b;

    // Output composite RGB. 
    // We assume the inputs are single-channel masks or colored textures.
    // If they are colored textures, we take the dominant channel or sum them.
    // Given the "Style 2" workflow, they are usually grayscale masks colorized by an RGB module.
    
    let r_full = textureSample(r_tex, smp, in.uv).rgb * levels.r;
    let g_full = textureSample(g_tex, smp, in.uv).rgb * levels.g;
    let b_full = textureSample(b_tex, smp, in.uv).rgb * levels.b;

    return vec4<f32>(r_full + g_full + b_full, 1.0);
}
`;
