export const SpokenWordVisualizerWGSL = `
struct Uniforms {
  renderMode: u32,       // 0 = Constellation, 1 = FlowingRibbon, 2 = RadialWaterfall
  aspect: f32,
  time: f32,
  envelope: f32,
  cadence: f32,
  timbreBrightness: f32,
  timbreFlatness: f32,
  pitchHz: f32,
  pitchMidi: f32,
  stability: f32,
  formantF1: f32,
  formantF2: f32,
  vowelX: f32,
  vowelY: f32,
  onsetPulse: f32,
  colorPalette: u32,     // 0 = vibrant, 1 = neon/cyber, 2 = warm/fire, 3 = monochrome
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn palette(t: f32, mode: u32) -> vec3<f32> {
  if (mode == 1u) {
    // Neon Cyber (Cyan, Magenta, Violet)
    return 0.5 + 0.5 * cos(6.28318 * (vec3<f32>(t) + vec3<f32>(0.0, 0.33, 0.67)));
  } else if (mode == 2u) {
    // Warm Fire (Gold, Amber, Deep Crimson)
    return vec3<f32>(
      clamp(t * 1.5, 0.0, 1.0),
      clamp(pow(t, 2.0) * 0.8, 0.0, 1.0),
      clamp(pow(t, 4.0) * 0.3, 0.0, 1.0)
    );
  } else if (mode == 3u) {
    // Monochrome Opal
    let luma = clamp(t, 0.0, 1.0);
    return vec3<f32>(luma);
  }
  // Vibrant (Default)
  let a = vec3<f32>(0.5, 0.5, 0.5);
  let b = vec3<f32>(0.5, 0.5, 0.5);
  let c = vec3<f32>(1.0, 1.0, 1.0);
  let d = vec3<f32>(0.00, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

// ── 1. Constellation Mode ────────────────────────────────────────────────────
fn renderConstellation(p: vec2<f32>) -> vec4<f32> {
  let env = clamp(uniforms.envelope, 0.0, 1.0);
  let pulse = clamp(uniforms.onsetPulse, 0.0, 1.0);
  let center = (vec2<f32>(uniforms.vowelX, 1.0 - uniforms.vowelY) * 2.0 - 1.0) * 0.65;
  
  // Primary Celestial Core
  let distToCenter = length(p - center);
  let coreRadius = 0.03 + env * 0.08 + pulse * 0.05;
  let coreGlow = 0.015 / max(0.003, distToCenter - coreRadius * 0.5);
  
  var color = palette(uniforms.pitchMidi + 0.1, uniforms.colorPalette) * coreGlow;

  // Satellite Star Cluster (8 harmonics)
  let starCount = 8;
  for (var i = 0; i < starCount; i = i + 1) {
    let fi = f32(i);
    let angle = fi * (6.28318 / f32(starCount)) + uniforms.time * (0.3 + uniforms.cadence * 0.5);
    let orbitDist = (0.15 + fi * 0.04) * (0.8 + env * 0.6);
    let starPos = center + vec2<f32>(cos(angle), sin(angle)) * orbitDist;
    
    let starD = length(p - starPos);
    let starRadius = 0.008 + (0.015 * env);
    let starGlow = (0.003 + pulse * 0.005) / max(0.002, starD);
    
    let starColor = palette(uniforms.pitchMidi + fi * 0.12, uniforms.colorPalette);
    color += starColor * starGlow;

    // Connective constellation filaments when stable
    if (uniforms.stability > 0.25) {
      let pa = p - center;
      let ba = starPos - center;
      let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      let lineDist = length(pa - ba * h);
      let lineGlow = smoothstep(0.006, 0.001, lineDist) * uniforms.stability * 0.4 * env;
      color += starColor * lineGlow;
    }
  }

  // Deep Space Background Nebula
  let bgNoise = sin(p.x * 3.0 + uniforms.time * 0.5) * cos(p.y * 3.0 - uniforms.time * 0.4);
  let bg = palette(uniforms.pitchMidi * 0.5, uniforms.colorPalette) * (bgNoise * 0.03 + 0.02) * env;

  return vec4<f32>(color + bg, clamp(length(color) * 1.5, 0.0, 1.0));
}

// ── 2. Flowing Ribbon Mode ──────────────────────────────────────────────────
fn renderFlowingRibbon(p: vec2<f32>, uv: vec2<f32>) -> vec4<f32> {
  let env = clamp(uniforms.envelope, 0.0, 1.0);
  let brightness = clamp(uniforms.timbreBrightness / 5000.0, 0.0, 2.0);
  let flatness = clamp(uniforms.timbreFlatness, 0.0, 1.0);

  var totalColor = vec3<f32>(0.0);
  let layers = 5;

  for (var i = 0; i < layers; i = i + 1) {
    let fi = f32(i);
    let speed = uniforms.time * (1.2 + uniforms.cadence * 0.8) + fi * 0.4;
    let waveFreq = 2.5 + fi * 1.5 + brightness * 2.0;
    
    // Wave displacement
    let wave1 = sin(p.x * waveFreq + speed) * (0.12 + env * 0.25);
    let wave2 = cos(p.x * waveFreq * 0.5 - speed * 0.8) * (0.08 + flatness * 0.15);
    let ribbonY = (fi - 2.0) * 0.08 * (1.0 - env * 0.3) + wave1 + wave2;

    let dist = abs(p.y - ribbonY);
    let thickness = 0.006 + env * 0.01;
    let glow = 0.03 + (1.0 - uniforms.stability) * 0.04;
    let intensity = smoothstep(thickness + glow, thickness, dist);

    let layerColor = palette(uniforms.pitchMidi + fi * 0.15 + uv.x * 0.3, uniforms.colorPalette);
    totalColor += layerColor * intensity * (0.7 + env * 0.8);
  }

  // Edge vignette
  let vig = smoothstep(1.2, 0.4, length(p));
  totalColor *= vig;

  let alpha = clamp(length(totalColor), 0.0, 1.0);
  return vec4<f32>(totalColor, alpha);
}

// ── 3. Radial Waterfall Mode ────────────────────────────────────────────────
fn renderRadialWaterfall(p: vec2<f32>) -> vec4<f32> {
  let env = clamp(uniforms.envelope, 0.0, 1.0);
  let pulse = clamp(uniforms.onsetPulse, 0.0, 1.0);
  let r = length(p);
  let theta = atan2(p.y, p.x);

  var totalColor = vec3<f32>(0.0);

  // Concentric Formant Ring Waves expanding outward
  let speed = uniforms.time * (0.6 + uniforms.cadence * 0.5);
  let ringCount = 6;

  for (var i = 0; i < ringCount; i = i + 1) {
    let fi = f32(i);
    // Radial ripples with harmonic frequency spokes
    let spokeFreq = max(3.0, round(3.0 + uniforms.pitchMidi * 12.0));
    let spokeMod = sin(theta * spokeFreq + uniforms.time * 2.0) * (0.03 * uniforms.stability);
    
    let ringRadius = fract(fi / f32(ringCount) + speed) * 1.2 + spokeMod;
    let ringDist = abs(r - ringRadius);
    
    let ringThickness = 0.008 + (0.02 * env);
    let glow = 0.02 + pulse * 0.04;
    let intensity = smoothstep(ringThickness + glow, ringThickness, ringDist);

    // Formant frequency coloration
    let fT = (uniforms.formantF1 / 1500.0) * 0.5 + (uniforms.formantF2 / 3000.0) * 0.5;
    let ringColor = palette(fT + fi * 0.16, uniforms.colorPalette);
    
    // Attenuate outer rings smoothly
    let fade = 1.0 - smoothstep(0.8, 1.2, ringRadius);
    totalColor += ringColor * intensity * fade * (0.5 + env * 0.8 + pulse * 0.5);
  }

  // Central vowel resonance core
  let coreDist = length(p);
  let coreGlow = (0.015 + pulse * 0.04 + env * 0.03) / max(0.01, coreDist);
  let coreColor = palette(uniforms.pitchMidi, uniforms.colorPalette) * coreGlow;
  totalColor += coreColor;

  let alpha = clamp(length(totalColor), 0.0, 1.0);
  return vec4<f32>(totalColor, alpha);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  var p = in.uv * 2.0 - 1.0;
  p.x *= uniforms.aspect;

  if (uniforms.renderMode == 0u) {
    return renderConstellation(p);
  } else if (uniforms.renderMode == 1u) {
    return renderFlowingRibbon(p, in.uv);
  } else {
    return renderRadialWaterfall(p);
  }
}
`;
