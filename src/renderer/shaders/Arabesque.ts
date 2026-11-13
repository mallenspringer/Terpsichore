export const ArabesqueRenderWGSL = /* wgsl */ `
struct ArabesqueSegment {
  p0: vec2<f32>,
  p1: vec2<f32>,
  n0: vec2<f32>,
  n1: vec2<f32>,
  w0: f32,
  w1: f32,
  arc0: f32,
  arc1: f32,
  eraseDist: f32,
  retractMax: f32,
  paletteT: f32,
  fadeAlpha: f32,
  depthNorm: f32,
  flags: f32,
  curvature: f32,
  randSeed: f32,
};

struct ArabesqueRenderUniforms {
  aspect: f32,
  time: f32,
  ornateTips: f32,
  colorPreset: f32,
  useCustomPalette: f32,
  customColorCount: f32,
  customInterpolation: f32,
  pad0: f32,
  customColors: array<vec4<f32>, 8>,
  customPositions: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> u: ArabesqueRenderUniforms;
@group(0) @binding(1) var<storage, read> segments: array<ArabesqueSegment>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uNorm: f32,
  @location(1) vWorld: f32,
  @location(2) segLen: f32,
  @location(3) @interpolate(flat) segIdx: u32,
};

fn getCustomPos(idx: u32) -> f32 {
  let vecIdx = idx / 4u;
  let compIdx = idx % 4u;
  let v = u.customPositions[vecIdx];
  if (compIdx == 0u) { return v.x; }
  if (compIdx == 1u) { return v.y; }
  if (compIdx == 2u) { return v.z; }
  return v.w;
}

fn sampleCustomPalette(tIn: f32) -> vec4<f32> {
  let count = u32(clamp(u.customColorCount, 1.0, 8.0));
  let t = fract(tIn);
  if (count == 1u) { return u.customColors[0]; }
  var leftIdx = 0u;
  var rightIdx = count - 1u;
  for (var i = 0u; i < 8u; i = i + 1u) {
    if (i >= count) { break; }
    if (getCustomPos(i) <= t) { leftIdx = i; }
  }
  rightIdx = min(count - 1u, leftIdx + 1u);
  let pos0 = getCustomPos(leftIdx);
  let pos1 = getCustomPos(rightIdx);
  let c0 = u.customColors[leftIdx];
  let c1 = u.customColors[rightIdx];
  let span = max(0.0001, pos1 - pos0);
  var factor = clamp((t - pos0) / span, 0.0, 1.0);
  if (u.customInterpolation < 0.5) {
    factor = 0.0;
  } else if (u.customInterpolation > 1.5) {
    factor = smoothstep(0.0, 1.0, factor);
  }
  return mix(c0, c1, factor);
}

fn samplePresetPalette(tIn: f32, depthNorm: f32) -> vec3<f32> {
  let preset = u32(u.colorPreset + 0.5);
  let t = fract(tIn);

  if (preset == 1u) {
    // Obsidian Ink & Silverleaf
    let c0 = vec3<f32>(0.12, 0.14, 0.18);
    let c1 = vec3<f32>(0.62, 0.68, 0.76);
    let c2 = vec3<f32>(0.94, 0.96, 1.00);
    let col = select(mix(c0, c1, t * 2.0), mix(c1, c2, (t - 0.5) * 2.0), t > 0.5);
    return mix(col, c2, depthNorm * 0.25);
  } else if (preset == 2u) {
    // Crimson Damask
    let c0 = vec3<f32>(0.42, 0.04, 0.10);
    let c1 = vec3<f32>(0.88, 0.18, 0.24);
    let c2 = vec3<f32>(0.98, 0.66, 0.34);
    let col = select(mix(c0, c1, t * 2.0), mix(c1, c2, (t - 0.5) * 2.0), t > 0.5);
    return mix(col, c2, depthNorm * 0.22);
  } else if (preset == 3u) {
    // Bioluminescent Filigree
    let c0 = vec3<f32>(0.08, 0.85, 0.78);
    let c1 = vec3<f32>(0.32, 0.48, 1.00);
    let c2 = vec3<f32>(0.96, 0.32, 0.86);
    let col = select(mix(c0, c1, t * 2.0), mix(c1, c2, (t - 0.5) * 2.0), t > 0.5);
    return mix(col, vec3<f32>(0.85, 1.0, 0.98), depthNorm * 0.2);
  }

  // Gold Leaf & Ivory (default)
  let c0 = vec3<f32>(0.76, 0.52, 0.18);
  let c1 = vec3<f32>(0.98, 0.82, 0.38);
  let c2 = vec3<f32>(0.96, 0.94, 0.84);
  let col = select(mix(c0, c1, t * 2.0), mix(c1, c2, (t - 0.5) * 2.0), t > 0.5);
  return mix(col, c2, depthNorm * 0.22);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  var out: VertexOutput;
  out.segIdx = instanceIndex;

  let s = segments[instanceIndex];
  let segVec = s.p1 - s.p0;
  let segLen = max(0.0001, length(segVec));
  let fwd = segVec / segLen;
  out.segLen = segLen;

  if (s.fadeAlpha <= 0.005 || s.arc1 <= s.eraseDist || s.arc0 >= s.retractMax) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    out.uNorm = 0.0;
    out.vWorld = 0.0;
    return out;
  }

  let flagsU = u32(s.flags + 0.25);
  let isTip = (flagsU & 1u) != 0u;
  let isSeedStart = (flagsU & 4u) != 0u;
  let isLiveHead = (flagsU & 8u) != 0u;

  let uMin = select(0.0, -(s.w0 * 1.4) / segLen, isSeedStart);
  let tipExt = select(1.4, 3.6, u.ornateTips > 0.5 && isTip) * max(s.w1, 0.006);
  let uMax = select(1.0, 1.0 + tipExt / segLen, isTip || isLiveHead);

  let ornateMul = select(1.45, 3.4, u.ornateTips > 0.5);
  let halfPad = max(s.w0, s.w1) * ornateMul + 0.0045;

  var quadU = array<f32, 6>(uMin, uMax, uMin, uMax, uMax, uMin);
  var quadS = array<f32, 6>(-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);

  let uT = quadU[vertexIndex];
  let side = quadS[vertexIndex];

  let basePos = mix(s.p0, s.p1, uT);
  let endCapExtra = select(vec2<f32>(0.0), fwd * ((uT - 1.0) * segLen), uT > 1.0);
  let startCapExtra = select(vec2<f32>(0.0), fwd * (uT * segLen), uT < 0.0);
  let spinePos = select(basePos, s.p1 + endCapExtra, uT > 1.0);
  let finalSpine = select(spinePos, s.p0 + startCapExtra, uT < 0.0);

  let nBlend = normalize(mix(s.n0, s.n1, clamp(uT, 0.0, 1.0)));
  let worldPos = finalSpine + nBlend * (side * halfPad);

  out.position = vec4<f32>(worldPos.x / u.aspect, worldPos.y, 0.0, 1.0);
  out.uNorm = uT;
  out.vWorld = side * halfPad;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let s = segments[in.segIdx];
  let flagsU = u32(s.flags + 0.25);
  let isTip = (flagsU & 1u) != 0u;
  let isFork = (flagsU & 2u) != 0u;
  let isSeedStart = (flagsU & 4u) != 0u;
  let isLiveHead = (flagsU & 8u) != 0u;

  let uClamp = clamp(in.uNorm, 0.0, 1.0);
  let arcHere = mix(s.arc0, s.arc1, in.uNorm);

  // Clean root-to-tip & tip-to-root clipping along topological distance
  let eraseEdge = smoothstep(s.eraseDist - 0.008, s.eraseDist + 0.022, arcHere);
  let retractEdge = select(1.0, smoothstep(s.retractMax + 0.008, s.retractMax - 0.022, arcHere), s.retractMax < 1e5);
  let lifeMask = eraseEdge * retractEdge * s.fadeAlpha;
  if (lifeMask <= 0.01) { discard; }

  // Strict non-overlapping seam guard between consecutive interior segments
  if (!isSeedStart && in.uNorm < 0.0) { discard; }
  if (!isTip && !isLiveHead && in.uNorm > 1.0) { discard; }

  let aa = 0.0018;
  let wHere = mix(s.w0, s.w1, uClamp);

  // Core ribbon stroke SDF (with rounded caps at seed origin and scroll tips)
  var dMain = abs(in.vWorld) - wHere;
  if (isSeedStart && in.uNorm < 0.0) {
    let axial = -in.uNorm * in.segLen;
    dMain = length(vec2<f32>(axial, in.vWorld)) - s.w0;
  } else if ((isTip || isLiveHead) && in.uNorm > 1.0) {
    let axial = (in.uNorm - 1.0) * in.segLen;
    dMain = length(vec2<f32>(axial, in.vWorld)) - s.w1;
  }

  var cov = smoothstep(aa, -aa, dMain);

  // Optional Paisley & Pinstripe Ornamentation
  var ornamentAccent = 0.0;
  if (u.ornateTips > 0.5) {
    let curlSign = select(-1.0, 1.0, s.curvature >= 0.0);

    // 1. Pinstripe flanking seed beads along primary & secondary curves
    if (s.depthNorm < 0.7) {
      let beadSpacing = max(0.024, wHere * 4.4);
      let beadU = (fract(arcHere / beadSpacing) - 0.5) * beadSpacing;
      let beadOffset = wHere * 1.65 * (-curlSign);
      let beadR = wHere * 0.34;
      let dBead = length(vec2<f32>(beadU, in.vWorld - beadOffset)) - beadR;
      let beadFade = smoothstep(0.04, 0.14, s.arc0) * smoothstep(0.75, 0.25, s.depthNorm);
      let beadCov = smoothstep(aa, -aa, dBead) * beadFade * 0.92;
      cov = max(cov, beadCov);
      ornamentAccent = max(ornamentAccent, beadCov * 0.45);
    }

    // 2. Teardrop pearl / volute jewel at terminal spiral tips
    if (isTip) {
      let axial = (in.uNorm - 1.0) * in.segLen;
      let bulbOffset = s.w1 * 1.45;
      let bulbCenter = vec2<f32>(bulbOffset, curlSign * s.w1 * 0.45);
      let pLocal = vec2<f32>(axial, in.vWorld) - bulbCenter;
      let jewelR = max(0.0028, s.w1 * 1.25);
      let dJewel = length(vec2<f32>(pLocal.x * 0.82, pLocal.y * 1.05)) - jewelR;
      let jewelCov = smoothstep(aa, -aa, dJewel);
      cov = max(cov, jewelCov);
      ornamentAccent = max(ornamentAccent, jewelCov * 0.65);
    }

    // 3. Delicate paisley / leaf comma nestled at branch forks
    if (isFork && in.uNorm >= 0.15 && in.uNorm <= 0.95) {
      let fU = (in.uNorm - 0.55) * in.segLen;
      let fV = in.vWorld + curlSign * wHere * 1.55;
      let commaR = wHere * 0.72;
      let dComma = length(vec2<f32>(fU * 0.65, fV * 1.35)) - commaR;
      let commaCov = smoothstep(aa, -aa, dComma);
      cov = max(cov, commaCov);
      ornamentAccent = max(ornamentAccent, commaCov * 0.55);
    }
  }

  if (cov <= 0.01) { discard; }

  var baseCol: vec3<f32>;
  if (u.useCustomPalette > 0.5) {
    baseCol = sampleCustomPalette(s.paletteT).rgb;
  } else {
    baseCol = samplePresetPalette(s.paletteT, s.depthNorm);
  }

  // Subtle calligraphic sheen along centerline + ornamental highlights
  let centerSheen = smoothstep(wHere, 0.0, abs(in.vWorld)) * 0.14;
  let col = min(vec3<f32>(1.0), baseCol + vec3<f32>(centerSheen + ornamentAccent * 0.18));

  return vec4<f32>(col, cov * lifeMask);
}
`;

