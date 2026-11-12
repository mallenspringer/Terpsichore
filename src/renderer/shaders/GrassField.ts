const GRASS_SHARED_STRUCTS_WGSL = /* wgsl */ `
struct GrassBlade {
  pos: vec2<f32>,
  height: f32,
  targetHeight: f32,
  width: f32,
  curvature: f32,
  swayPhase: f32,
  age: f32,
  lifetime: f32,
  state: u32,             // 0: dormant, 1: growing, 2: mature, 3: dissolving, 4: cut/stubble, 5: shrinking
  dissolveProgress: f32,
  tuftType: u32,          // 0: none, 1: purpletop, 2: poppies, 3: dandelions, 4: kelp, 5: wheat
  seed: f32,
  bendAngle: f32,
  bendVel: f32,
  bendZ: f32,
  tuftScale: f32,
  recoilDelay: f32,
  stiffness: f32,
  cycleCount: f32,
};

struct DustParticle {
  pos: vec3<f32>,
  life: f32,
  vel: vec3<f32>,
  maxLife: f32,
  color: vec3<f32>,
  size: f32,
};

struct GrassComputeUniforms {
  dt: f32,
  time: f32,
  growth: f32,
  density: f32,
  bend: f32,
  fatness: f32,
  windSpeed: f32,
  windStrength: f32,
  timerDecayEnabled: f32,
  lifetimeDuration: f32,
  pruneTrigger: f32,
  pruneCutRatio: f32,
  removalStyle: f32,      // 0: cut, 1: dissolve, 2: shrink
  tuftTrigger: f32,
  tuftStyle: f32,
  tuftChance: f32,
  tuftBurstAmount: f32,
  totalBlades: f32,
  growthRate: f32,
  windPhase: f32,
  birthRate: f32,
  isDriven: f32,
  windDirX: f32,
  windDirZ: f32,
};

struct GrassRenderUniforms {
  aspect: f32,
  time: f32,
  tilt: f32,
  zoom: f32,
  horizonY: f32,
  windSpeed: f32,
  windStrength: f32,
  colorPreset: f32,
  useCustomPalette: f32,
  customColorCount: f32,
  customInterpolation: f32,
  showSky: f32,
  showGround: f32,
  windDirX: f32,
  windDirZ: f32,
  pad3: f32,
  customColors: array<vec4<f32>, 8>,
  customPositions: array<vec4<f32>, 2>,
};

struct CameraBasis {
  pos: vec3<f32>,
  forward: vec3<f32>,
  right: vec3<f32>,
  up: vec3<f32>,
  fov: f32,
  near: f32,
  far: f32,
};

fn hash11(p: f32) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 = p3 * (p3 + 33.33);
  p3 = p3 * (p3 + p3);
  return fract(p3);
}

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn computeVisibleHeight(b: GrassBlade) -> f32 {
  if (b.state == 3u) {
    // Graceful top-down erosion during dissolve
    let remain = smoothstep(1.0, 0.08, b.dissolveProgress);
    return b.height * remain;
  }
  return b.height;
}

fn computeSpinePoint(b: GrassBlade, visHeight: f32, segLevel: u32) -> vec3<f32> {
  var spine = vec3<f32>(b.pos.x, 0.002, b.pos.y);
  if (segLevel == 0u || visHeight <= 0.0001) {
    return spine;
  }
  let naturalLeanX = (b.seed - 0.5) * 0.24;
  let naturalLeanZ = (hash11(b.seed * 31.7 + 1.3) - 0.5) * 0.26;
  let stepH = visHeight * 0.25;
  for (var s: u32 = 0u; s < segLevel; s = s + 1u) {
    let tMid = (f32(s) + 0.5) * 0.25;
    let tBend = pow(tMid, 1.30);
    let tArch = tMid * tMid;
    let ax = (b.bendAngle + naturalLeanX) * tBend + b.curvature * tArch;
    let az = b.bendZ * tBend + naturalLeanZ * tArch;
    let mag = clamp(length(vec2<f32>(ax, az)), 0.0, 1.48);
    let dir = normalize(vec3<f32>(sin(ax), max(0.08, cos(mag)), sin(az)));
    spine += dir * stepH;
  }
  return spine;
}

fn buildCamera(tilt: f32, zoom: f32, horizonY: f32) -> CameraBasis {
  var c: CameraBasis;
  let pitch = mix(0.025, 0.955, tilt) * 1.5707963;
  let camDist = 2.6 / max(0.2, zoom);
  let targetPos = vec3<f32>(0.0, 0.20 + horizonY * 0.5, 2.75);
  let camY = targetPos.y + sin(pitch) * camDist;
  let camZ = targetPos.z - cos(pitch) * camDist;
  c.pos = vec3<f32>(0.0, camY, camZ);
  c.forward = normalize(targetPos - c.pos);
  c.right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), c.forward));
  c.up = cross(c.forward, c.right);
  c.fov = 1.35;
  c.near = 0.15;
  c.far = 25.0;
  return c;
}
`;

export const GrassComputeWGSL = /* wgsl */ `
${GRASS_SHARED_STRUCTS_WGSL}

@group(0) @binding(0) var<uniform> u: GrassComputeUniforms;
@group(0) @binding(1) var<storage, read> bladesIn: array<GrassBlade>;
@group(0) @binding(2) var<storage, read_write> bladesOut: array<GrassBlade>;

fn assignClumpPos(bladeIdxF: f32, cycle: f32) -> vec2<f32> {
  let cSeed = floor(hash11(bladeIdxF * 19.37 + cycle * 101.73 + 0.41) * 240.0);
  let cx = (hash11(cSeed * 12.71 + 0.19) - 0.5) * 14.4;
  let cz = 0.08 + hash11(cSeed * 45.33 + 0.77) * 5.25;
  let ang = hash11(bladeIdxF * 73.11 + cycle * 37.9) * 6.2831853;
  let rad = sqrt(hash11(bladeIdxF * 29.53 + cycle * 61.3)) * 0.46;
  let gx = clamp(cx + cos(ang) * rad, -7.45, 7.45);
  let gz = clamp(cz + sin(ang) * rad * 0.65, 0.04, 5.46);
  return vec2<f32>(gx, gz);
}

fn resetToDormant(bIn: GrassBlade, bladeIdxF: f32) -> GrassBlade {
  var b = bIn;
  b.state = 0u;
  b.height = 0.0;
  b.dissolveProgress = 0.0;
  b.tuftScale = 0.0;
  b.tuftType = 0u;
  b.age = 0.0;
  b.bendAngle = 0.0;
  b.bendVel = 0.0;
  b.bendZ = 0.0;
  b.cycleCount = b.cycleCount + 1.0;
  let rCool = hash11(bladeIdxF * 17.71 + b.cycleCount * 11.3);
  b.recoilDelay = mix(0.25, 1.4, rCool);
  return b;
}

@compute @workgroup_size(64, 1, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (f32(index) >= u.totalBlades) {
    return;
  }

  // Instance 0 reserved for ground terrain quad
  if (index == 0u) {
    var g = bladesIn[0];
    g.state = 2u;
    g.height = 1.0;
    g.seed = 1.0;
    bladesOut[0] = g;
    return;
  }

  var b = bladesIn[index];
  let bladeIdxF = f32(index);
  let rnd = hash11(bladeIdxF * 12.9898 + 0.1337);
  let rnd2 = hash11(bladeIdxF * 78.233 + 0.5432);
  let rnd3 = hash11(bladeIdxF * 37.719 + 0.9123);

  // 1. First-time initialization (starts dormant in soil for smooth gradual sprout)
  if (b.seed == 0.0) {
    b.cycleCount = 0.0;
    b.pos = assignClumpPos(bladeIdxF, 0.0);
    // Natural meadow height variation with occasional tall stalks
    b.targetHeight = 0.58 + pow(rnd3, 1.25) * 0.78;
    b.height = 0.0;
    // 15% thinner wispy grass width
    b.width = (0.027 + rnd * 0.020) * u.fatness;
    b.curvature = (rnd2 - 0.5) * 0.55;
    b.swayPhase = b.pos.x * 0.9 + b.pos.y * 0.7 + rnd * 0.75;
    b.lifetime = max(2.5, u.lifetimeDuration * (0.65 + 0.70 * rnd));
    b.age = 0.0;
    b.state = 0u;
    b.dissolveProgress = 0.0;
    b.tuftType = 0u;
    b.bendAngle = 0.0;
    b.bendVel = 0.0;
    b.bendZ = 0.0;
    b.tuftScale = 0.0;
    b.recoilDelay = 0.0;
    b.stiffness = mix(0.75, 1.35, rnd2);
    b.seed = rnd + 0.001;
  }

  let activeRatio = bladeIdxF / u.totalBlades;
  let inDensityRange = activeRatio <= u.density;

  if (b.state == 0u && b.recoilDelay > 0.0) {
    b.recoilDelay = max(0.0, b.recoilDelay - u.dt);
  }

  // 2. Removal Transitions (States 3, 4, 5)
  if (b.state == 3u) {
    // State 3: Dissolve (graceful top-down erosion + dust mote emission)
    b.dissolveProgress = b.dissolveProgress + u.dt * 0.62;
    b.tuftScale = max(0.0, b.tuftScale - u.dt * 1.4);
    if (b.dissolveProgress >= 1.0) {
      b = resetToDormant(b, bladeIdxF);
    }
  } else if (b.state == 4u) {
    // State 4: Scythe Cut (smooth rapid slice down to stubble, then wither)
    let cutTarget = b.targetHeight * 0.16 * max(0.25, u.growth);
    if (b.height > cutTarget) {
      b.height = max(cutTarget, b.height - u.dt * 4.8);
    }
    b.tuftScale = 0.0;
    b.recoilDelay = max(0.0, b.recoilDelay - u.dt);
    if (b.recoilDelay <= 0.0) {
      b = resetToDormant(b, bladeIdxF);
    }
  } else if (b.state == 5u) {
    // State 5: Shrink / Ungrow (eased retraction back into soil)
    let shrinkSpeed = (0.20 + 0.65 * b.height) * max(0.3, u.growthRate);
    b.height = max(0.0, b.height - u.dt * shrinkSpeed);
    b.tuftScale = max(0.0, b.tuftScale - u.dt * 0.9);
    if (b.height <= 0.004) {
      b = resetToDormant(b, bladeIdxF);
    }
  } else {
    // 3. Dormancy -> Gradual Germination -> Growth -> Maturity / Turnover
    if (b.state == 0u) {
      let canGerminate = inDensityRange && (u.growth > 0.02) && (u.birthRate > 0.005);
      if (canGerminate && b.recoilDelay <= 0.0) {
        let sproutProb = clamp(u.birthRate * u.dt, 0.0, 1.0);
        let sproutRoll = hash11(bladeIdxF * 43.17 + fract(u.time * 13.73) * 197.3 + b.cycleCount * 7.13);
        if (sproutRoll < sproutProb) {
          let c = b.cycleCount;
          let rA = hash11(bladeIdxF * 19.91 + c * 31.7);
          let rB = hash11(bladeIdxF * 57.13 + c * 41.3);
          let rC = hash11(bladeIdxF * 83.47 + c * 17.9);
          b.pos = assignClumpPos(bladeIdxF, c);
          b.targetHeight = 0.58 + pow(rC, 1.25) * 0.78;
          b.swayPhase = b.pos.x * 0.9 + b.pos.y * 0.7 + rA * 0.75;
          b.stiffness = mix(0.75, 1.35, rB);
          b.seed = rA + 0.001;
          b.lifetime = max(2.5, u.lifetimeDuration * (0.65 + 0.70 * rB));
          // Stagger initial wave ages so initial meadow never expires in lockstep
          b.age = select(0.0, rC * b.lifetime * 0.65, c < 0.5);
          b.state = 1u;
          b.height = 0.004;
          b.dissolveProgress = 0.0;
          b.tuftScale = 0.0;
          b.tuftType = select(0u, u32(u.tuftStyle), rA < u.tuftChance);
        }
      }
    } else if (b.state == 1u || b.state == 2u) {
      if (u.timerDecayEnabled > 0.5) {
        b.age = b.age + u.dt;
      }

      var shouldRemove = false;
      if (u.timerDecayEnabled > 0.5 && b.age >= b.lifetime) {
        shouldRemove = true;
      }
      if (u.pruneTrigger > 0.5) {
        // Prefer pruning mature/older blades on HF transients
        let maturityBias = clamp(b.age / max(1.0, b.lifetime), 0.25, 1.0);
        let cutRnd = hash11(bladeIdxF * 91.137 + u.time * 3.7);
        if (cutRnd < u.pruneCutRatio * (0.5 + 0.8 * maturityBias)) {
          shouldRemove = true;
        }
      }
      if (!inDensityRange || (u.timerDecayEnabled < 0.5 && u.growth <= 0.02)) {
        shouldRemove = true;
      }

      if (shouldRemove) {
        if (u.removalStyle < 0.5) {
          b.state = 4u; // Scythe Cut
          b.tuftType = 0u;
          b.tuftScale = 0.0;
          b.recoilDelay = 2.0;
        } else if (u.removalStyle < 1.5) {
          b.state = 3u; // Dust Dissolve
          b.dissolveProgress = 0.0;
        } else {
          b.state = 5u; // Shrink / Ungrow
        }
      } else {
        let tuftTallBoost = select(1.0, 1.14, b.tuftType > 0u);
        let targetH = b.targetHeight * tuftTallBoost * max(0.04, u.growth);
        if (b.state == 1u) {
          let ratio = clamp(b.height / max(0.01, targetH), 0.0, 1.0);
          let curveFactor = 0.28 + 1.35 * (1.0 - ratio) * (0.25 + ratio);
          let growSpeed = 0.85 * max(0.02, u.growthRate) * max(0.25, u.growth) * curveFactor;
          b.height = min(targetH, b.height + u.dt * growSpeed);
          if (b.height >= targetH * 0.985) {
            b.state = 2u;
            b.height = targetH;
          }
        } else {
          let diff = targetH - b.height;
          b.height = b.height + diff * (1.0 - exp(-u.dt * 3.5));
        }

        if (b.tuftType > 0u && u.tuftStyle > 0.0) {
          b.tuftType = u32(u.tuftStyle);
        }
      }
    }
  }

  // Tuft Burst Trigger Handling
  if (u.tuftTrigger > 0.5 && (b.state == 1u || b.state == 2u) && b.height > 0.14) {
    let burstRnd = hash11(bladeIdxF * 53.471 + u.time * 1.3 + b.cycleCount * 9.1);
    let burstThreshold = (u.tuftBurstAmount * 18.0) / (u.totalBlades * max(0.2, u.density));
    if (burstRnd < burstThreshold) {
      b.tuftType = u32(u.tuftStyle);
      b.tuftScale = max(b.tuftScale, 0.10);
    }
  }

  // Animated Blossoming Progression
  if (b.tuftType > 0u && (b.state == 1u || b.state == 2u)) {
    if (b.height > max(0.10, b.targetHeight * 0.28)) {
      b.tuftScale = min(1.0, b.tuftScale + u.dt * 2.0);
    } else {
      b.tuftScale = max(0.0, b.tuftScale - u.dt * 1.5);
    }
  } else if (b.state != 3u) {
    b.tuftScale = 0.0;
  }

  // 4. Coherent 2D Travelling Wind Waves + Damped Harmonic Spring Physics
  let wPhase = u.windPhase;
  let windDir = vec2<f32>(u.windDirX, u.windDirZ);
  let crossDir = vec2<f32>(-windDir.y, windDir.x);
  let proj = dot(b.pos, windDir);
  let crossProj = dot(b.pos, crossDir);

  let gust1 = sin(wPhase - proj * 0.85 + cos(crossProj * 0.42 + wPhase * 0.33) * 0.85);
  let gust2 = sin(wPhase * 2.05 - proj * 1.70 + crossProj * 0.75) * 0.35;
  let microSway = sin(wPhase * 2.9 + b.swayPhase * 0.55) * 0.12;
  let windForce = (gust1 + gust2 + 0.30) * u.windStrength * 0.48 + microSway * u.windStrength;

  let rawTarget = (u.bend * 0.45 + windForce) / b.stiffness;
  let targetAngle = rawTarget / (1.0 + abs(rawTarget) * 0.55);

  let springK = 14.0 * b.stiffness;
  let dampingC = 4.5 * sqrt(b.stiffness);
  let accel = (targetAngle - b.bendAngle) * springK - b.bendVel * dampingC;
  b.bendVel = clamp(b.bendVel + accel * u.dt, -8.0, 8.0);
  b.bendAngle = clamp(b.bendAngle + b.bendVel * u.dt, -1.25, 1.25);
  b.bendZ = clamp(windDir.y * b.bendAngle * 0.75 + u.bend * 0.12, -1.0, 1.0);

  // Stalk curvature & 15% thinner wispy width
  let baseWidth = (0.027 + hash11(b.seed * 41.3) * 0.020) * u.fatness;
  b.width = select(baseWidth, baseWidth * 1.12, b.tuftType > 0u);
  b.curvature = (hash11(b.seed * 67.9) - 0.5) * 0.30 + u.bend * 0.48;

  bladesOut[index] = b;
}
`;

export const GrassDustComputeWGSL = /* wgsl */ `
${GRASS_SHARED_STRUCTS_WGSL}

@group(0) @binding(0) var<uniform> u: GrassComputeUniforms;
@group(0) @binding(1) var<storage, read> blades: array<GrassBlade>;
@group(0) @binding(2) var<storage, read_write> dust: array<DustParticle>;

@compute @workgroup_size(64, 1, 1)
fn cs_dust(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= 2048u) {
    return;
  }

  var p = dust[idx];
  let idxF = f32(idx);

  if (p.life > 0.0) {
    p.life = p.life - u.dt;
    let windPush = vec3<f32>(u.windDirX, 0.22, u.windDirZ) * (0.35 + u.windStrength * 0.85);
    let swirl = vec3<f32>(
      sin(u.time * 2.6 + p.pos.y * 5.0 + idxF * 0.37) * 0.35,
      cos(u.time * 1.9 + p.pos.x * 4.0 + idxF * 0.53) * 0.15 + 0.12,
      sin(u.time * 2.2 + p.pos.z * 4.5 + idxF * 0.71) * 0.25
    );
    p.vel = mix(p.vel, windPush + swirl, clamp(u.dt * 2.8, 0.0, 1.0));
    p.pos = p.pos + p.vel * u.dt;
    dust[idx] = p;
    return;
  }

  // Scan 8-blade neighborhood assigned to this dust slot (zero atomics)
  let baseBlade = 1u + idx * 8u;
  for (var k: u32 = 0u; k < 8u; k = k + 1u) {
    let bIdx = baseBlade + k;
    if (f32(bIdx) >= u.totalBlades) {
      break;
    }
    let b = blades[bIdx];
    let isDissolving = (b.state == 3u) && (b.dissolveProgress < 0.88);
    let isFreshCut = (b.state == 4u) && (b.recoilDelay > 1.82);
    if (isDissolving || isFreshCut) {
      let spawnRnd = hash11(idxF * 19.13 + fract(u.time * 29.7) * 113.1 + f32(k) * 7.3);
      if (spawnRnd < 0.32) {
        let visH = computeVisibleHeight(b);
        let tipPos = computeSpinePoint(b, max(0.05, visH), 4u);
        p.pos = tipPos + vec3<f32>((spawnRnd - 0.16) * 0.06, 0.02, 0.0);
        p.maxLife = mix(0.75, 1.65, hash11(idxF * 7.7 + u.time));
        p.life = p.maxLife;
        p.vel = vec3<f32>(
          u.windDirX * (0.4 + u.windStrength * 0.7) + (spawnRnd - 0.16) * 0.6,
          select(0.35, 1.15, isFreshCut) + spawnRnd * 0.5,
          u.windDirZ * (0.4 + u.windStrength * 0.5)
        );
        p.color = select(
          vec3<f32>(0.92, 0.94, 0.58),
          vec3<f32>(0.52, 0.88, 0.32),
          isFreshCut
        );
        p.size = mix(0.012, 0.026, hash11(idxF * 31.1 + f32(k)));
        dust[idx] = p;
        return;
      }
    }
  }

  p.life = 0.0;
  dust[idx] = p;
}
`;

const GRASS_PALETTE_WGSL = /* wgsl */ `
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
  let count = u32(u.customColorCount + 0.5);
  if (count <= 1u) {
    return u.customColors[0];
  }
  let t = clamp(tIn, 0.0, 1.0);
  let p0 = getCustomStopPos(0u);
  if (t <= p0) { return u.customColors[0]; }
  let pLast = getCustomStopPos(count - 1u);
  if (t >= pLast) { return u.customColors[count - 1u]; }

  for (var i = 0u; i < count - 1u; i = i + 1u) {
    let pi0 = getCustomStopPos(i);
    let pi1 = getCustomStopPos(i + 1u);
    if (t >= pi0 && t <= pi1) {
      let span = max(0.0001, pi1 - pi0);
      let localT = (t - pi0) / span;
      return mix(u.customColors[i], u.customColors[i + 1u], localT);
    }
  }
  return u.customColors[count - 1u];
}

fn getPresetColor(t: f32, preset: u32, rnd: f32) -> vec4<f32> {
  if (preset == 1u) {
    let root = vec3<f32>(0.04, 0.12, 0.25);
    let mid = vec3<f32>(0.0, 0.85, 0.75);
    let tip = mix(vec3<f32>(0.3, 0.98, 1.0), vec3<f32>(1.0, 0.2, 0.85), rnd * 0.4);
    let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
    return vec4<f32>(col, 1.0);
  } else if (preset == 2u) {
    let root = vec3<f32>(0.35, 0.22, 0.08);
    let mid = vec3<f32>(0.90, 0.72, 0.22);
    let tip = vec3<f32>(1.0, 0.95, 0.55);
    let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
    return vec4<f32>(col, 1.0);
  } else if (preset == 3u) {
    let root = vec3<f32>(0.22, 0.02, 0.35);
    let mid = vec3<f32>(0.12, 0.75, 0.25);
    let tip = vec3<f32>(0.35, 1.0, 0.45);
    let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
    return vec4<f32>(col, 1.0);
  }
  let root = vec3<f32>(0.07, 0.26, 0.07);
  let mid = vec3<f32>(0.20, 0.68, 0.19);
  let tip = vec3<f32>(0.68, 0.96, 0.28) * (0.9 + 0.2 * rnd);
  let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
  return vec4<f32>(col, 1.0);
}
`;

export const GrassRenderWGSL = /* wgsl */ `
${GRASS_SHARED_STRUCTS_WGSL}

@group(0) @binding(0) var<uniform> u: GrassRenderUniforms;
@group(0) @binding(1) var<storage, read> blades: array<GrassBlade>;

${GRASS_PALETTE_WGSL}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) bladeIdx: u32,
  @location(2) depth: f32,
};

fn valueNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u2 = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u2.x), mix(c, d, u2.x), u2.y);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  var out: VertexOutput;
  out.bladeIdx = instanceIndex;

  let cam = buildCamera(u.tilt, u.zoom, u.horizonY);

  // Instance 0: Ground Plane Quad (only uses first 6 vertices)
  if (instanceIndex == 0u) {
    if (u.showGround < 0.5 || vertexIndex >= 6u) {
      out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
      out.uv = vec2<f32>(0.0);
      out.depth = 1.0;
      return out;
    }
    var groundCorners = array<vec2<f32>, 6>(
      vec2<f32>(-7.5,  0.0),
      vec2<f32>( 7.5,  0.0),
      vec2<f32>(-7.5,  5.5),
      vec2<f32>( 7.5,  0.0),
      vec2<f32>( 7.5,  5.5),
      vec2<f32>(-7.5,  5.5)
    );
    let gPos = groundCorners[vertexIndex];
    let worldPos = vec3<f32>(gPos.x, 0.0, gPos.y);
    let pToCam = worldPos - cam.pos;
    let viewZ = dot(pToCam, cam.forward);
    let viewX = dot(pToCam, cam.right);
    let viewY = dot(pToCam, cam.up);

    let clipX = (viewX / cam.fov) / u.aspect;
    let clipY = viewY / cam.fov;
    let clipZ = viewZ * (cam.far / (cam.far - cam.near)) - (cam.near * cam.far / (cam.far - cam.near));

    out.position = vec4<f32>(clipX, clipY, clipZ, viewZ);
    out.uv = vec2<f32>((gPos.x + 7.5) / 15.0, gPos.y / 5.5);
    out.depth = clamp((viewZ - cam.near) / (cam.far - cam.near), 0.0, 1.0);
    return out;
  }

  let blade = blades[instanceIndex];
  let visHeight = computeVisibleHeight(blade);
  let bladeCenter = vec3<f32>(blade.pos.x, visHeight * 0.5, blade.pos.y);
  let centerZ = dot(bladeCenter - cam.pos, cam.forward);
  let bladeRadius = visHeight * 0.75 + blade.width;

  if (blade.state == 0u || visHeight <= 0.005 || (centerZ - bladeRadius) < cam.near) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.uv = vec2<f32>(0.0);
    out.depth = 1.0;
    return out;
  }

  // 4-segment tapered curved ribbon (24 vertices = 4 quads)
  let seg = vertexIndex / 6u;
  let triV = vertexIndex % 6u;
  var sideArr = array<f32, 6>(0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
  var vStepArr = array<u32, 6>(0u, 0u, 1u, 0u, 1u, 1u);
  let ux = sideArr[triV];
  let segLevel = seg + vStepArr[triV];
  let vy = f32(segLevel) * 0.25;
  out.uv = vec2<f32>(ux, vy);

  let bladeRight = normalize(vec3<f32>(cam.right.x, 0.0, cam.right.z));
  // Wispy pointed taper (slender point at tip)
  let taper = pow(max(0.0, 1.0 - vy), 0.82);
  let localX = (ux - 0.5) * blade.width * taper;

  let spinePos = computeSpinePoint(blade, visHeight, segLevel);
  let worldPos = spinePos + bladeRight * localX;

  let pToCam = worldPos - cam.pos;
  let viewZ = dot(pToCam, cam.forward);
  let viewX = dot(pToCam, cam.right);
  let viewY = dot(pToCam, cam.up);

  let clipX = (viewX / cam.fov) / u.aspect;
  let clipY = viewY / cam.fov;
  let clipZ = viewZ * (cam.far / (cam.far - cam.near)) - (cam.near * cam.far / (cam.far - cam.near));

  out.position = vec4<f32>(clipX, clipY, clipZ, viewZ);
  out.depth = clamp((viewZ - cam.near) / (cam.far - cam.near), 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // 1. Procedural Soil / Loam Ground Plane (Instance 0)
  if (in.bladeIdx == 0u) {
    let depthFade = smoothstep(0.0, 0.9, in.depth);
    let n1 = valueNoise(in.uv * vec2<f32>(48.0, 22.0));
    let n2 = valueNoise(in.uv * vec2<f32>(140.0, 64.0));
    let texVar = 0.82 + (n1 * 0.65 + n2 * 0.35) * 0.34;
    var floorCol: vec3<f32>;
    let preset = u32(u.colorPreset + 0.5);
    if (u.useCustomPalette > 0.5) {
      floorCol = sampleCustomPalette(0.0).rgb * 0.55;
    } else if (preset == 1u) {
      floorCol = mix(vec3<f32>(0.02, 0.05, 0.10), vec3<f32>(0.0, 0.18, 0.22), depthFade);
    } else if (preset == 2u) {
      floorCol = mix(vec3<f32>(0.20, 0.12, 0.05), vec3<f32>(0.42, 0.28, 0.10), depthFade);
    } else if (preset == 3u) {
      floorCol = mix(vec3<f32>(0.10, 0.02, 0.18), vec3<f32>(0.05, 0.25, 0.12), depthFade);
    } else {
      floorCol = mix(vec3<f32>(0.05, 0.15, 0.04), vec3<f32>(0.10, 0.32, 0.10), depthFade);
    }
    return vec4<f32>(floorCol * texVar, 1.0);
  }

  let blade = blades[in.bladeIdx];

  var color: vec4<f32>;
  if (u.useCustomPalette > 0.5) {
    color = sampleCustomPalette(in.uv.y);
  } else {
    color = getPresetColor(in.uv.y, u32(u.colorPreset + 0.5), blade.seed);
  }

  // Root occlusion + mid-rib shading + subtle sunlit wind-bend sheen
  let groundOcclusion = mix(0.62, 1.0, sqrt(in.uv.y));
  let ribHighlight = 1.0 - abs(in.uv.x - 0.5) * 0.32;
  let windSheen = 1.0 + max(0.0, blade.bendAngle) * 0.14 * in.uv.y;
  var finalRgb = color.rgb * groundOcclusion * ribHighlight * windSheen;
  var finalAlpha = 1.0;

  // Warm sunlit dust-glow near eroding tip when dissolving
  if (blade.state == 3u) {
    let tipGlow = smoothstep(0.65, 1.0, in.uv.y) * smoothstep(0.0, 0.35, blade.dissolveProgress);
    finalRgb = mix(finalRgb, vec3<f32>(0.96, 0.90, 0.56), tipGlow * 0.65);
    finalAlpha = mix(1.0, 0.35, smoothstep(0.65, 1.0, blade.dissolveProgress));
  }

  if (u.showSky > 0.5) {
    let fog = smoothstep(0.70, 1.0, in.depth);
    let fogColor = vec3<f32>(0.05, 0.10, 0.16);
    finalRgb = mix(finalRgb, fogColor, fog * 0.35);
  }

  return vec4<f32>(finalRgb, finalAlpha);
}
`;

export const GrassTuftRenderWGSL = /* wgsl */ `
${GRASS_SHARED_STRUCTS_WGSL}

@group(0) @binding(0) var<uniform> u: GrassRenderUniforms;
@group(0) @binding(1) var<storage, read> blades: array<GrassBlade>;

struct TuftVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) bladeIdx: u32,
  @location(2) depth: f32,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> TuftVertexOutput {
  var out: TuftVertexOutput;
  out.bladeIdx = instanceIndex;

  if (instanceIndex == 0u) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.uv = vec2<f32>(0.0);
    out.depth = 1.0;
    return out;
  }

  let blade = blades[instanceIndex];
  let visHeight = computeVisibleHeight(blade);
  if (blade.state == 0u || blade.tuftType == 0u || blade.tuftScale <= 0.02 || visHeight <= 0.02) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.uv = vec2<f32>(0.0);
    out.depth = 1.0;
    return out;
  }

  let cam = buildCamera(u.tilt, u.zoom, u.horizonY);
  let tipPos = computeSpinePoint(blade, visHeight, 4u);
  let viewZ = dot(tipPos - cam.pos, cam.forward);
  if (viewZ < cam.near + 0.05) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.uv = vec2<f32>(0.0);
    out.depth = 1.0;
    return out;
  }

  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0,  1.0)
  );
  let c = corners[vertexIndex];
  out.uv = c;

  let headSize = select(
    mix(0.038, 0.068, blade.seed),
    mix(0.115, 0.185, blade.seed),
    blade.tuftType == 1u
  ) * blade.tuftScale;

  var localOffset = cam.right * c.x + cam.up * c.y;
  if (blade.tuftType == 1u) {
    // Anchor purpletop panicle base right onto the stalk tip, alternating left/right arch direction
    let dir = select(1.0, -1.0, blade.seed > 0.5);
    let leanX = (c.x + 0.55) * dir + blade.bendAngle * 0.22 * max(0.0, c.y + 0.82);
    let archY = c.y + 0.82;
    localOffset = cam.right * leanX + cam.up * archY;
  }

  let worldPos = tipPos + localOffset * headSize;
  let pToCam = worldPos - cam.pos;
  let vz = dot(pToCam, cam.forward);
  let vx = dot(pToCam, cam.right);
  let vy = dot(pToCam, cam.up);

  let clipX = (vx / cam.fov) / u.aspect;
  let clipY = vy / cam.fov;
  let clipZ = vz * (cam.far / (cam.far - cam.near)) - (cam.near * cam.far / (cam.far - cam.near));

  out.position = vec4<f32>(clipX, clipY, clipZ, vz);
  out.depth = clamp((vz - cam.near) / (cam.far - cam.near), 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: TuftVertexOutput) -> @location(0) vec4<f32> {
  let blade = blades[in.bladeIdx];
  let r = length(in.uv);
  let ang = atan2(in.uv.y, in.uv.x) + blade.seed * 6.283;
  var col = vec3<f32>(1.0);

  if (blade.tuftType == 1u) {
    // Purpletop (Tridens flavus) arching feathery panicle with wine-burgundy spikelets
    let q = vec2<f32>(in.uv.x * 0.5 + 0.275, in.uv.y * 0.5 + 0.41);
    let pxPad = clamp(in.depth * 0.013, 0.0, 0.010);

    var cov = 0.0;
    var spikeTone = 0.0;

    // Slender central rachis curving up and outward from green stalk base (0, 0)
    if (q.x >= -0.04 && q.x <= 0.55) {
      let stemX = max(0.0, q.x);
      let stemY = 3.1 * stemX - 3.3 * stemX * stemX;
      let dStem = abs(q.y - stemY);
      let taper = mix(0.016, 0.005, clamp(stemX * 1.8, 0.0, 1.0)) + pxPad;
      cov = max(cov, smoothstep(taper, taper * 0.22, dStem));
    }

    // 5 arching raceme branches lined with elongated burgundy-purple spikelets
    for (var bi: u32 = 0u; bi < 5u; bi = bi + 1u) {
      let fi = f32(bi);
      let bx0 = 0.04 + fi * 0.115;
      let by0 = 3.1 * bx0 - 3.3 * bx0 * bx0;
      let bLen = mix(0.47, 0.26, fi * 0.25);
      let dx = q.x - bx0;
      if (dx >= -0.02 && dx <= bLen + 0.03) {
        let uB = clamp(dx / bLen, 0.0, 1.0);
        let slope = mix(1.05, 1.25, fi * 0.25);
        let droop = mix(2.75, 3.90, fi * 0.25);
        let branchY = by0 + slope * max(0.0, dx) - droop * max(0.0, dx) * max(0.0, dx);
        let dyS = q.y - branchY;
        let dy = abs(dyS);

        // Threadlike pedicel/branchlet
        let pedicel = smoothstep(0.009 + pxPad, 0.002, dy) * smoothstep(-0.02, 0.04, uB);

        // Feathery angled grain spikelets along mid & outer branch
        let spikeEnv = sin(uB * 3.14159) * 0.052 + 0.012;
        let grainWave = sin(dx * 58.0 + dyS * 44.0 + fi * 1.9 + blade.seed * 6.283);
        let subGrain = 0.65 + 0.35 * cos(dx * 34.0 - dyS * 28.0 + fi * 0.7);
        let grainShape = clamp((grainWave * 0.5 + 0.5) * subGrain, 0.0, 1.0);
        let spikeMask = smoothstep((spikeEnv + pxPad) * (0.45 + 0.75 * grainShape), spikeEnv * 0.15, dy)
          * smoothstep(0.08, 0.24, uB)
          * smoothstep(1.06, 0.88, uB);

        cov = max(cov, max(pedicel, spikeMask));
        spikeTone = max(spikeTone, spikeMask * grainShape);
      }
    }

    if (cov < 0.22) { discard; }

    let stemGreen = vec3<f32>(0.34, 0.52, 0.14);
    let wineDark = vec3<f32>(0.36, 0.06, 0.14);
    let wineBright = vec3<f32>(0.68, 0.20, 0.29);
    let stalkFade = smoothstep(0.03, 0.28, q.x + q.y * 0.35);
    let purpleCol = mix(wineDark, wineBright, clamp(spikeTone * 0.9 + (in.uv.y * 0.2 + 0.2), 0.0, 1.0));
    col = mix(stemGreen, purpleCol, stalkFade);
  } else if (blade.tuftType == 2u) {
    // Crimson poppy
    if (r > 0.88 + sin(ang * 4.0) * 0.08) { discard; }
    let center = smoothstep(0.34, 0.12, r);
    let ring = smoothstep(0.42, 0.36, r) * smoothstep(0.28, 0.34, r);
    col = mix(vec3<f32>(0.96, 0.08, 0.05), vec3<f32>(0.05, 0.02, 0.02), center) + vec3<f32>(0.35, 0.30, 0.12) * ring;
  } else if (blade.tuftType == 3u) {
    // Dandelion puff
    if (r > 0.95) { discard; }
    let spoke = 0.75 + 0.25 * abs(cos(ang * 9.0));
    let glow = pow(max(0.0, 1.0 - r), 0.65) * spoke;
    col = vec3<f32>(0.95, 0.98, 1.0) * (0.75 + 0.45 * glow);
  } else if (blade.tuftType == 4u) {
    // Kelp bulb
    let d = length(vec2<f32>(in.uv.x * 1.15, in.uv.y * 0.85));
    if (d > 0.85) { discard; }
    col = mix(vec3<f32>(0.80, 0.58, 0.10), vec3<f32>(0.22, 0.95, 0.48), smoothstep(0.8, 0.15, d));
  } else {
    // Golden wheat spike
    let d = length(vec2<f32>(in.uv.x * 1.75, in.uv.y * 0.65));
    if (d > 0.85) { discard; }
    let grain = 0.82 + 0.25 * sin(in.uv.y * 18.0) * cos(in.uv.x * 12.0);
    col = vec3<f32>(1.0, 0.88, 0.40) * grain;
  }

  if (u.showSky > 0.5) {
    let fog = smoothstep(0.70, 1.0, in.depth);
    col = mix(col, vec3<f32>(0.05, 0.10, 0.16), fog * 0.35);
  }

  let alpha = select(1.0, 1.0 - smoothstep(0.3, 1.0, blade.dissolveProgress), blade.state == 3u);
  return vec4<f32>(col, alpha);
}
`;

export const GrassDustRenderWGSL = /* wgsl */ `
${GRASS_SHARED_STRUCTS_WGSL}

@group(0) @binding(0) var<uniform> u: GrassRenderUniforms;
@group(0) @binding(1) var<storage, read> dust: array<DustParticle>;

struct DustVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) alpha: f32,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> DustVertexOutput {
  var out: DustVertexOutput;
  let p = dust[instanceIndex];
  if (p.life <= 0.001 || p.maxLife <= 0.001) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.uv = vec2<f32>(0.0);
    out.color = vec3<f32>(0.0);
    out.alpha = 0.0;
    return out;
  }

  let cam = buildCamera(u.tilt, u.zoom, u.horizonY);
  let centerZ = dot(p.pos - cam.pos, cam.forward);
  if (centerZ < cam.near + 0.05) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.uv = vec2<f32>(0.0);
    out.color = vec3<f32>(0.0);
    out.alpha = 0.0;
    return out;
  }

  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0,  1.0)
  );
  let c = corners[vertexIndex];
  out.uv = c;

  let tNorm = clamp(p.life / p.maxLife, 0.0, 1.0);
  let fadeEnv = sin(tNorm * 3.14159265);
  let worldPos = p.pos + (cam.right * c.x + cam.up * c.y) * p.size;

  let pToCam = worldPos - cam.pos;
  let vz = dot(pToCam, cam.forward);
  let vx = dot(pToCam, cam.right);
  let vy = dot(pToCam, cam.up);

  let clipX = (vx / cam.fov) / u.aspect;
  let clipY = vy / cam.fov;
  let clipZ = vz * (cam.far / (cam.far - cam.near)) - (cam.near * cam.far / (cam.far - cam.near));

  out.position = vec4<f32>(clipX, clipY, clipZ, vz);
  out.color = p.color;
  out.alpha = fadeEnv * 0.85;
  return out;
}

@fragment
fn fs_main(in: DustVertexOutput) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  if (d > 1.0) {
    discard;
  }
  let soft = pow(1.0 - d, 1.6);
  return vec4<f32>(in.color, in.alpha * soft);
}
`;
