import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEngineStore } from '../store';
import { SensorEngine } from '../../sensor/SensorEngine';
import { SignalDispatcher } from '../SignalDispatcher';
import { createDefaultEffect } from '../moduleFactory';
import { LayerState, OpticalSensorEffect, SensorZoneConfig } from '../types';

vi.mock('../AudioEngine', () => ({
  AudioEngine: {
    getInstance: () => ({
      context: { currentTime: 0 },
      resume: vi.fn(),
      registerMediaElement: vi.fn(),
      registerStream: vi.fn(),
      unregisterMediaElement: vi.fn(),
      setModuleMute: vi.fn(),
      setLayerMute: vi.fn(),
      setMasterMute: vi.fn(),
      setLayerAudioTarget: vi.fn(),
      connectTransformer: vi.fn(),
      connectModulator: vi.fn(),
      disconnectNode: vi.fn(),
      updateTransformerNode: vi.fn(),
      updateModulatorNode: vi.fn(),
      getTransformerBus: vi.fn(),
      getTransformerOutput: vi.fn(),
      getBusData: vi.fn(),
      getAllBuses: vi.fn(() => []),
      getPeakVolume: vi.fn(() => 0.5),
      update: vi.fn()
    })
  }
}));

describe('Sensor System', () => {
  beforeEach(() => {
    useEngineStore.setState({
      sensorSystem: {
        deviceId: '',
        enabled: true,
        sensors: []
      }
    });
  });

  describe('Store Actions', () => {
    it('initializes with default state', () => {
      const state = useEngineStore.getState();
      expect(state.sensorSystem).toBeDefined();
      expect(state.sensorSystem?.deviceId).toBe('');
      expect(state.sensorSystem?.enabled).toBe(true);
      expect(state.sensorSystem?.sensors).toEqual([]);
    });

    it('sets device id and enabled toggle', () => {
      useEngineStore.getState().setSensorSystemDevice('cam_xyz');
      expect(useEngineStore.getState().sensorSystem?.deviceId).toBe('cam_xyz');

      useEngineStore.getState().setSensorSystemEnabled(false);
      expect(useEngineStore.getState().sensorSystem?.enabled).toBe(false);
    });

    it('adds, updates, reorders, and removes sensor zones', () => {
      const zone1: SensorZoneConfig = {
        id: 'zone_1',
        name: 'Zone A',
        type: 'rect',
        algorithm: 'motion',
        color: '#00e5ff',
        enabled: true,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        sensitivity: 0.5,
        threshold: 0.3,
        smoothing: 0.2
      };

      const zone2: SensorZoneConfig = {
        id: 'zone_2',
        name: 'Line B',
        type: 'line',
        algorithm: 'motion',
        color: '#ff007f',
        enabled: true,
        x1: 0.2,
        y1: 0.5,
        x2: 0.8,
        y2: 0.5,
        sensitivity: 0.6,
        threshold: 0.25,
        smoothing: 0.1,
        lineDirection: 'a_to_b'
      };

      useEngineStore.getState().addSensorZone(zone1);
      useEngineStore.getState().addSensorZone(zone2);

      let sensors = useEngineStore.getState().sensorSystem?.sensors || [];
      expect(sensors.length).toBe(2);
      expect(sensors[0].name).toBe('Zone A');
      expect(sensors[1].name).toBe('Line B');

      // Update
      useEngineStore.getState().updateSensorZone('zone_1', { name: 'Front Stage', sensitivity: 0.8 });
      sensors = useEngineStore.getState().sensorSystem?.sensors || [];
      expect(sensors[0].name).toBe('Front Stage');
      expect(sensors[0].sensitivity).toBe(0.8);

      // Reorder
      useEngineStore.getState().reorderSensorZones(0, 1);
      sensors = useEngineStore.getState().sensorSystem?.sensors || [];
      expect(sensors[0].id).toBe('zone_2');
      expect(sensors[1].id).toBe('zone_1');

      // Remove
      useEngineStore.getState().removeSensorZone('zone_2');
      sensors = useEngineStore.getState().sensorSystem?.sensors || [];
      expect(sensors.length).toBe(1);
      expect(sensors[0].id).toBe('zone_1');
    });
  });

  describe('Module Factory & Dispatcher Integration', () => {
    it('creates default OpticalSensor effect node', () => {
      const node = createDefaultEffect('OpticalSensor', 'opt_1') as OpticalSensorEffect;
      expect(node.type).toBe('OpticalSensor');
      expect(node.id).toBe('opt_1');
      expect(node.gain).toBe(1.0);
      expect(node.threshold).toBe(0.3);
    });

    it('dispatches optical sensor signals to node graph ports', () => {
      const engine = SensorEngine.getInstance();
      const allSignals = engine.getAllSignals();

      // Mock sensor engine output for zone_motion
      allSignals.set('zone_motion', {
        motion: 0.7,
        rawMotion: 0.75,
        gate: 1.0,
        trig: 1.0,
        r: 0.8,
        g: 0.4,
        b: 0.2,
        hue: 0.05,
        sat: 0.75,
        luma: 0.5,
      });

      const optNode: OpticalSensorEffect = {
        id: 'opt_node',
        type: 'OpticalSensor',
        sensorId: 'zone_motion',
        gain: 1.2,
        threshold: 0.4
      };

      const testLayer: LayerState = {
        id: 'layer_test',
        name: 'Test Layer',
        source: { type: 'None' } as any,
        effects: [optNode],
        modulators: {},
        opacity: 1.0,
        blendMode: 'normal',
        graph: { edges: [] },
        signalValues: {}
      };

      useEngineStore.setState({
        layers: {
          'layer_test': testLayer
        },
        layerOrder: ['layer_test'],
        activeLayerId: 'layer_test'
      });

      const dispatcher = SignalDispatcher.getInstance();
      dispatcher.compileLayer(testLayer);
      dispatcher.execute(true);

      const sigs = dispatcher.getLatestSignals('layer_test');
      expect(sigs['opt_node.motion_out']).toBeCloseTo(0.84, 2); // 0.7 * 1.2
      expect(sigs['opt_node.gate_out']).toBe(1.0);
      expect(sigs['opt_node.trig_out']).toBe(1.0);
      expect(sigs['opt_node.r_out']).toBe(0.8);
      expect(sigs['opt_node.g_out']).toBe(0.4);
      expect(sigs['opt_node.b_out']).toBe(0.2);
      expect(sigs['opt_node.hue_cv']).toBe(0.05);
      expect(sigs['opt_node.sat_cv']).toBe(0.75);
      expect(sigs['opt_node.luma_cv']).toBe(0.5);
      expect(sigs['opt_node.palette_out']).toBe(1.0);
    });
  });

  describe('Sensor Analysis Algorithms', () => {
    it('processes motion differencing and chrominance averaging on frames', () => {
      const engine = SensorEngine.getInstance();
      const state = useEngineStore.getState();

      const rectZone: SensorZoneConfig = {
        id: 'rect_test',
        name: 'Rect Zone',
        type: 'rect',
        algorithm: 'chrominance',
        color: '#ffe600',
        enabled: true,
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 1.0,
        sensitivity: 0.5,
        threshold: 0.2,
        smoothing: 0.0
      };

      state.addSensorZone(rectZone);

      const w = 320;
      const h = 180;
      const totalPixels = w * h;
      const curr = new Uint8ClampedArray(totalPixels * 4);
      const prev = new Uint8ClampedArray(totalPixels * 4);

      // Fill current with bright yellow (R=255, G=230, B=0) and prev with black
      for (let i = 0; i < totalPixels * 4; i += 4) {
        curr[i] = 255;
        curr[i + 1] = 230;
        curr[i + 2] = 0;
        curr[i + 3] = 255;
      }

      const out = {
        motion: 0,
        rawMotion: 0,
        gate: 0,
        trig: 0,
        r: 0,
        g: 0,
        b: 0,
        hue: 0,
        sat: 0,
        luma: 0
      };

      (engine as any).processRectSensor(rectZone, curr, prev, w, h, out, performance.now());

      expect(out.r).toBeCloseTo(1.0, 2);
      expect(out.g).toBeCloseTo(0.9, 1);
      expect(out.b).toBe(0.0);
      expect(out.luma).toBeGreaterThan(0.5);
      expect(out.gate).toBe(1.0); // luma >= 0.2 threshold
      expect(out.motion).toBeGreaterThan(0.5); // diff from black
    });

    it('detects directional line crossing', () => {
      const engine = SensorEngine.getInstance();
      const lineZone: SensorZoneConfig = {
        id: 'line_dir_test',
        name: 'Tripwire',
        type: 'line',
        algorithm: 'motion',
        color: '#00e5ff',
        enabled: true,
        x1: 0.1,
        y1: 0.5,
        x2: 0.9,
        y2: 0.5,
        sensitivity: 0.5,
        threshold: 0.2,
        smoothing: 0.0,
        lineDirection: 'a_to_b'
      };

      const w = 320;
      const h = 180;
      const totalPixels = w * h;
      const curr = new Uint8ClampedArray(totalPixels * 4);
      const prev = new Uint8ClampedArray(totalPixels * 4);

      const out = {
        motion: 0,
        rawMotion: 0,
        gate: 0,
        trig: 0,
        r: 0,
        g: 0,
        b: 0,
        hue: 0,
        sat: 0,
        luma: 0
      };

      // Mock tracker state with strip A crossed first then B
      (engine as any).lineTrackers.set('line_dir_test', {
        sideAActive: true,
        sideBActive: false,
        timeA: 1000,
        timeB: 0,
        lastCrossTime: 0
      });

      // Now B activates at 1100 (deltaT = +100ms > 0, matching a_to_b)
      // Fill pixels along strip A and B with high motion
      for (let i = 0; i < totalPixels * 4; i += 4) {
        curr[i] = 255;
        curr[i + 1] = 255;
        curr[i + 2] = 255;
        curr[i + 3] = 255;
      }

      (engine as any).processLineSensor(lineZone, curr, prev, w, h, out, 1100);

      expect(out.gate).toBe(1.0);
      expect(out.trig).toBe(1.0);
    });
  });
});
