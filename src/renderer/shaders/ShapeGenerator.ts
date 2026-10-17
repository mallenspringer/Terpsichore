export const ShapeGeneratorWGSL = `
struct Uniforms {
  shapeType: u32,       // 0 = rect, 1 = ellipse, 2 = polygon
  strokeMode: u32,      // 0 = classic, 1 = hollow
  strokeThreshold: f32,
  morph: f32,           // Continuous morph factor [0.0 to 1.0]
  fillColor: vec4<f32>,
  edgeSoftness: f32,
  sides: f32,
  roundness: f32,
  convexity: f32,       // User's "Star Amount"
  rotation: f32,
  strokeWidth: f32,
  aspect: f32,
  scale: f32,
  offset: vec2<f32>,
  pad4: f32,
  pad5: f32,
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

fn sdf_rect(p: vec2<f32>, roundness: f32) -> f32 {
  let size = vec2<f32>(1.0 - roundness);
  let d2 = abs(p) - size;
  return length(max(d2, vec2<f32>(0.0))) + min(max(d2.x, d2.y), 0.0) - roundness;
}

fn sdf_circle(p: vec2<f32>) -> f32 {
  return length(p) - 1.0;
}

fn sdf_polygon(p: vec2<f32>, sides: f32, roundness: f32, convexity: f32) -> f32 {
  let PI = 3.14159265;
  let n = max(3.0, sides);
  let an = PI / n;
  let r_outer = 1.0 - roundness;
  let r_poly = r_outer * cos(an);
  let r_inner = mix(r_poly, 0.0, convexity);
  let v_outer = vec2<f32>(0.0, -r_outer);
  let v_inner = rotate(vec2<f32>(0.0, -r_inner), an);
  let angle = atan2(p.y, p.x) + PI / 2.0;
  let a = (fract(angle / (2.0 * an) + 0.5) - 0.5) * (2.0 * an);
  var pf = length(p) * vec2<f32>(abs(sin(a)), -cos(a));
  let ba = v_inner - v_outer;
  let pa = pf - v_outer;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  let dist = length(pa - ba * h);
  let side = pa.x * ba.y - pa.y * ba.x;
  return dist * sign(side) - roundness;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var uv = in.uv;

  // Center and Aspect Correction
  var p = (uv * 2.0 - 1.0);
  p = p / 0.85; // Global safety margin to prevent edge clipping
  
  // 1. Internal Translate (Bipolar -1 to 1)
  p = p - (uniforms.offset);

  // 2. Internal Scale
  p = p / max(0.001, uniforms.scale);

  // 3. Aspect Correction
  p.x = p.x * uniforms.aspect; 
  
  // 4. Internal Rotation
  p = rotate(p, uniforms.rotation * 0.0174533); 
  
  let d_rect = sdf_rect(p, uniforms.roundness);
  let d_circ = sdf_circle(p);
  let d_poly = sdf_polygon(p, uniforms.sides, uniforms.roundness, uniforms.convexity);

  var d: f32 = 0.0;
  let morphFactor = clamp(uniforms.morph, 0.0, 1.0);

  if (uniforms.shapeType == 0u) {
    // Rect morphs towards circle
    d = mix(d_rect, d_circ, morphFactor);
  } else if (uniforms.shapeType == 1u) {
    // Circle morphs towards polygon/star
    d = mix(d_circ, d_poly, morphFactor);
  } else {
    // Polygon/Star morphs towards rectangle
    d = mix(d_poly, d_rect, morphFactor);
  }

  var shape_alpha: f32 = 0.0;
  let softness = max(0.001, uniforms.edgeSoftness);
  let threshold = uniforms.strokeThreshold;

  if (uniforms.strokeWidth <= threshold) {
    // Below threshold = Solid Fill
    shape_alpha = 1.0 - smoothstep(0.0, softness, d);
  } else {
    var actual_stroke = uniforms.strokeWidth;
    if (uniforms.strokeMode == 1u) {
      // Hollow Mode: scale from fattest to thinnest
      let range = 1.0 - threshold;
      let progress = clamp((uniforms.strokeWidth - threshold) / max(0.001, range), 0.0, 1.0);
      actual_stroke = mix(1.0, 0.001, progress);
    }
    
    let half_stroke = actual_stroke * 0.5;
    let stroke_d = abs(d) - half_stroke;
    shape_alpha = 1.0 - smoothstep(0.0, softness, stroke_d);
  }
  return vec4<f32>(uniforms.fillColor.rgb, uniforms.fillColor.a * shape_alpha);
}
`;
