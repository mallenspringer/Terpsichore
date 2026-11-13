import { ArabesqueEffect } from '../state/types';
import { computeSeedAnchors } from '../utils/arabesqueUtils';

export const MAX_ARABESQUE_SEGMENTS = 16384;
export const ARABESQUE_SEGMENT_FLOATS = 20; // 80 bytes per segment
export const ARABESQUE_SEGMENT_BYTES = ARABESQUE_SEGMENT_FLOATS * 4;

const MAX_WAVES = 32;
const MAX_ACTIVE_TIPS = 256;
const SEG_STEP = 0.015;

export const FLAG_IS_TIP = 1;
export const FLAG_IS_FORK = 2;
export const FLAG_IS_SEED_START = 4;
export const FLAG_LIVE_HEAD = 8;

export interface ArabesqueFrameInputs {
  dt: number;
  timeSec: number;
  aspect: number;
  isAudioConnected: boolean;
  audioRms: number;
  bpm: number;
  bpmConfidence: number;
  bassEnergy: number;
  melodicCentroid: number;
  melodicEnergy: number;
  hfEnergy: number;
  growthCv?: number;
  curlCv?: number;
  branchCv?: number;
  widthCv?: number;
  seedsCv?: number;
  pruneIn?: number;
  seedTrigRising?: boolean;
}

export interface ArabesqueWave {
  id: number;
  colorT: number;
  birthTime: number;
  age: number;
  autoErasing: boolean;
  pruneErasing: boolean;
  eraseDist: number;
  retractMax: number;
  fadeAlpha: number;
  maxArcDist: number;
  activeTips: number;
  segmentCount: number;
}

interface ArabesqueTip {
  waveId: number;
  seedIndex: number;
  x: number;
  y: number;
  theta: number;
  nx: number;
  ny: number;
  kappa: number;
  polarity: number;
  turnAccum: number;
  maxTurn: number;
  inflectionsLeft: number;
  depth: number;
  arcDist: number;
  distSinceBranch: number;
  distBudget: number;
  paletteT: number;
  randSeed: number;
  isAtSeedStart: boolean;
  prevSegIdx: number;
}

interface ArabesqueSegmentRecord {
  waveId: number;
  p0x: number;
  p0y: number;
  p1x: number;
  p1y: number;
  n0x: number;
  n0y: number;
  n1x: number;
  n1y: number;
  w0: number;
  w1: number;
  arc0: number;
  arc1: number;
  paletteT: number;
  depthNorm: number;
  flags: number;
  curvature: number;
  randSeed: number;
}

function hash01(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Self-contained CPU curve topology & audio-reactive envelope simulation for the Arabesque module.
 * Maintains C1-smooth Euler spiral filigree waves, synchronized burst colors, and independent dual erosion.
 */
export class ArabesqueSimulation {
  public waves: ArabesqueWave[] = [];
  public tips: ArabesqueTip[] = [];
  public segments: ArabesqueSegmentRecord[] = [];

  private nextWaveId = 1;
  private nextPaletteT = 0.08;
  private waveCooldown = 0.0;
  private autoBranchTimer = 0.0;

  // Audio DSP envelope followers
  private bassEma = 0.0;
  private surgeEnv = 0.0;
  private hfEma = 0.0;
  private lastBranchTime = -10.0;
  private lastPruneTime = -10.0;
  private heldPhraseCurl = 0.5;
  private lastLineWidth = 1.0;
  private simRngCounter = 1.0;

  public getSurgeEnvelope(): number {
    return this.surgeEnv;
  }

  public getHeldPhraseCurl(): number {
    return this.heldPhraseCurl;
  }

  private nextRand(): number {
    this.simRngCounter += 1.0;
    return hash01(this.simRngCounter * 1.371 + 0.419);
  }

  public step(ef: ArabesqueEffect, inp: ArabesqueFrameInputs): void {
    const dt = Math.max(0.001, Math.min(0.08, inp.dt));
    const t = inp.timeSec;

    const effectiveSeeds = inp.seedsCv !== undefined
      ? Math.max(1, Math.min(8, Math.round(1 + Math.max(0, Math.min(1, inp.seedsCv)) * 7)))
      : Math.max(1, Math.min(8, Math.round(ef.seedCount ?? 4)));

    const lineWidth = inp.widthCv !== undefined
      ? Math.max(0.15, Math.min(3.5, 0.2 + Math.max(0, Math.min(1, inp.widthCv)) * 2.8))
      : Math.max(0.15, Math.min(3.5, ef.lineWidth ?? 1.0));

    const randomness = Math.max(0, Math.min(1, ef.randomness ?? 0.3));
    const baseSpeed = Math.max(0.02, Math.min(2.5, ef.growthSpeed ?? 0.28));
    const bassSurgeGain = Math.max(0, Math.min(4.5, ef.bassSurgeGain ?? 1.2));
    const baseBranch = Math.max(0, Math.min(1, ef.branchRate ?? 0.45));
    const baseCurl = Math.max(0.1, Math.min(2.5, ef.curlAmount ?? 1.0));

    // 1. Sub-bass / Bass Surge Envelope (fast attack, steep exponential decay back to baseline)
    const bassFlux = Math.max(0, inp.bassEnergy - this.bassEma);
    this.bassEma += (inp.bassEnergy > this.bassEma ? 0.32 : 0.10) * (inp.bassEnergy - this.bassEma);
    if (inp.isAudioConnected && bassFlux > 0.028 && inp.audioRms > 0.008) {
      this.surgeEnv = Math.max(this.surgeEnv, Math.min(1.0, bassFlux * 5.2));
    } else if (!inp.isAudioConnected) {
      // Gentle autonomous rhythmic pulse in unpatched standalone mode
      const autoPulse = Math.max(0, Math.sin(t * 1.45));
      if (autoPulse > 0.96 && this.surgeEnv < 0.35) {
        this.surgeEnv = 0.42;
      }
    }
    // Steep ease-down (~85ms time constant) so tips burst quickly then snap back to snail baseline
    this.surgeEnv *= Math.exp(-dt / 0.085);

    // 2. Melodic Curl Phrase Smoothing + Sample-and-Hold Silence Gate
    if (inp.curlCv !== undefined) {
      this.heldPhraseCurl = Math.max(0, Math.min(1, inp.curlCv));
    } else if (inp.isAudioConnected) {
      if (inp.melodicEnergy > 0.02) {
        const isUp = inp.melodicCentroid > this.heldPhraseCurl;
        const tau = isUp ? 0.19 : 0.55;
        const alpha = 1.0 - Math.exp(-dt / tau);
        this.heldPhraseCurl += (inp.melodicCentroid - this.heldPhraseCurl) * alpha;
      }
      // Below gate: hold heldPhraseCurl steady so curves don't snap straight mid-phrase
    } else {
      // Autonomous slow phrase drift
      this.heldPhraseCurl = 0.5 + 0.36 * Math.sin(t * 0.41) * Math.cos(t * 0.17);
    }

    // 3. Detect Silent Connected Audio Input (vs Active or Autonomous)
    const hasCvMotionOverride = inp.growthCv !== undefined;
    const isAudioQuiet = inp.isAudioConnected
      && !hasCvMotionOverride
      && inp.audioRms < 0.008
      && inp.melodicEnergy < 0.02
      && inp.bassEnergy < 0.02;

    // 4. Growth Speed Calculation (confidence-weighted BPM snail baseline + scaled bass surge)
    // Scale 7.3x so bassSurgeGain=1.2 (~30% of slider throw) matches previous max burst strength.
    let growthVel = 0.0;
    if (inp.growthCv !== undefined) {
      growthVel = baseSpeed * (0.15 + Math.max(0, Math.min(1.5, inp.growthCv)) * 2.2);
    } else if (!isAudioQuiet) {
      const bpmFactor = ef.bpmCoupling !== false
        ? 1.0 + ((Math.max(60, Math.min(180, inp.bpm)) / 120.0) - 1.0) * Math.max(0, Math.min(1, inp.bpmConfidence)) * 0.75
        : 1.0;
      const snailBaseline = baseSpeed * 0.34 * bpmFactor;
      const surgeBoost = baseSpeed * this.surgeEnv * bassSurgeGain * 7.3;
      growthVel = snailBaseline + surgeBoost;
    }

    // 5. High-Frequency Transient Detection for Branching & Pruning
    const hfFlux = Math.max(0, inp.hfEnergy - this.hfEma);
    this.hfEma += (inp.hfEnergy > this.hfEma ? 0.30 : 0.06) * (inp.hfEnergy - this.hfEma);

    let branchTriggerHit = false;
    if (inp.branchCv !== undefined) {
      if (inp.branchCv > 0.55 && (t - this.lastBranchTime) > 0.18) {
        branchTriggerHit = true;
        this.lastBranchTime = t;
      }
    } else if (inp.isAudioConnected && !isAudioQuiet) {
      if (hfFlux > 0.052 && (t - this.lastBranchTime) > 0.14) {
        branchTriggerHit = true;
        this.lastBranchTime = t;
      }
    } else if (!inp.isAudioConnected) {
      this.autoBranchTimer += dt * (0.6 + baseBranch * 1.4);
      if (this.autoBranchTimer > 0.85) {
        this.autoBranchTimer = 0;
        branchTriggerHit = baseBranch > 0.08;
      }
    }

    // 6. Spawn New Wave: immediate respawn when canvas is empty & audio active, plus continuous waves
    this.waveCooldown = Math.max(0, this.waveCooldown - dt);
    const canvasCleared = this.waves.length === 0;
    const needsFreshWave = canvasCleared || (this.waveCooldown <= 0 && this.waves.length < MAX_WAVES && this.tips.length < effectiveSeeds * 2);
    const shouldSeedAuto = !isAudioQuiet && needsFreshWave;

    if (inp.seedTrigRising || shouldSeedAuto) {
      this.spawnWave(ef, effectiveSeeds, inp.aspect, randomness, baseCurl);
      const minInterval = Math.max(0.85, 2.2 / Math.max(0.25, baseSpeed + 0.35));
      this.waveCooldown = inp.seedTrigRising ? 0.22 : minInterval;
    }

    // 7. Dual Independent Removal Triggers (Auto Chase + Transient Prune can coexist cleanly)
    const autoDecayEnabled = ef.autoDecayEnabled !== false;
    const transientPruneEnabled = ef.transientPruneEnabled === true;
    const leadLen = Math.max(0.2, Math.min(10.0, ef.chaseLeadLength ?? 0.85));
    const decayRatio = Math.max(1.1, Math.min(3.0, ef.decaySpeedRatio ?? 1.65));
    const pruneThresh = ef.pruneThreshold ?? 0.65;

    let pruneFired = false;
    if (transientPruneEnabled && (t - this.lastPruneTime) > 0.22) {
      if (inp.pruneIn !== undefined) {
        if (inp.pruneIn > pruneThresh) {
          pruneFired = true;
        }
      } else if (inp.isAudioConnected && !isAudioQuiet) {
        if (hfFlux > Math.max(0.05, pruneThresh * 0.14)) {
          pruneFired = true;
        }
      }
    }

    if (pruneFired) {
      this.lastPruneTime = t;
      // Release the oldest mature waves (leaving very recent <0.25s waves intact so triggers & growth coexist)
      let released = 0;
      for (const w of this.waves) {
        if (!w.pruneErasing && w.age > 0.25 && w.maxArcDist > 0.08) {
          w.pruneErasing = true;
          released++;
          if (released >= 2) break;
        }
      }
    }

    // 8. Advance Active Growing Tips & Emitting Segments
    const activeCurvatureScale = baseCurl * (0.45 + 1.45 * this.heldPhraseCurl);
    this.lastLineWidth = lineWidth;
    const branchProbScale = inp.branchCv !== undefined
      ? Math.max(0, Math.min(1, inp.branchCv))
      : baseBranch;

    if (growthVel > 0.0005) {
      this.advanceTips(
        dt,
        growthVel,
        activeCurvatureScale,
        branchProbScale,
        branchTriggerHit,
        randomness,
        lineWidth,
        inp.aspect
      );
    }

    // 9. Advance Wave Lifecycles & Erosion Fronts (Chase faster than growth)
    const removalStyle = ef.removalStyle ?? 'chase';
    const minChaseRate = Math.max(0.22, baseSpeed * 0.55) * decayRatio;
    const activeGrowthForChase = Math.max(growthVel, minChaseRate * 0.4);

    for (const w of this.waves) {
      w.age += dt;
      if (autoDecayEnabled && !w.autoErasing) {
        const finishedHoldSec = Math.max(0.55, leadLen * 1.25);
        if (w.maxArcDist >= leadLen || (w.activeTips === 0 && w.age >= finishedHoldSec)) {
          w.autoErasing = true;
        }
      }

      if (w.autoErasing || w.pruneErasing) {
        const pruneBoost = w.pruneErasing ? 1.35 : 1.0;
        if (removalStyle === 'fade') {
          w.fadeAlpha = Math.max(0, w.fadeAlpha - dt * 0.42 * decayRatio * pruneBoost);
        } else if (removalStyle === 'retract') {
          if (w.retractMax > 1e5) {
            w.retractMax = w.maxArcDist;
          }
          const retractSpeed = Math.max(minChaseRate, activeGrowthForChase * decayRatio) * pruneBoost;
          w.retractMax = Math.max(0, w.retractMax - retractSpeed * dt);
        } else {
          // 'chase': Seed-to-tip dissolution outpaces tip growth cleanly
          const chaseSpeed = Math.max(minChaseRate, activeGrowthForChase * decayRatio) * pruneBoost;
          w.eraseDist += chaseSpeed * dt;
        }
      }
    }

    // 10. Cull Fully Dissolved Waves & Dead Segments
    const expiredWaveIds = new Set<number>();
    this.waves = this.waves.filter(w => {
      const doneChase = removalStyle === 'chase' && w.eraseDist >= w.maxArcDist + 0.05 && w.activeTips === 0;
      const doneFade = removalStyle === 'fade' && w.fadeAlpha <= 0.005;
      const doneRetract = removalStyle === 'retract' && w.retractMax <= 0.005 && (w.autoErasing || w.pruneErasing);
      if (doneChase || doneFade || doneRetract) {
        expiredWaveIds.add(w.id);
        return false;
      }
      return true;
    });

    if (expiredWaveIds.size > 0) {
      this.tips = this.tips.filter(tip => !expiredWaveIds.has(tip.waveId));
      this.segments = this.segments.filter(seg => !expiredWaveIds.has(seg.waveId));
    }

    // Also trim individual segments already passed cleanly by chase/retract wave fronts
    if (this.segments.length > 0) {
      const waveMap = new Map<number, ArabesqueWave>();
      for (const w of this.waves) waveMap.set(w.id, w);
      this.segments = this.segments.filter(seg => {
        const w = waveMap.get(seg.waveId);
        if (!w) return false;
        if (removalStyle === 'chase' && seg.arc1 <= w.eraseDist - 0.01) {
          return false;
        }
        if (removalStyle === 'retract' && w.retractMax < 1e5 && seg.arc0 >= w.retractMax + 0.01) {
          return false;
        }
        return true;
      });
    }
  }

  private spawnWave(
    ef: ArabesqueEffect,
    seedCount: number,
    aspect: number,
    randomness: number,
    baseCurl: number
  ): void {
    // Evict oldest wave if pool is at capacity
    if (this.waves.length >= MAX_WAVES) {
      const evicted = this.waves.shift()!;
      this.tips = this.tips.filter(t => t.waveId !== evicted.id);
      this.segments = this.segments.filter(s => s.waveId !== evicted.id);
    }

    const colorStep = Math.max(0.02, Math.min(0.6, ef.colorStep ?? 0.19));
    let waveColorT = this.nextPaletteT;
    if (ef.colorMode === 'spectral') {
      waveColorT = this.heldPhraseCurl;
    } else {
      this.nextPaletteT = (this.nextPaletteT + colorStep) % 1.0;
    }

    const wave: ArabesqueWave = {
      id: this.nextWaveId++,
      colorT: waveColorT,
      birthTime: 0,
      age: 0,
      autoErasing: false,
      pruneErasing: false,
      eraseDist: 0,
      retractMax: 1e6,
      fadeAlpha: 1.0,
      maxArcDist: 0,
      activeTips: 0,
      segmentCount: 0
    };
    this.waves.push(wave);

    const anchors = computeSeedAnchors(ef.arrangement ?? 'ring', seedCount, ef.spread ?? 0.55, aspect);
    const wavePolarity = (wave.id % 2 === 0 ? 1 : -1);

    for (let i = 0; i < anchors.length; i++) {
      if (this.tips.length >= MAX_ACTIVE_TIPS) break;
      const anc = anchors[i];
      const angJitter = randomness * (this.nextRand() - 0.5) * 0.55;
      const theta = anc.angle + angJitter;
      const seedColorT = ef.colorMode === 'seed'
        ? (anchors.length <= 1 ? 0.5 : i / (anchors.length - 1))
        : waveColorT;

      const polarity = randomness > 0.35 && this.nextRand() < randomness * 0.4
        ? -wavePolarity
        : (i % 2 === 0 ? wavePolarity : -wavePolarity);

      this.tips.push({
        waveId: wave.id,
        seedIndex: i,
        x: anc.x,
        y: anc.y,
        theta,
        nx: -Math.sin(theta),
        ny: Math.cos(theta),
        kappa: polarity * (0.35 + randomness * 0.5) * baseCurl,
        polarity,
        turnAccum: 0,
        maxTurn: Math.PI * (1.75 + randomness * 0.7),
        inflectionsLeft: 3,
        depth: 0,
        arcDist: 0,
        distSinceBranch: 0,
        distBudget: 0,
        paletteT: seedColorT,
        randSeed: this.nextRand(),
        isAtSeedStart: true,
        prevSegIdx: -1
      });
      wave.activeTips++;
    }
  }

  private advanceTips(
    dt: number,
    growthVel: number,
    curvatureScale: number,
    branchRate: number,
    branchTriggerHit: boolean,
    randomness: number,
    lineWidth: number,
    aspect: number
  ): void {
    const waveMap = new Map<number, ArabesqueWave>();
    for (const w of this.waves) {
      w.activeTips = 0;
      waveMap.set(w.id, w);
    }

    const nextTips: ArabesqueTip[] = [];
    const spawnQueue: ArabesqueTip[] = [];

    for (const tip of this.tips) {
      const wave = waveMap.get(tip.waveId);
      if (!wave) continue;

      const depthFactor = tip.depth === 0 ? 1.0 : tip.depth === 1 ? 0.85 : 0.7;
      tip.distBudget += growthVel * depthFactor * dt;

      let alive = true;
      let steps = 0;
      const maxStepsPerFrame = 32;

      while (tip.distBudget >= SEG_STEP && steps < maxStepsPerFrame && alive) {
        steps++;
        tip.distBudget -= SEG_STEP;

        // C1-smooth Euler curvature integration (gradual winding + organic variance)
        const organicDrift = randomness * Math.sin(tip.arcDist * 4.5 + tip.randSeed * 6.283) * 1.3;
        const spiralRate = (1.65 + tip.depth * 1.45 + organicDrift) * curvatureScale;
        tip.kappa += tip.polarity * spiralRate * SEG_STEP;
        // Clamp max curvature so volutes terminate neatly in legible open eyes rather than collapsing to blobs
        const maxKappa = (tip.depth === 0 ? 10.5 : 16.5) * Math.max(0.65, curvatureScale * 0.85);
        tip.kappa = Math.max(-maxKappa, Math.min(maxKappa, tip.kappa));

        const dTheta = tip.kappa * SEG_STEP;
        const theta0 = tip.theta;
        const theta1 = theta0 + dTheta;
        const midTheta = theta0 + dTheta * 0.5;

        const p0x = tip.x;
        const p0y = tip.y;
        const p1x = p0x + Math.cos(midTheta) * SEG_STEP;
        const p1y = p0y + Math.sin(midTheta) * SEG_STEP;

        const n0x = tip.nx;
        const n0y = tip.ny;
        const n1x = -Math.sin(theta1);
        const n1y = Math.cos(theta1);

        const arc0 = tip.arcDist;
        const arc1 = arc0 + SEG_STEP;
        tip.turnAccum += Math.abs(dTheta);
        tip.distSinceBranch += SEG_STEP;

        // Smooth calligraphic taper from root stem to scroll tip
        const progressNorm = Math.min(1.0, tip.turnAccum / Math.max(0.5, tip.maxTurn));
        const depthWidth = tip.depth === 0 ? 1.0 : tip.depth === 1 ? 0.68 : 0.46;
        const taper0 = 1.0 - Math.min(0.82, Math.pow(progressNorm, 1.35) * 0.82);
        const w0 = 0.0085 * lineWidth * depthWidth * taper0;
        const w1 = 0.0085 * lineWidth * depthWidth * Math.max(0.16, taper0 - 0.025);

        let flags = tip.isAtSeedStart ? FLAG_IS_SEED_START : 0;
        tip.isAtSeedStart = false;

        // S-curve inflection for primary vines so they sweep broadly before coiling
        if (tip.depth === 0 && tip.inflectionsLeft > 0 && tip.turnAccum >= Math.PI * (0.72 + randomness * 0.45)) {
          tip.inflectionsLeft--;
          // Fork a scroll volute continuing into the completed curve while main vine reverses into an S-curve
          if (branchRate > 0.08 && this.tips.length + spawnQueue.length < MAX_ACTIVE_TIPS) {
            flags |= FLAG_IS_FORK;
            spawnQueue.push(this.createChildTip(tip, theta1, tip.polarity, curvatureScale, randomness, 1));
          }
          tip.polarity = -tip.polarity;
          tip.kappa *= -0.18; // smooth inflection crossing
          tip.turnAccum = 0;
        } else if (tip.turnAccum >= tip.maxTurn && (tip.depth > 0 || tip.arcDist >= 0.35)) {
          flags |= FLAG_IS_TIP;
          alive = false;
        } else if (Math.abs(p1x) > aspect * 1.15 || Math.abs(p1y) > 1.15) {
          flags |= FLAG_IS_TIP;
          alive = false;
        }

        // Periodic + HF-transient branching on eligible primary & secondary stems
        const canBranchNow = tip.depth < 2 && tip.distSinceBranch > (0.14 - branchRate * 0.05) && alive;
        const periodicBranch = canBranchNow && branchRate > 0.18 && tip.distSinceBranch > (0.34 - branchRate * 0.16);
        if (canBranchNow && (branchTriggerHit || periodicBranch)) {
          if (this.tips.length + spawnQueue.length < MAX_ACTIVE_TIPS && this.nextRand() < (0.35 + branchRate * 0.65)) {
            const childPol = (randomness > 0.4 && this.nextRand() < randomness * 0.35) ? tip.polarity : -tip.polarity;
            const childDepth = tip.depth + 1;
            const forkAngle = theta1 + childPol * (0.14 + this.nextRand() * 0.16);
            spawnQueue.push(this.createChildTip(tip, forkAngle, childPol, curvatureScale, randomness, childDepth));
            flags |= FLAG_IS_FORK;
            tip.distSinceBranch = 0;
          }
        }

        this.pushSegment({
          waveId: tip.waveId,
          p0x,
          p0y,
          p1x,
          p1y,
          n0x,
          n0y,
          n1x,
          n1y,
          w0,
          w1,
          arc0,
          arc1,
          paletteT: tip.paletteT,
          depthNorm: tip.depth / 2.0,
          flags,
          curvature: tip.kappa,
          randSeed: tip.randSeed
        });

        tip.x = p1x;
        tip.y = p1y;
        tip.theta = theta1;
        tip.nx = n1x;
        tip.ny = n1y;
        tip.arcDist = arc1;
        wave.maxArcDist = Math.max(wave.maxArcDist, arc1);
        wave.segmentCount++;
      }

      if (alive) {
        nextTips.push(tip);
        wave.activeTips++;
      }
    }

    for (const child of spawnQueue) {
      if (nextTips.length >= MAX_ACTIVE_TIPS) break;
      const w = waveMap.get(child.waveId);
      if (w) {
        nextTips.push(child);
        w.activeTips++;
      }
    }

    this.tips = nextTips;
  }

  private createChildTip(
    parent: ArabesqueTip,
    angle: number,
    polarity: number,
    curvatureScale: number,
    randomness: number,
    depth: number
  ): ArabesqueTip {
    const r = this.nextRand();
    return {
      waveId: parent.waveId,
      seedIndex: parent.seedIndex,
      x: parent.x,
      y: parent.y,
      theta: angle,
      nx: -Math.sin(angle),
      ny: Math.cos(angle),
      kappa: polarity * (0.85 + r * 0.7) * curvatureScale,
      polarity,
      turnAccum: 0,
      maxTurn: Math.PI * (depth === 1 ? (1.9 + randomness * 0.85) : (1.55 + randomness * 0.65)),
      inflectionsLeft: 0,
      depth,
      arcDist: parent.arcDist,
      distSinceBranch: 0,
      distBudget: 0,
      paletteT: parent.paletteT,
      randSeed: r,
      isAtSeedStart: false,
      prevSegIdx: -1
    };
  }

  private pushSegment(seg: ArabesqueSegmentRecord): void {
    if (this.segments.length >= MAX_ARABESQUE_SEGMENTS) {
      // Trim oldest batch instead of O(N) single-element shifting every frame
      this.segments.splice(0, 256);
    }
    this.segments.push(seg);
  }

  /**
   * Serializes current committed segments plus smooth fractional live tip heads
   * into a flat Float32Array (20 floats per segment) for stutter-free 60fps growth.
   */
  public writeGpuBuffer(out: Float32Array, ef: ArabesqueEffect): number {
    const waveMap = new Map<number, ArabesqueWave>();
    for (const w of this.waves) waveMap.set(w.id, w);

    const removalStyle = ef.removalStyle ?? 'chase';
    const maxCapacity = Math.floor(out.length / ARABESQUE_SEGMENT_FLOATS);
    const liveHeadReserve = Math.min(this.tips.length, maxCapacity);
    const maxCommitted = Math.min(this.segments.length, Math.max(0, maxCapacity - liveHeadReserve));

    for (let i = 0; i < maxCommitted; i++) {
      const s = this.segments[i];
      const w = waveMap.get(s.waveId);
      const eraseDist = removalStyle === 'chase' && w ? w.eraseDist : -1.0;
      const retractMax = removalStyle === 'retract' && w ? w.retractMax : 1e6;
      const fadeAlpha = w ? w.fadeAlpha : 1.0;

      const base = i * ARABESQUE_SEGMENT_FLOATS;
      out[base + 0] = s.p0x;
      out[base + 1] = s.p0y;
      out[base + 2] = s.p1x;
      out[base + 3] = s.p1y;
      out[base + 4] = s.n0x;
      out[base + 5] = s.n0y;
      out[base + 6] = s.n1x;
      out[base + 7] = s.n1y;
      out[base + 8] = s.w0;
      out[base + 9] = s.w1;
      out[base + 10] = s.arc0;
      out[base + 11] = s.arc1;
      out[base + 12] = eraseDist;
      out[base + 13] = retractMax;
      out[base + 14] = s.paletteT;
      out[base + 15] = fadeAlpha;
      out[base + 16] = s.depthNorm;
      out[base + 17] = s.flags;
      out[base + 18] = s.curvature;
      out[base + 19] = s.randSeed;
    }

    let count = maxCommitted;
    for (const tip of this.tips) {
      if (count >= maxCapacity) break;
      const partLen = Math.min(SEG_STEP, tip.distBudget);
      if (partLen < 0.0006) continue;
      const w = waveMap.get(tip.waveId);
      if (!w) continue;

      const dTheta = tip.kappa * partLen;
      const theta1 = tip.theta + dTheta;
      const midTheta = tip.theta + dTheta * 0.5;
      const p1x = tip.x + Math.cos(midTheta) * partLen;
      const p1y = tip.y + Math.sin(midTheta) * partLen;
      const n1x = -Math.sin(theta1);
      const n1y = Math.cos(theta1);

      const progressNorm = Math.min(1.0, tip.turnAccum / Math.max(0.5, tip.maxTurn));
      const depthWidth = tip.depth === 0 ? 1.0 : tip.depth === 1 ? 0.68 : 0.46;
      const taper0 = 1.0 - Math.min(0.82, Math.pow(progressNorm, 1.35) * 0.82);
      const w0 = 0.0085 * this.lastLineWidth * depthWidth * taper0;
      const w1 = 0.0085 * this.lastLineWidth * depthWidth * Math.max(0.16, taper0 - 0.025 * (partLen / SEG_STEP));

      const eraseDist = removalStyle === 'chase' ? w.eraseDist : -1.0;
      const retractMax = removalStyle === 'retract' ? w.retractMax : 1e6;

      const base = count * ARABESQUE_SEGMENT_FLOATS;
      out[base + 0] = tip.x;
      out[base + 1] = tip.y;
      out[base + 2] = p1x;
      out[base + 3] = p1y;
      out[base + 4] = tip.nx;
      out[base + 5] = tip.ny;
      out[base + 6] = n1x;
      out[base + 7] = n1y;
      out[base + 8] = w0;
      out[base + 9] = w1;
      out[base + 10] = tip.arcDist;
      out[base + 11] = tip.arcDist + partLen;
      out[base + 12] = eraseDist;
      out[base + 13] = retractMax;
      out[base + 14] = tip.paletteT;
      out[base + 15] = w.fadeAlpha;
      out[base + 16] = tip.depth / 2.0;
      out[base + 17] = (tip.isAtSeedStart ? FLAG_IS_SEED_START : 0) | FLAG_LIVE_HEAD;
      out[base + 18] = tip.kappa;
      out[base + 19] = tip.randSeed;
      count++;
    }

    return count;
  }
}

