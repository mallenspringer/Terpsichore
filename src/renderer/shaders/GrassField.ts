export const GrassComputeWGSL = `
struct GrassBlade {
  pos: vec2<f32>,        // (x, z) ground plane position [-3.2, 3.2] x [-0.6, 4.2]
  height: f32,           // Current visible height
  targetHeight: f32,     // Max mature height for this blade
  width: f32,            // Blade width
  curvature: f32,        // Curvature / bend factor
  swayPhase: f32,        // Spatial wind offset
  age: f32,              // Blade age in seconds
  lifetime: f32,         // Max lifespan if timer decay enabled
  state: u32,            // 0: inactive, 1: growing, 2: mature, 3: dissolving, 4: cut/pruned
  dissolveProgress: f32, // 0.0 to 1.0 (gradient dust wipe)
  tuftType: u32,         // 0: none, 1: wildflowers, 2: poppies, 3: dandelions, 4: kelp, 5: wheat
  seed: f32,             // Pseudo-random seed for individuality
  dynamicBend: f32,      // Smoothed viscoelastic bend angle
  recoilDelay: f32,      // Stickiness / lingering recoil timer (seconds)
  tuftScale: f32,        // Animated blossom scale 0.0 to 1.0
};

struct GrassComputeUniforms {
  dt: f32,
  time: f32,
  growth: f32,           // Target growth factor 0..1
  density: f32,          // Active blade ratio 0.1..1.0
  bend: f32,             // Curvature bias -1..1
  fatness: f32,          // Blade width scale
  windSpeed: f32,        // Wind wave speed
  windStrength: f32,     // Wind wave amplitude
  timerDecayEnabled: f32,// 0 or 1
  lifetimeDuration: f32, // Lifetime in seconds
  pruneTrigger: f32,     // > 0.5 triggers prune
  pruneCutRatio: f32,    // 0..1 ratio of blades affected
  pruneMode: f32,        // 0: instant cut, 1: dust dissolve
  tuftTrigger: f32,      // > 0.5 triggers tuft spawn
  tuftStyle: f32,        // 1: wildflowers, 2: poppies, 3: dandelions, 4: kelp, 5: wheat
  tuftChance: f32,       // Stochastic chance 0..1
  tuftBurstAmount: f32,  // Number of tufts to spawn on burst
  totalBlades: f32,      // Total buffer capacity
  growthRate: f32,       // 0.01 to 3.0 (speed multiplier)
  windPhase: f32,        // Continuous integrated wind phase from CPU
};

@group(0) @binding(0) var<uniform> u: GrassComputeUniforms;
@group(0) @binding(1) var<storage, read> bladesIn: array<GrassBlade>;
@group(0) @binding(2) var<storage, read_write> bladesOut: array<GrassBlade>;

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

@compute @workgroup_size(64, 1, 1)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (f32(index) >= u.totalBlades) {
    return;
  }

  // Instance 0 is reserved for rendering the 3D ground plane / soil terrain
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

  // 1. Blade Initialization / Ground Distribution (Starts dormant in soil)
  if (b.seed == 0.0) {
    let gx = (rnd - 0.5) * 15.0; // Spans exactly [-7.5, 7.5] across entire width of ground object
    let gz = 0.0 + rnd2 * 5.5;    // Spans [0.0, 5.5] matching ground plane
    b.pos = vec2<f32>(gx, gz);
    b.targetHeight = 0.65 + rnd3 * 0.70;
    // Initial instantiation: starts dormant in the ground (0 height, state 0)
    b.height = 0.0;
    b.width = (0.032 + rnd * 0.024) * u.fatness;
    b.curvature = (rnd2 - 0.5) * 0.6;
    b.swayPhase = gx * 1.8 + gz * 1.4 + rnd * 6.28;
    b.lifetime = max(3.0, u.lifetimeDuration * (0.6 + 0.8 * rnd));
    // Stagger initial ages across [0, lifetime] so blades dissolve continuously!
    b.age = rnd3 * b.lifetime;
    b.state = 0u; // 0: dormant / not yet sprouted
    b.dissolveProgress = 0.0;
    b.tuftType = select(0u, u32(u.tuftStyle), rnd < u.tuftChance);
    b.dynamicBend = 0.0;
    b.recoilDelay = 0.0;
    b.tuftScale = 0.0;
    b.seed = rnd + 0.001;
  }

  // 2. Active Density & Germination Filtering
  let activeRatio = bladeIdxF / u.totalBlades;
  let inDensityRange = activeRatio <= u.density;

  // Staggered germination threshold across seeds (0.01 to 0.85)
  let germinateThreshold = 0.01 + rnd * 0.84;
  let canGerminate = inDensityRange && (u.growth > germinateThreshold);

  // Handle post-dissolution dormancy cooldown timer (recoilDelay holds dormancy remaining)
  if (b.state == 0u && b.recoilDelay > 0.0) {
    b.recoilDelay = max(0.0, b.recoilDelay - u.dt);
  }

  // 3. State Progression: Germination, Organic Growth, Decay & Removal
  if (canGerminate && b.recoilDelay <= 0.0) {
    // Blade is authorized to sprout / grow
    if (b.state == 0u) {
      // Sprout from seed! Re-roll tuft choice based on active chance
      b.state = 1u; // growing
      b.height = 0.001;
      b.age = 0.0;
      b.dissolveProgress = 0.0;
      b.tuftScale = 0.0;
      b.tuftType = select(0u, u32(u.tuftStyle), rnd < u.tuftChance);
    } else if (b.state == 4u) {
      // Regrow from cut stubble if growth drive increases
      if (u.growth > 0.30) {
        b.state = 1u;
      }
    }

    if (b.state == 1u || b.state == 2u) {
      // Update tuft style if active tuft exists
      if (b.tuftType > 0u && u.tuftStyle > 0.0) {
        b.tuftType = u32(u.tuftStyle);
      } else if (b.tuftType == 0u && rnd < u.tuftChance && b.height > 0.20) {
        // Late bloomer if tuftChance slider is raised
        b.tuftType = u32(u.tuftStyle);
      }

      // Timer continuous decay handling (if enabled)
      if (u.timerDecayEnabled > 0.5) {
        b.age = b.age + u.dt;
        if (b.age >= b.lifetime) {
          b.state = 3u; // enter dissolve dust wipe
          b.dissolveProgress = 0.0;
        }
      }

      // Compute target mature height.
      // Once sprouted, blades grow up towards their mature target without violently shrinking on brief volume dips!
      let targetRatio = clamp(0.35 + 0.65 * u.growth, 0.35, 1.0);
      let targetH = b.targetHeight * targetRatio;

      // Organic growth rate: scaled by u.growthRate
      let growSpeed = 0.65 * max(0.01, u.growthRate);
      if (b.height < targetH) {
        b.height = min(targetH, b.height + u.dt * growSpeed);
      } else {
        b.height = max(targetH, b.height - u.dt * growSpeed * 0.4);
      }

      if (b.height >= targetH * 0.90 && b.height > 0.04) {
        b.state = 2u; // mature
      } else {
        b.state = 1u; // growing
      }
    }
  } else {
    // When u.growth drops below threshold (or out of density range)
    // If timer decay is ON, mature blades can finish their lifespan gracefully unless growth is deeply cut (u.growth < 0.02)
    // If timer decay is OFF, blades slowly wither back down
    if (b.state == 1u || b.state == 2u) {
      let isTotalSilence = u.growth <= 0.025;
      if (isTotalSilence || !inDensityRange || u.timerDecayEnabled < 0.5) {
        if (u.pruneMode > 0.5) {
          // Dissolve into dust
          if (b.state != 3u) {
            b.state = 3u;
            b.dissolveProgress = 0.0;
          }
        } else {
          // Organic wither back into the earth
          let witherSpeed = 0.55 * max(0.2, u.growthRate);
          b.height = max(0.0, b.height - u.dt * witherSpeed);
          if (b.height <= 0.003) {
            b.state = 0u;
            b.height = 0.0;
            b.tuftScale = 0.0;
            b.age = 0.0;
            b.recoilDelay = mix(0.4, 1.6, rnd); // brief dormancy
          }
        }
      } else {
        // Timer decay is active and non-zero sound: let blade age naturally
        b.age = b.age + u.dt;
        if (b.age >= b.lifetime) {
          b.state = 3u;
          b.dissolveProgress = 0.0;
        }
      }
    }
  }

  // Handle blades currently dissolving (e.g. from timer decay or prune dissolve)
  if (b.state == 3u) {
    b.dissolveProgress = b.dissolveProgress + u.dt * 1.6;
    if (b.dissolveProgress >= 1.0) {
      // COMPLETELY REMOVED! Enter randomized dormancy cooldown so meadow respawns organically
      b.state = 0u;
      b.height = 0.0;
      b.dissolveProgress = 0.0;
      b.tuftScale = 0.0;
      b.age = 0.0;
      b.recoilDelay = mix(0.6, 2.2, rnd); // Staggered dormancy gap
      // Re-randomize lifetime for next cycle
      let nextRnd = hash11(bladeIdxF * 71.39 + u.time * 0.2);
      b.lifetime = max(3.0, u.lifetimeDuration * (0.6 + 0.8 * nextRnd));
    }
  }

  // Gated Pruning / Cut Trigger Handling
  if (u.pruneTrigger > 0.5 && (b.state == 1u || b.state == 2u)) {
    let cutRnd = hash11(bladeIdxF * 91.137 + u.time);
    if (cutRnd < u.pruneCutRatio) {
      if (u.pruneMode < 0.5) {
        // Sudden scythe cut: truncate blade to short stubble
        b.height = b.height * 0.25;
        b.tuftType = 0u;
        b.tuftScale = 0.0;
        b.state = 4u; // cut
      } else {
        // Dissolve into dust
        b.state = 3u;
        b.dissolveProgress = 0.0;
      }
    }
  }

  // Tuft Burst Trigger Handling - Spawns flowers on ANY visible blade (growing or mature)
  if (u.tuftTrigger > 0.5 && (b.state == 1u || b.state == 2u) && b.height > 0.10) {
    let burstRnd = hash11(bladeIdxF * 53.471 + u.time * 1.3);
    let burstThreshold = (u.tuftBurstAmount * 18.0) / (u.totalBlades * max(0.2, u.density));
    if (burstRnd < burstThreshold) {
      b.tuftType = u32(u.tuftStyle);
      b.tuftScale = max(b.tuftScale, 0.12); // trigger instant bloom
    }
  }

  // Animated Blossoming Progression for Tufts (accessible to all heights > 0.12)
  if (b.tuftType > 0u && (b.state == 1u || b.state == 2u)) {
    if (b.height > max(0.08, b.targetHeight * 0.25)) {
      b.tuftScale = min(1.0, b.tuftScale + u.dt * 2.2);
    } else {
      b.tuftScale = max(0.0, b.tuftScale - u.dt * 1.5);
    }
  } else {
    b.tuftScale = 0.0;
  }

  // 4. Bend Dynamics: Smooth Continuous Wind Wave + Sub-Bass Gust Physics
  let stiffness = mix(0.75, 1.25, rnd2);
  let wPhase = u.windPhase;
  // Natural multi-frequency spatial wave
  let wave = sin(wPhase + b.swayPhase) * cos(wPhase * 0.65 + b.pos.x * 1.1)
           + sin(wPhase * 1.4 + b.pos.y * 0.8) * 0.35;

  // Unclamped physical target bend: allows expressive sway with smooth tanh saturation
  let rawBend = (u.bend * 0.55 + wave * u.windStrength * 0.55) / stiffness;
  // Soft saturation using tanh-like curve: [-1.05, 1.05] rad (~60 deg max bend)
  let targetBend = rawBend / (1.0 + abs(rawBend) * 0.5);

  // Viscoelastic following: swift attack with wind gust, staggered gentle uncurling
  let diff = targetBend - b.dynamicBend;
  let recoverySpeed = mix(2.2, 4.0, rnd);
  let followRate = select(recoverySpeed, 8.5, abs(targetBend) > abs(b.dynamicBend));
  b.dynamicBend = b.dynamicBend + diff * clamp(u.dt * followRate, 0.0, 0.55);

  // Curvature: spectral brightness/slider bend curls stalk tips
  b.curvature = (rnd2 - 0.5) * 0.25 + u.bend * 0.5;
  b.width = (0.032 + rnd * 0.024) * u.fatness;

  bladesOut[index] = b;
}
`;

export const GrassRenderWGSL = `
struct GrassBlade {
  pos: vec2<f32>,
  height: f32,
  targetHeight: f32,
  width: f32,
  curvature: f32,
  swayPhase: f32,
  age: f32,
  lifetime: f32,
  state: u32,
  dissolveProgress: f32,
  tuftType: u32,
  seed: f32,
  dynamicBend: f32,
  recoilDelay: f32,
  tuftScale: f32,
};

struct GrassRenderUniforms {
  aspect: f32,
  time: f32,
  tilt: f32,             // 0.0 (frontal 1.1 deg) to 1.0 (top-down 84.6 deg)
  zoom: f32,
  horizonY: f32,
  windSpeed: f32,
  windStrength: f32,
  colorPreset: f32,      // 0: meadow, 1: bioluminescent, 2: golden, 3: neon
  useCustomPalette: f32,
  customColorCount: f32,
  customInterpolation: f32,
  showSky: f32,          // 0.0 or 1.0 (full alpha transparency when 0)
  showGround: f32,       // 0.0 or 1.0 (discard 3D ground plane when 0)
  pad1: f32,
  pad2: f32,
  pad3: f32,
  customColors: array<vec4<f32>, 8>,
  customPositions: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> u: GrassRenderUniforms;
@group(0) @binding(1) var<storage, read> blades: array<GrassBlade>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) bladeIdx: u32,
  @location(2) depth: f32,
};

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
    // Bioluminescent Deep Flora (Deep Teal to Glowing Cyan/Neon Magenta)
    let root = vec3<f32>(0.04, 0.12, 0.25);
    let mid = vec3<f32>(0.0, 0.85, 0.75);
    let tip = mix(vec3<f32>(0.3, 0.98, 1.0), vec3<f32>(1.0, 0.2, 0.85), rnd * 0.4);
    let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
    return vec4<f32>(col, 1.0);
  } else if (preset == 2u) {
    // Golden Wheat (Amber/Brown root to Sunlit Golden Ochre)
    let root = vec3<f32>(0.35, 0.22, 0.08);
    let mid = vec3<f32>(0.90, 0.72, 0.22);
    let tip = vec3<f32>(1.0, 0.95, 0.55);
    let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
    return vec4<f32>(col, 1.0);
  } else if (preset == 3u) {
    // Cyber Neon Lawn (Dark Violet root to Electric Lime Green)
    let root = vec3<f32>(0.22, 0.02, 0.35);
    let mid = vec3<f32>(0.12, 0.75, 0.25);
    let tip = vec3<f32>(0.35, 1.0, 0.45);
    let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
    return vec4<f32>(col, 1.0);
  }
  // Default Spring Meadow (Rich emerald forest roots to vibrant sun-dappled lime tips)
  let root = vec3<f32>(0.08, 0.28, 0.08);
  let mid = vec3<f32>(0.20, 0.70, 0.20);
  let tip = vec3<f32>(0.65, 0.96, 0.25) * (0.9 + 0.2 * rnd);
  let col = select(mix(root, mid, t * 2.0), mix(mid, tip, (t - 0.5) * 2.0), t > 0.5);
  return vec4<f32>(col, 1.0);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  var out: VertexOutput;
  out.bladeIdx = instanceIndex;

  // 3D Perspective Camera Setup: Smooth orbit around target
  let pitch = mix(0.015, 0.955, u.tilt) * 1.5707963;
  let camDist = 2.6 / max(0.2, u.zoom);
  let targetPos = vec3<f32>(0.0, 0.20 + u.horizonY * 0.5, 2.75);

  let camY = targetPos.y + sin(pitch) * camDist;
  let camZ = targetPos.z - cos(pitch) * camDist;
  let camPos = vec3<f32>(0.0, camY, camZ);

  let forward = normalize(targetPos - camPos);
  let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), forward));
  let up = cross(forward, right);
  let fov = 1.35;
  let near = 0.15;
  let far = 25.0;

  // Instance 0: Expansive Ground Plane Quad (Soil / Turf Meadow Floor)
  if (instanceIndex == 0u) {
    if (u.showGround < 0.5) {
      // Ground plane hidden: discard quad completely
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
    let pToCam = worldPos - camPos;
    let viewZ = dot(pToCam, forward);
    let viewX = dot(pToCam, right);
    let viewY = dot(pToCam, up);

    let clipX = (viewX / fov) / u.aspect;
    let clipY = viewY / fov;
    let clipZ = viewZ * (far / (far - near)) - (near * far / (far - near));
    let clipW = viewZ;

    out.position = vec4<f32>(clipX, clipY, clipZ, clipW);
    out.uv = vec2<f32>((gPos.x + 7.5) / 15.0, gPos.y / 5.5);
    out.depth = clamp((viewZ - near) / (far - near), 0.0, 1.0);
    return out;
  }

  // Instances 1..N: Grass Blades
  let blade = blades[instanceIndex];

  // Near-plane guard: calculate blade center distance to camera
  let bladeCenter = vec3<f32>(blade.pos.x, blade.height * 0.5, blade.pos.y);
  let centerToCam = bladeCenter - camPos;
  let centerZ = dot(centerToCam, forward);
  let bladeRadius = blade.height * 0.75 + blade.width;

  // Cull blades that are dormant, zero height, or encroaching the camera near plane
  if (blade.state == 0u || blade.height <= 0.005 || (centerZ - bladeRadius) < near) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0); // Safely discard entire blade
    out.uv = vec2<f32>(0.0);
    out.depth = 1.0;
    return out;
  }

  // 6 Vertices per blade: 2 triangles forming a tapered quad
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 1.0)
  );

  let uv = uvs[vertexIndex];
  out.uv = uv;

  // Billboard horizontally towards camera so blade width is always perpendicular to view ray
  let bladeRight = normalize(vec3<f32>(right.x, 0.0, right.z));

  // Blade geometry in local space: wide base, natural taper
  let taper = mix(1.0, 0.30, pow(uv.y, 1.1));

  // Volumetric floral expansion: expand mesh laterally when blade has an active blossom
  var flowerBulge = 1.0;
  if (blade.tuftType > 0u && uv.y > 0.65 && blade.tuftScale > 0.02) {
    let flowerT = (uv.y - 0.65) / 0.35; // 0..1 along blossom head
    flowerBulge = 1.0 + sin(flowerT * 3.14159) * 2.2 * blade.tuftScale;
  }
  let localX = (uv.x - 0.5) * blade.width * taper * flowerBulge;

  // Length-conserving physical curvature along camera billboard plane:
  // Natural resting lean per blade (+- 0.08 rad) + dynamic wind bend + tip curvature
  let naturalLean = (blade.seed - 0.5) * 0.16;
  let tipBend = blade.curvature * pow(uv.y, 2.0);
  let bendAngle = (blade.dynamicBend + naturalLean) * pow(uv.y, 1.3) + tipBend;
  let lateralDisplacement = sin(bendAngle) * (blade.height * uv.y);
  let verticalHeight = cos(bendAngle) * (blade.height * uv.y);

  // 3D World Space coordinates (strictly length-conserving, zero camera-piercing rays)
  let worldPos = vec3<f32>(
    blade.pos.x,
    verticalHeight,
    blade.pos.y
  ) + bladeRight * (localX + lateralDisplacement);

  // Transform world to camera view coordinates
  let pToCam = worldPos - camPos;
  let viewZ = dot(pToCam, forward);
  let viewX = dot(pToCam, right);
  let viewY = dot(pToCam, up);

  // Perspective Projection into proper Homogenous Clip Space (W = viewZ)
  let clipX = (viewX / fov) / u.aspect;
  let clipY = viewY / fov;
  let clipZ = viewZ * (far / (far - near)) - (near * far / (far - near));
  let clipW = viewZ;

  out.position = vec4<f32>(clipX, clipY, clipZ, clipW);
  out.depth = clamp((viewZ - near) / (far - near), 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // 1. Terrain Ground Plane Shading for Instance 0
  if (in.bladeIdx == 0u) {
    let depthFade = smoothstep(0.0, 0.9, in.depth);
    var floorCol: vec3<f32>;
    let preset = u32(u.colorPreset + 0.5);
    if (u.useCustomPalette > 0.5) {
      floorCol = sampleCustomPalette(0.0).rgb * 0.65;
    } else if (preset == 1u) {
      floorCol = mix(vec3<f32>(0.02, 0.06, 0.12), vec3<f32>(0.0, 0.22, 0.25), depthFade);
    } else if (preset == 2u) {
      floorCol = mix(vec3<f32>(0.22, 0.14, 0.06), vec3<f32>(0.48, 0.32, 0.12), depthFade);
    } else if (preset == 3u) {
      floorCol = mix(vec3<f32>(0.12, 0.02, 0.22), vec3<f32>(0.06, 0.32, 0.15), depthFade);
    } else {
      // Lush forest loam / meadow carpet
      floorCol = mix(vec3<f32>(0.06, 0.20, 0.06), vec3<f32>(0.12, 0.42, 0.14), depthFade);
    }
    return vec4<f32>(floorCol, 1.0);
  }

  let blade = blades[in.bladeIdx];

  // 2. Dissolution Dust Wipe Handling
  if (blade.state == 3u) {
    // Gradient wipe from top corner to opposite bottom corner
    let wipeThreshold = in.uv.x * 0.35 + (1.0 - in.uv.y);
    let cutoff = (1.0 - blade.dissolveProgress) * 1.35;
    if (wipeThreshold > cutoff) {
      discard;
    }
  }

  // 3. Base Color & Shading
  var color: vec4<f32>;
  if (u.useCustomPalette > 0.5) {
    color = sampleCustomPalette(in.uv.y);
  } else {
    color = getPresetColor(in.uv.y, u32(u.colorPreset + 0.5), blade.seed);
  }

  // Ambient shading: root ground occlusion + tip highlight (keeps rich root color)
  let groundOcclusion = mix(0.70, 1.0, sqrt(in.uv.y));
  let edgeShading = 1.0 - abs(in.uv.x - 0.5) * 0.25;
  var finalRgb = color.rgb * groundOcclusion * edgeShading;

  // 4. Procedural Tuft / Blossom Rendering at Expanded Blade Tip
  if (blade.tuftType > 0u && blade.tuftScale > 0.05 && in.uv.y > 0.65) {
    let tuftT = (in.uv.y - 0.65) / 0.35; // 0..1 at upper blossom head
    let tuftX = (in.uv.x - 0.5) * 2.0;   // -1..1 lateral across blossom
    let scale = blade.tuftScale;

    if (blade.tuftType == 1u) {
      // Wildflower Petals (Vibrant Golden Core radiating 5 Magenta Petals)
      let r = sqrt(tuftX * tuftX + tuftT * tuftT) / scale;
      let angle = atan2(tuftT, tuftX);
      let petal = abs(cos(angle * 2.5));
      if (r < 0.75 + petal * 0.35) {
        let centerPollen = smoothstep(0.28, 0.10, r);
        let flowerCol = mix(
          mix(vec3<f32>(1.0, 0.20, 0.75), vec3<f32>(0.98, 0.50, 0.90), in.uv.x),
          vec3<f32>(1.0, 0.90, 0.15),
          centerPollen
        );
        finalRgb = mix(finalRgb, flowerCol, smoothstep(0.0, 0.2, scale));
      }
    } else if (blade.tuftType == 2u) {
      // Poppy Head (Vivid Crimson Dome with Velvet Center and Pollen Fringe)
      let d = length(vec2<f32>(tuftX * 1.15, (tuftT - 0.5) * 1.8)) / scale;
      if (d < 0.95) {
        let poppyRed = vec3<f32>(0.98, 0.08, 0.04);
        let center = smoothstep(0.35, 0.12, d);
        let ring = smoothstep(0.38, 0.34, d) * smoothstep(0.28, 0.33, d);
        let poppyCol = mix(poppyRed, vec3<f32>(0.04, 0.02, 0.02), center) + vec3<f32>(0.3, 0.28, 0.1) * ring;
        finalRgb = mix(finalRgb, poppyCol, 0.92 * smoothstep(0.0, 0.2, scale));
      }
    } else if (blade.tuftType == 3u) {
      // Dandelion Spores (Translucent Opal/White Spherical Puff with Radial Glow)
      let d = length(vec2<f32>(tuftX, (tuftT - 0.5) * 1.4)) / scale;
      if (d < 1.0) {
        let sporeGlow = pow(1.0 - d, 0.7) * 1.4;
        let sporeCol = vec3<f32>(0.96, 0.98, 1.0) * sporeGlow;
        finalRgb = mix(finalRgb, sporeCol, 0.88 * smoothstep(0.0, 0.2, scale));
      }
    } else if (blade.tuftType == 4u) {
      // Kelp / Seaweed Bulbs (Glowing Emerald-Amber Air Bladder)
      let d = length(vec2<f32>(tuftX * 1.3, (tuftT - 0.45) * 2.0)) / scale;
      if (d < 0.85) {
        let innerGlow = smoothstep(0.7, 0.1, d);
        let kelpCol = mix(vec3<f32>(0.85, 0.60, 0.10), vec3<f32>(0.20, 0.95, 0.45), innerGlow);
        finalRgb = mix(finalRgb, kelpCol, 0.92 * smoothstep(0.0, 0.2, scale));
      }
    } else if (blade.tuftType == 5u) {
      // Spiky Golden Wheat / Cattail (Textured Husks with Golden Awns)
      let grain = sin(tuftT * 26.0) * cos(tuftX * 10.0);
      let awn = sin(tuftT * 50.0 + tuftX * 8.0) * 0.15;
      let wheatCol = vec3<f32>(1.0, 0.88, 0.42) * (0.85 + 0.35 * grain + awn);
      finalRgb = mix(finalRgb, wheatCol, 0.88 * smoothstep(0.0, 0.2, scale));
    }
  }

  // 5. Atmospheric Soft Depth Fog
  if (u.showSky > 0.5) {
    let fog = smoothstep(0.70, 1.0, in.depth);
    let fogColor = vec3<f32>(0.05, 0.10, 0.16);
    finalRgb = mix(finalRgb, fogColor, fog * 0.35);
  }

  return vec4<f32>(finalRgb, 1.0);
}
`;
