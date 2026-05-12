export const PatternWGSL = `
struct Uniforms {
  countX: f32,
  countY: f32,
  spacingX: f32,
  spacingY: f32,
  offsetX: f32,
  offsetY: f32,
  alternateMirrorX: u32,
  alternateMirrorY: u32,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var mainSampler: sampler;
@group(0) @binding(2) var mainTexture: texture_2d<f32>;

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var p = uv;
    
    // Scale and tile
    p.x = p.x * uniforms.countX + (p.y * uniforms.offsetX);
    p.y = p.y * uniforms.countY + (p.x * uniforms.offsetY);
    
    let cellX = floor(p.x);
    let cellY = floor(p.y);
    
    p = fract(p);
    
    // Mirroring
    if (uniforms.alternateMirrorX == 1u && u32(cellX) % 2u == 1u) {
        p.x = 1.0 - p.x;
    }
    if (uniforms.alternateMirrorY == 1u && u32(cellY) % 2u == 1u) {
        p.y = 1.0 - p.y;
    }
    
    // Spacing (squeeze the UVs)
    let sx = 1.0 + uniforms.spacingX;
    let sy = 1.0 + uniforms.spacingY;
    p = (p - 0.5) * vec2<f32>(sx, sy) + 0.5;
    
    // Mask for spacing (clamp to border)
    var mask = 1.0;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
        mask = 0.0;
    }
    
    let color = textureSample(mainTexture, mainSampler, p);
    return color * mask;
}
`;
