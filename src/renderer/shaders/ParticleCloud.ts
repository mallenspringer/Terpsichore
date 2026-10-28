export const ParticleComputeWGSL = `
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  maxLife: f32,
  size: f32,
  colorIdx: f32,
};

struct ParticleComputeUniforms {
  dt: f32,
  time: f32,
  speed: f32,
  spread: f32,
  turbulence: f32,
  noiseFreq: f32,
  particleCount: f32,
  emitterShape: f32,   // 0: point, 1: ring, 2: disc, 3: line
  emitterRadius: f32,
  emitterX: f32,
  emitterY: f32,
  gravityX: f32,
  gravityY: f32,
  burstPulse: f32,
  audioBass: f32,
  aspect: f32,
};

@group(0) @binding(0) var<uniform> u: ParticleComputeUniforms;
@group(0) @binding(1) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(2) var<storage, read_write> particlesOut: array<Particle>;

// Fast pseudo-random number generator
fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Multi-frequency potential function for curl noise
fn potential(p: vec2<f32>, t: f32, freq: f32) -> f32 {
  let p1 = p * freq;
  let s1 = sin(p1.x + t * 0.6) * cos(p1.y * 1.1 - t * 0.4);
  let p2 = p * (freq * 2.3);
  let s2 = sin(p2.x * 0.8 - p2.y * 1.2 + t * 0.9) * 0.5;
  let p3 = p * (freq * 4.7);
  let s3 = cos(p3.x * 1.3 + p3.y * 0.9 - t * 1.3) * 0.25;
  return s1 + s2 + s3;
}

// 2D Analytical / finite-difference curl noise (divergence-free fluid flow)
fn curlNoise(p: vec2<f32>, t: f32, freq: f32) -> vec2<f32> {
  let eps = 0.005;
  let dpsi_dy = (potential(p + vec2<f32>(0.0, eps), t, freq) - potential(p - vec2<f32>(0.0, eps), t, freq)) / (2.0 * eps);
  let dpsi_dx = (potential(p + vec2<f32>(eps, 0.0), t, freq) - potential(p - vec2<f32>(eps, 0.0), t, freq)) / (2.0 * eps);
  return vec2<f32>(dpsi_dy, -dpsi_dx);
}

@compute @workgroup_size(64, 1, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (f32(index) >= u.particleCount) {
    return;
  }

  var p = particlesIn[index];
  let seed = vec2<f32>(f32(index) * 0.0137 + u.time * 0.01, f32(index) * 0.0719 - u.time * 0.007);
  let rnd = hash22(seed);

  p.life = p.life - u.dt;

  let shouldRespawn = p.life <= 0.0 || (u.burstPulse > 0.5 && rnd.x < 0.6);

  if (shouldRespawn) {
    // 1. Initial Position based on emitter shape
    var spawnOffset = vec2<f32>(0.0);
    let shape = u.emitterShape;
    let rad = rnd.y * 6.2831853;

    if (shape < 0.5) {
      // Point emitter with slight dispersion
      spawnOffset = (rnd - 0.5) * 0.02;
    } else if (shape < 1.5) {
      // Ring emitter
      spawnOffset = vec2<f32>(cos(rad), sin(rad)) * u.emitterRadius;
    } else if (shape < 2.5) {
      // Disc emitter
      let r = sqrt(rnd.x) * u.emitterRadius;
      spawnOffset = vec2<f32>(cos(rad), sin(rad)) * r;
    } else {
      // Line emitter
      spawnOffset = vec2<f32>((rnd.x - 0.5) * u.emitterRadius * 2.0, (rnd.y - 0.5) * 0.02);
    }

    p.pos = vec2<f32>(u.emitterX, u.emitterY) + spawnOffset;

    // 2. Initial Velocity
    let launchAngle = rad + (rnd.x - 0.5) * u.spread * 3.14159;
    let speedMult = (0.5 + rnd.y * 0.8) * u.speed;
    let burstBonus = select(1.0, 3.0, u.burstPulse > 0.5);
    let audioBonus = 1.0 + u.audioBass * 1.5;

    p.vel = vec2<f32>(cos(launchAngle), sin(launchAngle)) * (speedMult * burstBonus * audioBonus);

    // 3. Lifetime and visual characteristics
    p.maxLife = max(0.5, 2.0 + rnd.x * 2.5);
    p.life = p.maxLife * (0.8 + 0.2 * rnd.y);
    p.size = 0.6 + rnd.y * 0.8;
    p.colorIdx = rnd.x;
  } else {
    // Physics integration
    let curl = curlNoise(p.pos, u.time, u.noiseFreq) * u.turbulence;
    let grav = vec2<f32>(u.gravityX, u.gravityY) * u.dt;

    // Damping drag (0.97 per frame normalized to dt)
    let damping = max(0.0, 1.0 - 0.4 * u.dt);
    p.vel = p.vel * damping + (curl * 1.5 + grav) * u.dt;

    // Position step
    p.pos = p.pos + p.vel * (u.dt * u.speed * 2.0);

    // Soft boundary wrap / respawn if drifted far outside canvas
    if (abs(p.pos.x) > 2.2 || abs(p.pos.y) > 2.2) {
      p.life = 0.0;
    }
  }

  particlesOut[index] = p;
}
`;

export const ParticleRenderWGSL = `
struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  maxLife: f32,
  size: f32,
  colorIdx: f32,
};

struct ParticleRenderUniforms {
  aspect: f32,
  palette: f32,      // 0: neon, 1: fire, 2: aurora, 3: electric, 4: starlight, 5: spectrum
  pointSize: f32,
  globalAlpha: f32,
  useCustomPalette: f32,
  customColorCount: f32,
  customInterpolation: f32,
  pad0: f32,
  customColors: array<vec4<f32>, 8>,
  customPositions: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> u: ParticleRenderUniforms;
@group(0) @binding(1) var<storage, read> allParticles: array<Particle>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) ageNorm: f32,
  @location(2) colorIdx: f32,
  @location(3) lifeAlpha: f32,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let p = allParticles[instanceIndex];

  // Billboard Quad (6 vertices = 2 triangles)
  var quadOffsets = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  let localUV = quadOffsets[vertexIndex];

  // Particle size in clip space coordinates
  let baseRadius = 0.008 * u.pointSize * p.size;
  let offset = vec2<f32>(localUV.x * baseRadius / u.aspect, localUV.y * baseRadius);

  let clipPos = vec2<f32>(p.pos.x, -p.pos.y) + offset;

  let normAge = clamp(1.0 - (p.life / p.maxLife), 0.0, 1.0);
  // Smooth fade-in at birth, fade-out near death
  let fadeIn = smoothstep(0.0, 0.15, normAge);
  let fadeOut = smoothstep(1.0, 0.75, normAge);
  let lifeFade = fadeIn * fadeOut;

  var out: VertexOutput;
  out.position = vec4<f32>(clipPos, 0.0, 1.0);
  out.uv = localUV;
  out.ageNorm = normAge;
  out.colorIdx = p.colorIdx;
  out.lifeAlpha = lifeFade;
  return out;
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

fn sampleCustomPalette(tIn: f32) -> vec3<f32> {
  let count = u32(u.customColorCount + 0.5);
  if (count <= 1u) {
    return u.customColors[0].rgb;
  }
  let t = clamp(tIn, 0.0, 1.0);
  let interp = u32(u.customInterpolation + 0.5);

  // 1. Stepped mode: discrete color slices where width equals weight percentage
  if (interp == 1u) {
    let p0 = getCustomStopPos(0u);
    if (t < p0) {
      return u.customColors[count - 1u].rgb;
    }
    for (var i = 0u; i < count; i = i + 1u) {
      let pLow = getCustomStopPos(i);
      var pHigh = 1.0;
      if (i + 1u < count) {
        pHigh = getCustomStopPos(i + 1u);
      }
      if (t >= pLow && (t < pHigh || i == count - 1u)) {
        return u.customColors[i].rgb;
      }
    }
    return u.customColors[count - 1u].rgb;
  }

  // 2. Linear & Smooth modes: proportional spacing analog with midpoints
  let p0 = getCustomStopPos(0u);
  let p1 = getCustomStopPos(1u);
  let mFirst = (p0 + p1) * 0.5;
  let mLastLow = getCustomStopPos(count - 1u);
  let mLast = (mLastLow + 1.0) * 0.5;

  if (t <= mFirst) {
    return u.customColors[0].rgb;
  }
  if (t >= mLast) {
    return u.customColors[count - 1u].rgb;
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
      return mix(u.customColors[i].rgb, u.customColors[i + 1u].rgb, segT);
    }
  }

  return u.customColors[count - 1u].rgb;
}


// Color palettes
fn evaluatePalette(paletteIdx: f32, t: f32) -> vec3<f32> {
  let pal = u32(paletteIdx + 0.5);
  let x = fract(t);

  if (pal == 0u) {
    // Neon Cyberpunk: Cyan -> Magenta -> Bright Purple
    let c1 = vec3<f32>(0.0, 0.95, 1.0);
    let c2 = vec3<f32>(1.0, 0.08, 0.65);
    let c3 = vec3<f32>(0.7, 0.2, 1.0);
    return mix(mix(c1, c2, smoothstep(0.0, 0.5, x)), c3, smoothstep(0.5, 1.0, x));
  } else if (pal == 1u) {
    // Solar Fire: Deep Ruby Red -> Hot Amber Orange -> Radiant Gold Yellow
    let c1 = vec3<f32>(0.9, 0.05, 0.05);
    let c2 = vec3<f32>(1.0, 0.45, 0.0);
    let c3 = vec3<f32>(1.0, 0.9, 0.2);
    return mix(mix(c1, c2, smoothstep(0.0, 0.5, x)), c3, smoothstep(0.5, 1.0, x));
  } else if (pal == 2u) {
    // Aurora Borealis: Deep Emerald -> Mint Aqua -> Violet
    let c1 = vec3<f32>(0.05, 0.8, 0.5);
    let c2 = vec3<f32>(0.2, 1.0, 0.85);
    let c3 = vec3<f32>(0.6, 0.3, 0.95);
    return mix(mix(c1, c2, smoothstep(0.0, 0.5, x)), c3, smoothstep(0.5, 1.0, x));
  } else if (pal == 3u) {
    // Electric Plasma: Deep Cobalt Blue -> Neon Cyan -> Pure White
    let c1 = vec3<f32>(0.05, 0.2, 0.95);
    let c2 = vec3<f32>(0.1, 0.85, 1.0);
    let c3 = vec3<f32>(1.0, 1.0, 1.0);
    return mix(mix(c1, c2, smoothstep(0.0, 0.6, x)), c3, smoothstep(0.6, 1.0, x));
  } else if (pal == 4u) {
    // Starlight / Celestial: Silver White -> Pale Ice Blue -> Soft Lilac
    let c1 = vec3<f32>(0.9, 0.95, 1.0);
    let c2 = vec3<f32>(0.65, 0.8, 1.0);
    let c3 = vec3<f32>(0.85, 0.7, 0.95);
    return mix(mix(c1, c2, smoothstep(0.0, 0.5, x)), c3, smoothstep(0.5, 1.0, x));
  } else {
    // Spectrum Chromatic Rainbow
    let r = sin(x * 6.2831853) * 0.5 + 0.5;
    let g = sin(x * 6.2831853 + 2.0943951) * 0.5 + 0.5;
    let b = sin(x * 6.2831853 + 4.1887902) * 0.5 + 0.5;
    return vec3<f32>(r, g, b);
  }
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) {
    discard;
  }

  // Soft Gaussian core with silky exponential halo
  let glow = exp(-r * r * 3.5) * (1.0 - r * 0.15);

  var color = vec3<f32>(1.0);
  if (u.useCustomPalette > 0.5) {
    color = sampleCustomPalette(in.colorIdx);
  } else {
    color = evaluatePalette(u.palette, in.colorIdx + in.ageNorm * 0.35);
  }

  let finalAlpha = glow * in.lifeAlpha * u.globalAlpha;

  return vec4<f32>(color * finalAlpha, finalAlpha);
}
`;
