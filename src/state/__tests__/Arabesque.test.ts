import { describe, it, expect } from 'vitest';
import { createDefaultEffect } from '../moduleFactory';
import { ALL_MODULES, DEFAULT_BANK_CONFIG } from '../../components/ModuleCatalog/moduleRegistry';
import { PORT_DEFS, MODULE_DISPLAY_NAMES } from '../../components/NodeGraph/portDefs';
import { ArabesqueRenderWGSL } from '../../renderer/shaders/Arabesque';
import {
  ArabesqueSimulation,
  ARABESQUE_SEGMENT_FLOATS
} from '../../renderer/ArabesqueSimulation';
import {
  computeSeedAnchors,
  resolveArabesqueCurlBandHz,
  ARABESQUE_CURL_BAND_RANGES
} from '../../utils/arabesqueUtils';
import { AudioEngine } from '../AudioEngine';
import { ArabesqueEffect } from '../types';

describe('Arabesque (Audio-Reactive Filigree & Scrollwork) Module', () => {
  it('creates default Arabesque effect with expected parameters', () => {
    const ab = createDefaultEffect('Arabesque', 'ab_test') as ArabesqueEffect;
    expect(ab).toBeDefined();
    expect(ab.id).toBe('ab_test');
    expect(ab.type).toBe('Arabesque');
    expect(ab.seedCount).toBe(4);
    expect(ab.arrangement).toBe('ring');
    expect(ab.growthSpeed).toBe(0.28);
    expect(ab.bassSurgeGain).toBe(1.2);
    expect(ab.bpmCoupling).toBe(true);
    expect(ab.curlBandPreset).toBe('full_mid');
    expect(ab.ornateTips).toBe(true);
    expect(ab.colorMode).toBe('wave');
    expect(ab.colorPreset).toBe('gold_leaf');
    expect(ab.removalStyle).toBe('chase');
    expect(ab.autoDecayEnabled).toBe(true);
    expect(ab.transientPruneEnabled).toBe(false);
    expect(ab.decaySpeedRatio).toBe(1.65);
  });

  it('registers in module catalog, default Effects loadout, portDefs, and WGSL shader', () => {
    const entry = ALL_MODULES.find(m => m.id === 'Arabesque');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Effects');
    expect(entry?.label).toBe('Arabesque');
    expect(entry?.moduleType).toBe('effect:Arabesque');
    expect(DEFAULT_BANK_CONFIG.Effects.order).toContain('Arabesque');

    const ports = PORT_DEFS.Arabesque;
    expect(ports).toBeDefined();
    expect(ports.length).toBe(10);
    expect(ports.find(p => p.id === 'video_out')?.direction).toBe('out');
    expect(ports.find(p => p.id === 'audio_in')?.signalType).toBe('audio');
    expect(ports.find(p => p.id === 'growth_cv')?.signalType).toBe('modulation');
    expect(ports.find(p => p.id === 'curl_cv')?.signalType).toBe('modulation');
    expect(ports.find(p => p.id === 'branch_cv')?.signalType).toBe('modulation');
    expect(ports.find(p => p.id === 'width_cv')?.signalType).toBe('modulation');
    expect(ports.find(p => p.id === 'seeds_cv')?.signalType).toBe('modulation');
    expect(ports.find(p => p.id === 'prune_in')?.signalType).toBe('modulation');
    expect(ports.find(p => p.id === 'seed_trig')?.signalType).toBe('trigger');
    expect(ports.find(p => p.id === 'palette_in')?.signalType).toBe('palette');
    expect(MODULE_DISPLAY_NAMES.Arabesque).toBe('Arabesque');

    expect(ArabesqueRenderWGSL).toContain('struct ArabesqueSegment');
    expect(ArabesqueRenderWGSL).toContain('fn vs_main');
    expect(ArabesqueRenderWGSL).toContain('fn fs_main');
    expect(ArabesqueRenderWGSL).toContain('ornateTips');
    expect(ArabesqueRenderWGSL).toContain('sampleCustomPalette');
  });

  it('computes 1..8 seed anchors cleanly across arrangements and curl band presets', () => {
    for (const arr of ['center', 'ring', 'horizontal', 'vertical', 'corners', 'diagonal'] as const) {
      const anchors = computeSeedAnchors(arr, 6, 0.6, 1.77);
      expect(anchors.length).toBe(6);
      for (const a of anchors) {
        expect(Number.isFinite(a.x)).toBe(true);
        expect(Number.isFinite(a.y)).toBe(true);
        expect(Number.isFinite(a.angle)).toBe(true);
      }
    }

    const altoUp = resolveArabesqueCurlBandHz('alto', 0.5);
    expect(altoUp.minHz).toBe(Math.round(ARABESQUE_CURL_BAND_RANGES.alto.minHz * Math.SQRT2));
    expect(altoUp.maxHz).toBe(Math.round(ARABESQUE_CURL_BAND_RANGES.alto.maxHz * Math.SQRT2));
  });

  it('AudioEngine estimates BPM from periodic kick flux and computes log-weighted band centroid', () => {
    const bus: any = {
      id: 'bpm_test',
      rms: 0.25,
      peak: 0.6,
      fft: new Float32Array(512).fill(-100),
      waveform: new Float32Array(1024),
      bands: { bass: 0.05, mid: 0.1, high: 0.05, low: 0.05, lowMid: 0.05, midGranular: 0.05, highMid: 0.05, highGranular: 0.05 },
      onset: false,
      bpm: 120,
      confidence: 0
    };

    const mockEngine: any = {
      buses: new Map([['bpm_test', bus]]),
      tempoTrackers: new WeakMap(),
      fftSize: 1024,
      getSampleRate: () => 48000
    };

    // Simulate 140 BPM pulse train (beat every ~0.4286s) over 5 seconds at 60fps
    const beatPeriod = 60 / 140;
    for (let frame = 0; frame < 300; frame++) {
      const t = frame / 60;
      const phase = (t % beatPeriod) / beatPeriod;
      const hit = phase < 0.08 ? 0.75 : 0.05;
      bus.bands.bass = hit;
      bus.bands.low = hit;
      AudioEngine.prototype.updateTempoEstimate.call(mockEngine, bus, t);
    }

    expect(bus.confidence).toBeGreaterThan(0.35);
    expect(bus.bpm).toBeGreaterThan(130);
    expect(bus.bpm).toBeLessThan(150);

    // Check band spectral centroid shifts higher when upper frequencies dominate
    const binHz = 48000 / 1024;
    bus.fft.fill(-100);
    for (let i = 0; i < bus.fft.length; i++) {
      const hz = i * binHz;
      if (hz >= 140 && hz <= 220) bus.fft[i] = -18;
    }
    const lowCentroid = AudioEngine.prototype.getBandSpectralCentroidHz.call(mockEngine, 'bpm_test', 130, 1750);

    bus.fft.fill(-100);
    for (let i = 0; i < bus.fft.length; i++) {
      const hz = i * binHz;
      if (hz >= 1200 && hz <= 1650) bus.fft[i] = -18;
    }
    const highCentroid = AudioEngine.prototype.getBandSpectralCentroidHz.call(mockEngine, 'bpm_test', 130, 1750);

    expect(lowCentroid.energy).toBeGreaterThan(0.4);
    expect(highCentroid.energy).toBeGreaterThan(0.4);
    expect(highCentroid.centroidNorm).toBeGreaterThan(lowCentroid.centroidNorm + 0.45);
  });

  it('grows autonomously when unpatched with shared-wave colors, pauses on silent connected audio, and steeply eases down bass surges', () => {
    const ab = createDefaultEffect('Arabesque', 'ab1') as ArabesqueEffect;
    ab.growthSpeed = 0.6;
    const sim = new ArabesqueSimulation();

    // Unpatched autonomous frames generate contiguous segments
    for (let i = 0; i < 40; i++) {
      sim.step(ab, {
        dt: 1 / 60,
        timeSec: i / 60,
        aspect: 1.77,
        isAudioConnected: false,
        audioRms: 0,
        bpm: 120,
        bpmConfidence: 0,
        bassEnergy: 0,
        melodicCentroid: 0.5,
        melodicEnergy: 0,
        hfEnergy: 0
      });
    }
    expect(sim.waves.length).toBeGreaterThanOrEqual(1);
    expect(sim.segments.length).toBeGreaterThan(0);

    // All segments belonging to the same synchronized wave share paletteT
    const wave1Id = sim.waves[0].id;
    const wave1Colors = new Set(sim.segments.filter(s => s.waveId === wave1Id).map(s => s.paletteT));
    expect(wave1Colors.size).toBe(1);

    // Silent connected audio freezes growth without sprouting new shoots or changing held curl
    const segCountBeforeSilence = sim.segments.length;
    const heldCurlBeforeSilence = sim.getHeldPhraseCurl();
    for (let i = 0; i < 30; i++) {
      sim.step(ab, {
        dt: 1 / 60,
        timeSec: 1.0 + i / 60,
        aspect: 1.77,
        isAudioConnected: true,
        audioRms: 0.002,
        bpm: 120,
        bpmConfidence: 0,
        bassEnergy: 0.001,
        melodicCentroid: 0.99,
        melodicEnergy: 0.001,
        hfEnergy: 0
      });
    }
    expect(sim.segments.length).toBe(segCountBeforeSilence);
    expect(sim.getHeldPhraseCurl()).toBeCloseTo(heldCurlBeforeSilence, 5);

    // Bass surge spikes high on hit, then steeply eases down within ~250ms
    sim.step(ab, {
      dt: 1 / 60,
      timeSec: 2.0,
      aspect: 1.77,
      isAudioConnected: true,
      audioRms: 0.4,
      bpm: 128,
      bpmConfidence: 0.9,
      bassEnergy: 0.75,
      melodicCentroid: 0.6,
      melodicEnergy: 0.3,
      hfEnergy: 0.1
    });
    const peakSurge = sim.getSurgeEnvelope();
    expect(peakSurge).toBeGreaterThan(0.5);

    for (let i = 1; i <= 15; i++) {
      sim.step(ab, {
        dt: 1 / 60,
        timeSec: 2.0 + i / 60,
        aspect: 1.77,
        isAudioConnected: true,
        audioRms: 0.15,
        bpm: 128,
        bpmConfidence: 0.9,
        bassEnergy: 0.1,
        melodicCentroid: 0.6,
        melodicEnergy: 0.2,
        hfEnergy: 0.1
      });
    }
    expect(sim.getSurgeEnvelope()).toBeLessThan(peakSurge * 0.15);
  });

  it('supports auto-chase and transient-prune simultaneously without overriding each other, and packs GPU floats cleanly', () => {
    const ab = createDefaultEffect('Arabesque', 'ab_dual') as ArabesqueEffect;
    ab.growthSpeed = 1.2;
    ab.autoDecayEnabled = true;
    ab.transientPruneEnabled = true;
    ab.chaseLeadLength = 0.45;
    ab.pruneThreshold = 0.5;
    ab.decaySpeedRatio = 1.8;

    const sim = new ArabesqueSimulation();

    // Advance autonomous growth past 0.4s so wave 1 exists and matures
    for (let i = 0; i < 35; i++) {
      sim.step(ab, {
        dt: 1 / 60,
        timeSec: i / 60,
        aspect: 1.77,
        isAudioConnected: false,
        audioRms: 0,
        bpm: 120,
        bpmConfidence: 0,
        bassEnergy: 0,
        melodicCentroid: 0.5,
        melodicEnergy: 0,
        hfEnergy: 0
      });
    }
    expect(sim.waves.length).toBeGreaterThan(0);

    // Fire transient prune via CV while autoDecayEnabled is ALSO true
    sim.step(ab, {
      dt: 1 / 60,
      timeSec: 0.65,
      aspect: 1.77,
      isAudioConnected: false,
      audioRms: 0,
      bpm: 120,
      bpmConfidence: 0,
      bassEnergy: 0,
      melodicCentroid: 0.5,
      melodicEnergy: 0,
      hfEnergy: 0,
      pruneIn: 0.9
    });

    const firstWave = sim.waves[0];
    expect(firstWave.pruneErasing).toBe(true);
    expect(firstWave.eraseDist).toBeGreaterThan(0);

    // Verify GPU float packing format matches WGSL struct stride
    const outBuf = new Float32Array(256 * ARABESQUE_SEGMENT_FLOATS);
    const written = sim.writeGpuBuffer(outBuf, ab);
    expect(written).toBeGreaterThan(0);
    expect(Number.isFinite(outBuf[0])).toBe(true);
    expect(outBuf[12]).toBeCloseTo(firstWave.eraseDist, 4);
  });

  it('respawns immediately on cleared canvas, emits smooth sub-step tips at low speed, and keeps growing past 4 waves with decay disabled', () => {
    const ab = createDefaultEffect('Arabesque', 'ab_no_decay') as ArabesqueEffect;
    ab.growthSpeed = 0.08; // Very slow baseline (~0.027 units/s)
    ab.autoDecayEnabled = false;
    ab.transientPruneEnabled = false;
    const sim = new ArabesqueSimulation();

    // Frame 1 with active audio spawns wave immediately, and emits fractional live tip in buffer
    for (let i = 0; i < 3; i++) {
      sim.step(ab, {
        dt: 1 / 60,
        timeSec: i / 60,
        aspect: 1.77,
        isAudioConnected: true,
        audioRms: 0.12,
        bpm: 120,
        bpmConfidence: 0.8,
        bassEnergy: 0.1,
        melodicCentroid: 0.5,
        melodicEnergy: 0.2,
        hfEnergy: 0.05
      });
    }
    const gpuOut = new Float32Array(2048 * ARABESQUE_SEGMENT_FLOATS);
    const liveCount = sim.writeGpuBuffer(gpuOut, ab);
    expect(liveCount).toBeGreaterThan(0);

    // Clear simulation cleanly & pause audio, then resume -> should respawn immediately on frame 1
    sim.waves = [];
    sim.tips = [];
    sim.segments = [];
    sim.step(ab, {
      dt: 1 / 60,
      timeSec: 5.0,
      aspect: 1.77,
      isAudioConnected: true,
      audioRms: 0.002,
      bpm: 120,
      bpmConfidence: 0,
      bassEnergy: 0.001,
      melodicCentroid: 0.5,
      melodicEnergy: 0.001,
      hfEnergy: 0
    });
    expect(sim.waves.length).toBe(0);

    sim.step(ab, {
      dt: 1 / 60,
      timeSec: 5.1,
      aspect: 1.77,
      isAudioConnected: true,
      audioRms: 0.15,
      bpm: 120,
      bpmConfidence: 0.8,
      bassEnergy: 0.1,
      melodicCentroid: 0.5,
      melodicEnergy: 0.15,
      hfEnergy: 0.05
    });
    expect(sim.waves.length).toBe(1);

    // Verify waves can continue spawning past 4 when removal is off
    ab.growthSpeed = 2.0;
    ab.curlAmount = 2.0;
    for (let i = 0; i < 600; i++) {
      sim.step(ab, {
        dt: 1 / 30,
        timeSec: 6.0 + i / 30,
        aspect: 1.77,
        isAudioConnected: false,
        audioRms: 0,
        bpm: 120,
        bpmConfidence: 0,
        bassEnergy: 0,
        melodicCentroid: 0.5,
        melodicEnergy: 0,
        hfEnergy: 0
      });
    }
    expect(sim.waves.length).toBeGreaterThan(4);
  });

  it('respects extended chaseLeadLength up to 10.0 before starting auto seed-chase turnover', () => {
    const ab = createDefaultEffect('Arabesque', 'ab_long_lead') as ArabesqueEffect;
    ab.growthSpeed = 2.0;
    ab.autoDecayEnabled = true;
    ab.chaseLeadLength = 10.0;
    const sim = new ArabesqueSimulation();

    for (let i = 0; i < 60; i++) {
      sim.step(ab, {
        dt: 1 / 30,
        timeSec: i / 30,
        aspect: 1.77,
        isAudioConnected: false,
        audioRms: 0,
        bpm: 120,
        bpmConfidence: 0,
        bassEnergy: 0,
        melodicCentroid: 0.5,
        melodicEnergy: 0,
        hfEnergy: 0
      });
    }

    expect(sim.waves.length).toBeGreaterThan(0);
    expect(sim.waves[0].autoErasing).toBe(false);
  });
});

