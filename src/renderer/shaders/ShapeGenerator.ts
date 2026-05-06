export const ShapeGeneratorWGSL = `
struct Uniforms {
  shapeType: u32, // 0 = rect, 1 = ellipse, 2 = polygon
  fillColor: vec4<f32>,
  tiling: vec2<f32>,
  tilingMode: u32, 
  edgeSoftness: f32,
  sides: f32,
  roundness: f32,
  convexity: f32, // User's "Star Amount"
  rotation: f32,
  strokeWidth: f32,
  aspect: f32,
  offset: vec2<f32>,
  scale: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn rotate(p: vec2<f32>, angle: f32) -> vec2<f32> {
  let s = sin(angle);
  let c = cos(angle);
  return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var uv = in.uv;
  
  if (uniforms.tilingMode == 0u) {
    uv = fract(uv * uniforms.tiling);
  } else if (uniforms.tilingMode == 1u) {
    uv = abs(fract(uv * uniforms.tiling * 0.5 - 0.5) * 2.0 - 1.0);
  } else {
    uv = uv * uniforms.tiling;
  }

  // Center and Aspect Correction
  var p = (uv * 2.0 - 1.0);
  p = p / 0.85; // Global safety margin to prevent edge clipping
  
  // 1. Internal Translate (Bipolar -1 to 1)
  p = p - (uniforms.offset);

  // 2. Internal Scale
  p = p / uniforms.scale;

  // 3. Aspect Correction
  p.x = p.x * uniforms.aspect; 
  
  // 4. Internal Rotation
  p = rotate(p, uniforms.rotation * 0.0174533); 
  
  var d: f32 = 0.0;
  
  if (uniforms.shapeType == 0u) {
    let size = vec2<f32>(1.0 - uniforms.roundness);
    let d2 = abs(p) - size;
    d = length(max(d2, vec2<f32>(0.0))) + min(max(d2.x, d2.y), 0.0) - uniforms.roundness;
  } else if (uniforms.shapeType == 1u) {
    d = length(p) - 1.0;
  } else {
    let PI = 3.14159265;
    let n = max(3.0, uniforms.sides);
    let an = PI / n;
    let r_outer = 1.0 - uniforms.roundness;
    let r_poly = r_outer * cos(an);
    let r_inner = mix(r_poly, 0.0, uniforms.convexity);
    let v_outer = vec2<f32>(0.0, -r_outer);
    let v_inner = rotate(vec2<f32>(0.0, -r_inner), an);
    let angle = atan2(p.y, p.x) + PI/2.0;
    let a = (fract(angle / (2.0 * an) + 0.5) - 0.5) * (2.0 * an);
    var pf = length(p) * vec2<f32>(abs(sin(a)), -cos(a));
    let ba = v_inner - v_outer;
    let pa = pf - v_outer;
    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    let dist = length(pa - ba * h);
    let side = pa.x * ba.y - pa.y * ba.x;
    d = dist * sign(side) - uniforms.roundness;
  }

  var shape_alpha: f32 = 0.0;
  let softness = max(0.001, uniforms.edgeSoftness);
  if (uniforms.strokeWidth <= 0.0) {
    shape_alpha = 1.0 - smoothstep(0.0, softness, d);
  } else {
    let half_stroke = uniforms.strokeWidth * 0.5;
    let stroke_d = abs(d) - half_stroke;
    shape_alpha = 1.0 - smoothstep(0.0, softness, stroke_d);
  }
  return vec4<f32>(uniforms.fillColor.rgb, uniforms.fillColor.a * shape_alpha);
}
`;
