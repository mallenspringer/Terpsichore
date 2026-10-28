export const CanvasBackgroundWGSL = `
struct CanvasBackgroundUniforms {
  colorA: vec4<f32>,
  colorB: vec4<f32>,
  colorC: vec4<f32>,
  mode: u32,             // 0: solid, 1: linear, 2: radial
  useThreeColors: u32,   // 0: 2 colors, 1: 3 colors
  angleRad: f32,
  spread: f32,           // 0..1 midpoint
  radialCenterX: f32,
  radialCenterY: f32,
  radialRadius: f32,
  lumaMod: f32,
  chromaMod: f32,
  aspectRatio: f32,
  useCustomPalette: u32, // 0: standard 2/3 colors, 1: custom palette
  customColorCount: u32,
  customInterpolation: u32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
  customColors: array<vec4<f32>, 8>,
  customPositions: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> u: CanvasBackgroundUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

fn adjustColor(col: vec4<f32>, lumaOffset: f32, chromaScale: f32) -> vec4<f32> {
  var hsv = rgb2hsv(col.rgb);
  hsv.y = clamp(hsv.y * max(0.0, 1.0 + chromaScale), 0.0, 1.0);
  hsv.z = clamp(hsv.z + lumaOffset, 0.0, 1.0);
  let rgb = hsv2rgb(hsv);
  return vec4<f32>(rgb, col.a);
}

fn getCustomStopPos(idx: u32) -> f32 {
  if (idx == 0u) { return u.customPositions[0].x; }
  if (idx == 1u) { return u.customPositions[0].y; }
  if (idx == 2u) { return u.customPositions[0].z; }
  if (idx == 3u) { return u.customPositions[0].w; }
  if (idx == 4u) { return u.customPositions[1].x; }
  if (idx == 5u) { return u.customPositions[1].y; }
  if (idx == 6u) { return u.customPositions[1].z; }
  return u.customPositions[1].w;
}

fn sampleCustomPalette(tIn: f32) -> vec4<f32> {
  let count = u.customColorCount;
  if (count <= 1u) {
    return u.customColors[0];
  }
  let t = clamp(tIn, 0.0, 1.0);
  let interp = u.customInterpolation;

  // 1. Stepped mode: discrete color slices where width equals weight percentage
  if (interp == 1u) {
    let p0 = getCustomStopPos(0u);
    if (t < p0) {
      return u.customColors[count - 1u];
    }
    for (var i = 0u; i < count; i = i + 1u) {
      let pLow = getCustomStopPos(i);
      var pHigh = 1.0;
      if (i + 1u < count) {
        pHigh = getCustomStopPos(i + 1u);
      }
      if (t >= pLow && (t < pHigh || i == count - 1u)) {
        return u.customColors[i];
      }
    }
    return u.customColors[count - 1u];
  }

  // 2. Linear & Smooth modes: proportional spacing analog with midpoints
  let p0 = getCustomStopPos(0u);
  let p1 = getCustomStopPos(1u);
  let mFirst = (p0 + p1) * 0.5;
  let mLastLow = getCustomStopPos(count - 1u);
  let mLast = (mLastLow + 1.0) * 0.5;

  if (t <= mFirst) {
    return u.customColors[0];
  }
  if (t >= mLast) {
    return u.customColors[count - 1u];
  }

  for (var i = 0u; i < count - 1u; i = i + 1u) {
    let pi0 = getCustomStopPos(i);
    let pi1 = getCustomStopPos(i + 1u);
    var pi2 = 1.0;
    if (i + 2u < count) {
      pi2 = getCustomStopPos(i + 2u);
    }
    let m0 = (pi0 + pi1) * 0.5;
    let m1 = (pi1 + pi2) * 0.5;

    if (t >= m0 && t <= m1) {
      let span = max(0.0001, m1 - m0);
      var segT = clamp((t - m0) / span, 0.0, 1.0);
      if (interp == 2u) {
        segT = smoothstep(0.0, 1.0, segT);
      }
      return mix(u.customColors[i], u.customColors[i + 1u], segT);
    }
  }

  return u.customColors[count - 1u];
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;

  if (u.useCustomPalette == 1u) {
    if (u.mode == 0u) {
      return adjustColor(u.customColors[0], u.lumaMod, u.chromaMod);
    }
    var t: f32 = 0.0;
    if (u.mode == 1u) {
      let centered = uv - vec2<f32>(0.5, 0.5);
      let dir = vec2<f32>(cos(u.angleRad), sin(u.angleRad));
      let proj = dot(centered, dir);
      t = clamp(proj + 0.5, 0.0, 1.0);
    } else if (u.mode == 2u) {
      let center = vec2<f32>(u.radialCenterX, u.radialCenterY);
      var dVec = uv - center;
      dVec.x = dVec.x * u.aspectRatio;
      let maxDist = max(0.001, u.radialRadius);
      t = clamp(length(dVec) / maxDist, 0.0, 1.0);
    }
    let mid = clamp(u.spread, 0.01, 0.99);
    var mappedT: f32 = t;
    if (t < mid) {
      mappedT = 0.5 * (t / mid);
    } else {
      mappedT = 0.5 + 0.5 * ((t - mid) / (1.0 - mid));
    }
    let palCol = sampleCustomPalette(mappedT);
    return adjustColor(palCol, u.lumaMod, u.chromaMod);
  }

  let colA = adjustColor(u.colorA, u.lumaMod, u.chromaMod);
  let colB = adjustColor(u.colorB, u.lumaMod, u.chromaMod);
  let colC = adjustColor(u.colorC, u.lumaMod, u.chromaMod);

  if (u.mode == 0u) {
    return colA;
  }

  var t: f32 = 0.0;
  if (u.mode == 1u) {
    // Linear gradient along angle
    let centered = uv - vec2<f32>(0.5, 0.5);
    let dir = vec2<f32>(cos(u.angleRad), sin(u.angleRad));
    let proj = dot(centered, dir);
    t = clamp(proj + 0.5, 0.0, 1.0);
  } else if (u.mode == 2u) {
    // Radial gradient
    let center = vec2<f32>(u.radialCenterX, u.radialCenterY);
    var dVec = uv - center;
    dVec.x = dVec.x * u.aspectRatio;
    let maxDist = max(0.001, u.radialRadius);
    t = clamp(length(dVec) / maxDist, 0.0, 1.0);
  }

  // Apply spread / midpoint bias
  let mid = clamp(u.spread, 0.01, 0.99);
  var mappedT: f32 = t;
  if (t < mid) {
    mappedT = 0.5 * (t / mid);
  } else {
    mappedT = 0.5 + 0.5 * ((t - mid) / (1.0 - mid));
  }

  if (u.useThreeColors == 1u) {
    if (mappedT < 0.5) {
      let localT = mappedT * 2.0;
      return mix(colA, colB, localT);
    } else {
      let localT = (mappedT - 0.5) * 2.0;
      return mix(colB, colC, localT);
    }
  } else {
    return mix(colA, colB, mappedT);
  }
}
`;
