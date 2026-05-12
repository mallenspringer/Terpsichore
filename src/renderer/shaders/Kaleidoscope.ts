export const KaleidoscopeWGSL = `
struct Uniforms {
  segments: f32,
  angle: f32,
  zoom: f32,
  centerX: f32,
  centerY: f32,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var mainSampler: sampler;
@group(0) @binding(2) var mainTexture: texture_2d<f32>;

const PI: f32 = 3.14159265359;

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var p = uv - vec2<f32>(uniforms.centerX, uniforms.centerY);
    
    let r = length(p);
    var a = atan2(p.y, p.x) + uniforms.angle * (PI / 180.0);
    
    let seg = max(1.0, uniforms.segments);
    let sides = 2.0 * PI / seg;
    
    a = (fract(a / sides + 0.5) - 0.5) * sides;
    a = abs(a);
    
    p = vec2<f32>(cos(a), sin(a)) * r * uniforms.zoom;
    p = p + vec2<f32>(uniforms.centerX, uniforms.centerY);
    
    // Simple wrapping
    p = fract(p);
    
    return textureSample(mainTexture, mainSampler, p);
}
`;
