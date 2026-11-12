export const VideoFeedbackWGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct FeedbackProUniforms {
  params0: vec4<f32>, // x = gain, y = zoom, z = rotationRad, w = twist (vortex torque)
  params1: vec4<f32>, // x = driftX, y = driftY, z = pivotX, w = pivotY
  params2: vec4<f32>, // x = lumaWarp, y = lumaTwist, z = rgbDispersion, w = hueShiftRad
  params3: vec4<f32>, // x = softKnee, y = edgeRollOff, z = blendMode (0=normal, 1=add, 2=screen, 3=diff, 4=max), w = processTarget (0=canvas, 1=bounded)
  params4: vec4<f32>, // x = isFrozen, y = hasMask, z = aspect, w = timeSec
  params5: vec4<f32>, // x = edgeMode (0=clamp, 1=wrap, 2=mirror), y = tunnelWarp, z = pivotOrbit, w = pivotOrbitSpeed
};

@group(0) @binding(0) var<uniform> u: FeedbackProUniforms;
@group(0) @binding(1) var currTex: texture_2d<f32>;
@group(0) @binding(2) var fbTex: texture_2d<f32>;
@group(0) @binding(3) var maskTex: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var out: VertexOutput;
  out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
  out.uv = pos[vertexIndex] * 0.5 + 0.5;
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

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

fn wrapUV(uv: vec2<f32>, mode: f32) -> vec2<f32> {
  if (mode > 1.5) {
    // 2: Mirror (Kaleidoscopic triangle wave fold in [0, 1])
    let t = fract(uv * 0.5) * 2.0;
    let m = 1.0 - abs(t - vec2<f32>(1.0));
    return clamp(m, vec2<f32>(0.0005), vec2<f32>(0.9995));
  } else if (mode > 0.5) {
    // 1: Wrap (Toroidal conveyor / infinite repeat in [0, 1))
    let w = fract(uv);
    return clamp(w, vec2<f32>(0.0005), vec2<f32>(0.9995));
  }
  // 0: Clamp (Edge boundary hold)
  return clamp(uv, vec2<f32>(0.0005), vec2<f32>(0.9995));
}

struct FragmentOutput {
  @location(0) videoOut: vec4<f32>,
  @location(1) matteOut: vec4<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
  var out: FragmentOutput;

  // Live input baseline sample
  let currRaw = textureSampleLevel(currTex, smp, in.uv, 0.0);

  // Upstream bounded target: if upstream graphic is fully transparent, discard
  if (u.params3.w > 0.5 && currRaw.a < 0.002) {
    out.videoOut = vec4<f32>(0.0);
    out.matteOut = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return out;
  }

  // Freeze check: when frozen, input video is cut so the loop spins endlessly
  var inputColor = currRaw;
  if (u.params4.x > 0.5) {
    inputColor = vec4<f32>(0.0);
  }

  // Sample feedback history luminance at current coordinate to drive luma warping & twisting
  let localSample = textureSampleLevel(fbTex, smp, in.uv, 0.0);
  let localLuma = dot(localSample.rgb, vec3<f32>(0.299, 0.587, 0.114));

  // Autonomous Pivot Orbit: circular gyroscopic wander
  let orbitRadius = u.params5.z;
  let orbitSpeed = u.params5.w;
  var orbitOffset = vec2<f32>(0.0);
  if (orbitRadius > 0.0001) {
    let orbitAngle = u.params4.w * orbitSpeed * 6.2831853;
    orbitOffset = vec2<f32>(cos(orbitAngle), sin(orbitAngle)) * orbitRadius;
  }
  let pivot = clamp(vec2<f32>(u.params1.z, u.params1.w) + orbitOffset, vec2<f32>(0.0), vec2<f32>(1.0));

  // Centered coordinate space around steerable / orbiting Pivot (aspect corrected)
  let aspect = max(0.1, u.params4.z);
  let p = vec2<f32>((in.uv.x - pivot.x) * aspect, in.uv.y - pivot.y);
  let r = length(p);
  let baseAngle = atan2(p.y, p.x);

  // Log-Polar Cylindrical 3D Tunnel Warp
  let tunnelWarp = u.params5.y;
  var rEff = r;
  if (tunnelWarp > 0.0001) {
    let logR = log(r * 4.0 + 1.0) * 0.35;
    rEff = mix(r, logR, tunnelWarp);
  }

  // Effective Zoom with Luma Expansion
  let lumaWarpVal = u.params2.x;
  let effZoom = max(0.01, u.params0.y + (localLuma - 0.5) * (lumaWarpVal * 0.45));

  // Vortex Torque Twist + Luma Twist + Base Rotation
  let twistVal = u.params0.w;
  let lumaTwistVal = u.params2.y;
  let rotAngle = baseAngle - (u.params0.z + rEff * twistVal + (localLuma - 0.5) * lumaTwistVal);

  let drift = vec2<f32>(u.params1.x * aspect, u.params1.y);

  // Chromatic RGB Dispersion: separate zoom ratios for R, G, B
  let disp = u.params2.z;
  let zoomR = effZoom * (1.0 + disp);
  let zoomG = effZoom;
  let zoomB = effZoom * (1.0 - disp);

  let pR = vec2<f32>(cos(rotAngle), sin(rotAngle)) * (rEff / zoomR);
  let pG = vec2<f32>(cos(rotAngle), sin(rotAngle)) * (rEff / zoomG);
  let pB = vec2<f32>(cos(rotAngle), sin(rotAngle)) * (rEff / zoomB);

  let uvR = vec2<f32>(pR.x / aspect + pivot.x, pR.y + pivot.y) - drift;
  let uvG = vec2<f32>(pG.x / aspect + pivot.x, pG.y + pivot.y) - drift;
  let uvB = vec2<f32>(pB.x / aspect + pivot.x, pB.y + pivot.y) - drift;

  // Sample feedback history using boundary wrapping mode
  let edgeMode = u.params5.x;
  let sampR = textureSampleLevel(fbTex, smp, wrapUV(uvR, edgeMode), 0.0);
  let sampG = textureSampleLevel(fbTex, smp, wrapUV(uvG, edgeMode), 0.0);
  let sampB = textureSampleLevel(fbTex, smp, wrapUV(uvB, edgeMode), 0.0);

  var fbRGB = vec3<f32>(sampR.r, sampG.g, sampB.b);
  var fbAlpha = (sampR.a + sampG.a + sampB.a) * 0.333333;

  // Continuous Hue Shift (Chromatic cycler)
  let hueShift = u.params2.w;
  if (abs(hueShift) > 0.001) {
    var hsv = rgb2hsv(fbRGB);
    hsv.x = fract(hsv.x + hueShift / 6.2831853);
    fbRGB = hsv2rgb(hsv);
  }

  // Soft-Knee Anode Limiter (Analog AGC prevents blown-out white rectangles)
  let knee = u.params3.x;
  if (knee > 0.001) {
    fbRGB = fbRGB / (vec3<f32>(1.0) + fbRGB * (knee * 0.75));
  }

  // Peripheral Edge Roll-off (Vignette damping, active only in clamp mode)
  let rollOff = u.params3.y;
  if (rollOff > 0.001 && edgeMode < 0.5) {
    let edgeDist = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
    let fade = clamp(edgeDist / max(0.001, rollOff * 0.15), 0.0, 1.0);
    fbRGB = fbRGB * fade;
    fbAlpha = fbAlpha * fade;
  }

  // Mask Attenuation
  var maskVal = 1.0;
  if (u.params4.y > 0.5) {
    maskVal = textureSampleLevel(maskTex, smp, in.uv, 0.0).r;
  }

  // Apply Feedback Gain
  let gain = u.params0.x * maskVal;
  fbRGB = fbRGB * gain;
  fbAlpha = fbAlpha * gain;

  // ── Composite Blend Engine ──
  let blendMode = u.params3.z;
  var finalRGB = vec3<f32>(0.0);

  if (blendMode < 0.5) {
    // 0: Normal (Over)
    finalRGB = inputColor.rgb + fbRGB * (1.0 - inputColor.a);
  } else if (blendMode < 1.5) {
    // 1: Add (Luminous)
    finalRGB = inputColor.rgb + fbRGB;
  } else if (blendMode < 2.5) {
    // 2: Screen (Filmic / Soft Bloom)
    finalRGB = 1.0 - (1.0 - inputColor.rgb) * (1.0 - clamp(fbRGB, vec3<f32>(0.0), vec3<f32>(1.0)));
  } else if (blendMode < 3.5) {
    // 3: Difference (Solarizing Oscillations)
    finalRGB = abs(inputColor.rgb - fbRGB);
  } else {
    // 4: Max (Lighten Peak)
    finalRGB = max(inputColor.rgb, fbRGB);
  }

  let finalAlpha = clamp(max(inputColor.a, fbAlpha), 0.0, 1.0);

  out.videoOut = vec4<f32>(finalRGB, finalAlpha);
  out.matteOut = vec4<f32>(vec3<f32>(finalAlpha), 1.0);
  return out;
}
`;

