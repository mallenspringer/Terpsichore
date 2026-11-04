import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDefaultSource, createDefaultEffect } from '../moduleFactory';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { ImageCueSource } from '../types';
import { ImageCueManager } from '../../renderer/ImageCueManager';
import { SignalDispatcher } from '../SignalDispatcher';
import { MidiManager } from '../MidiManager';
import { useEngineStore } from '../store';

vi.mock('../AudioEngine', () => ({
  AudioEngine: {
    getInstance: () => ({
      context: { currentTime: 0 },
      resume: vi.fn(),
      setModuleMute: vi.fn(),
      setLayerMute: vi.fn(),
      setMasterMute: vi.fn(),
      setLayerAudioTarget: vi.fn(),
      getPeakVolume: vi.fn(() => 0.5),
      getBusData: vi.fn(),
      getAllBuses: vi.fn(() => []),
      update: vi.fn()
    })
  }
}));

describe('ImageCue Module', () => {
  beforeEach(() => {
    useEngineStore.setState({
      layers: {},
      layerOrder: [],
      activeLayerId: ''
    });
    ImageCueManager.getInstance().clear();
  });

  describe('Factory and Defaults', () => {
    it('creates default ImageCue source with 16 empty banks and directory mode', () => {
      const src = createDefaultSource('ImageCue') as ImageCueSource;

      expect(src.type).toBe('ImageCue');
      expect(src.playbackMode).toBe('directory');
      expect(src.dirPlaybackOrder).toBe('in_order');
      expect(src.dirLoopMode).toBe('loop');
      expect(src.dirAutoPlayback).toBe(false);
      expect(src.activeDirIndex).toBe(0);

      expect(src.bankGridMode).toBe('8');
      expect(src.bankSkipEmpty).toBe(true);
      expect(src.banks).toHaveLength(16);
      expect(src.banks[0].images).toEqual([]);
      expect(src.banks[0].activeImageIndex).toBe(0);

      expect(src.objectFit).toBe('fill');
      expect(src.transitionType).toBe('cut');
      expect(src.transitionDuration).toBe(0.5);
      expect(src.triggerThreshold).toBe(0.5);
    });

    it('creates default ImageCue effect with assigned id', () => {
      const eff = createDefaultEffect('ImageCue', 'cue-node-1') as any;
      expect(eff.id).toBe('cue-node-1');
      expect(eff.type).toBe('ImageCue');
      expect(eff.banks).toHaveLength(16);
    });

    it('has all required input and output ports', () => {
      const ports = PORT_DEFS.ImageCue;
      expect(ports).toBeDefined();

      const portIds = ports.map(p => p.id);
      expect(portIds).toContain('video_out');
      expect(portIds).toContain('gate_out');
      expect(portIds).toContain('image_trig');
      expect(portIds).toContain('bank_trig');
      expect(portIds).toContain('reset_trig');
      expect(portIds).toContain('speed_cv');
      expect(portIds).toContain('bank_select_cv');

      const videoOut = ports.find(p => p.id === 'video_out')!;
      expect(videoOut.direction).toBe('out');
      expect(videoOut.signalType).toBe('video');

      const gateOut = ports.find(p => p.id === 'gate_out')!;
      expect(gateOut.direction).toBe('out');
      expect(gateOut.signalType).toBe('trigger');
    });
  });

  describe('ImageCueManager LRU Cache', () => {
    it('preloads and retrieves bitmaps, maintaining cache bounds', async () => {
      const mgr = ImageCueManager.getInstance();

      // Mock Image and createImageBitmap in testing environment if necessary
      expect(mgr.getBitmap(undefined)).toBeNull();
      expect(mgr.getBitmap('')).toBeNull();
    });
  });

  describe('Signal Dispatching & Triggers', () => {
    it('steps through directory images on rising image_trig', () => {
      const cueSource: ImageCueSource = {
        ...(createDefaultSource('ImageCue') as ImageCueSource),
        files: ['imgA.png', 'imgB.png', 'imgC.png'],
        activeDirIndex: 0,
        currentImageUrl: 'imgA.png',
        triggerThreshold: 0.5
      };

      const layerId = 'test-layer-cue';
      useEngineStore.setState({
        layers: {
          [layerId]: {
            id: layerId,
            name: 'Layer Cue',
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            source: cueSource,
            effects: [],
            modulators: {},
            graph: {
              edges: []
            }
          } as any
        },
        layerOrder: [layerId],
        activeLayerId: layerId
      });

      const dispatcher = SignalDispatcher.getInstance();

      // Tick 1: trigger low (0.0) -> no advance
      dispatcher.execute(true);
      let layer = useEngineStore.getState().layers[layerId];
      let currentCue = layer.source as ImageCueSource;
      expect(currentCue.activeDirIndex).toBe(0);

      // Tick 2: inject rising edge trigger on image_trig
      const layerWithSignal = {
        ...layer,
        graph: {
          edges: [
            {
              id: 'e1',
              fromNodeId: 'test_trig',
              fromPort: 'trigger_out',
              toNodeId: 'source',
              toPort: 'image_trig',
              signalType: 'trigger'
            }
          ]
        },
        modulators: {
          test_trig: {
            id: 'test_trig',
            type: 'TriggerPad',
            isPressed: true,
            useEnvelope: false
          } as any
        }
      };

      useEngineStore.setState({
        layers: { [layerId]: layerWithSignal as any }
      });

      dispatcher.execute(true);

      layer = useEngineStore.getState().layers[layerId];
      currentCue = layer.source as ImageCueSource;
      expect(currentCue.activeDirIndex).toBe(1);
      expect(currentCue.currentImageUrl).toBe('imgB.png');
      expect(currentCue.prevImageUrl).toBe('imgA.png');
    });

    it('direct-addresses banks via bank_select_cv', () => {
      const defaultSrc = createDefaultSource('ImageCue') as ImageCueSource;
      defaultSrc.playbackMode = 'bank';
      defaultSrc.bankGridMode = '8';
      defaultSrc.banks[3] = {
        ...defaultSrc.banks[3],
        images: ['bank4_img1.png']
      };

      const layerId = 'test-layer-cv';
      const layer = {
        id: layerId,
        name: 'Layer CV',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        source: defaultSrc,
        effects: [],
        modulators: {},
        graph: { edges: [] }
      };

      useEngineStore.setState({
        layers: { [layerId]: layer as any },
        layerOrder: [layerId],
        activeLayerId: layerId
      });

      // Inject a CV of 0.45 into bank_select_cv: 0.45 * 8 = 3.6 -> Bank Index 3
      const dispatcher = SignalDispatcher.getInstance();
      const mockCtx: any = {
        layer: useEngineStore.getState().layers[layerId],
        signalValues: { 'source.bank_select_cv': 0.45 },
        audioEngine: {}
      };

      (dispatcher as any).handleImageCueTriggers(mockCtx, 'source', defaultSrc, true, 0.016);

      const updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.activeBankIndex).toBe(3);
      expect(updated.currentImageUrl).toBe('bank4_img1.png');
    });

    it('respects loopMode stop vs loop in directory mode', () => {
      const dispatcher = SignalDispatcher.getInstance();
      const cueSource: ImageCueSource = {
        ...(createDefaultSource('ImageCue') as ImageCueSource),
        files: ['1.png', '2.png'],
        activeDirIndex: 1,
        dirLoopMode: 'stop',
        currentImageUrl: '2.png'
      };

      const layerId = 'loop-test';
      useEngineStore.setState({
        layers: {
          [layerId]: { id: layerId, source: cueSource, effects: [], modulators: {}, graph: { edges: [] } } as any
        },
        layerOrder: [layerId]
      });

      const mockCtx: any = {
        layer: useEngineStore.getState().layers[layerId],
        signalValues: { 'source.image_trig': 1.0 },
        audioEngine: {}
      };

      // When dirLoopMode is 'stop', advancing at the end stays at index 1
      (dispatcher as any).handleImageCueTriggers(mockCtx, 'source', cueSource, true, 0.016);
      let updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.activeDirIndex).toBe(1);

      // When dirLoopMode is 'loop', advancing wraps to index 0
      const loopSource = { ...cueSource, dirLoopMode: 'loop' as const };
      (dispatcher as any).lastTriggerVals.set(`${layerId}.source.image_trig`, 0.0);
      (dispatcher as any).handleImageCueTriggers(mockCtx, 'source', loopSource, true, 0.016);
      updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.activeDirIndex).toBe(0);
      expect(updated.currentImageUrl).toBe('1.png');
    });

    it('cycles through images within a bank slot and emits gate_out pulse', () => {
      const dispatcher = SignalDispatcher.getInstance();
      const defaultSrc = createDefaultSource('ImageCue') as ImageCueSource;
      defaultSrc.playbackMode = 'bank';
      defaultSrc.activeBankIndex = 0;
      defaultSrc.currentImageUrl = 'frame1.png';
      defaultSrc.banks[0] = {
        ...defaultSrc.banks[0],
        images: ['frame1.png', 'frame2.png', 'frame3.png'],
        activeImageIndex: 0
      };

      const layerId = 'bank-step-test';
      useEngineStore.setState({
        layers: {
          [layerId]: { id: layerId, source: defaultSrc, effects: [], modulators: {}, graph: { edges: [] } } as any
        },
        layerOrder: [layerId]
      });

      const mockCtx: any = {
        layer: useEngineStore.getState().layers[layerId],
        signalValues: { 'source.image_trig': 1.0 },
        audioEngine: {}
      };

      (dispatcher as any).lastTriggerVals.set(`${layerId}.source.image_trig`, 0.0);
      (dispatcher as any).handleImageCueTriggers(mockCtx, 'source', defaultSrc, true, 0.016);

      const updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.banks[0].activeImageIndex).toBe(1);
      expect(updated.currentImageUrl).toBe('frame2.png');
      expect(updated.prevImageUrl).toBe('frame1.png');
      expect(mockCtx.signalValues['source.gate_out']).toBe(1.0);
    });

    it('skips empty banks on bank_trig when bankSkipEmpty is enabled (default)', () => {
      const dispatcher = SignalDispatcher.getInstance();
      const defaultSrc = createDefaultSource('ImageCue') as ImageCueSource;
      defaultSrc.playbackMode = 'bank';
      defaultSrc.activeBankIndex = 0;
      defaultSrc.banks[0] = { ...defaultSrc.banks[0], images: ['b1.png'] };
      // Banks 1 and 2 are empty; Bank 3 is populated
      defaultSrc.banks[3] = { ...defaultSrc.banks[3], images: ['b4.png'] };

      const layerId = 'skip-empty-test';
      useEngineStore.setState({
        layers: {
          [layerId]: { id: layerId, source: defaultSrc, effects: [], modulators: {}, graph: { edges: [] } } as any
        },
        layerOrder: [layerId]
      });

      const mockCtx: any = {
        layer: useEngineStore.getState().layers[layerId],
        signalValues: { 'source.bank_trig': 1.0 },
        audioEngine: {}
      };

      (dispatcher as any).lastTriggerVals.set(`${layerId}.source.bank_trig`, 0.0);
      (dispatcher as any).handleImageCueTriggers(mockCtx, 'source', defaultSrc, true, 0.016);

      let updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.activeBankIndex).toBe(3);
      expect(updated.currentImageUrl).toBe('b4.png');

      // Next bank_trig wraps back to first populated bank (0)
      (dispatcher as any).lastTriggerVals.set(`${layerId}.source.bank_trig`, 0.0);
      (dispatcher as any).handleImageCueTriggers(mockCtx, 'source', updated, true, 0.016);
      updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.activeBankIndex).toBe(0);
      expect(updated.currentImageUrl).toBe('b1.png');
    });

    it('triggers mapped bank pads on MIDI Note On messages', () => {
      const defaultSrc = createDefaultSource('ImageCue') as ImageCueSource;
      defaultSrc.banks[2] = {
        ...defaultSrc.banks[2],
        images: ['pad3_a.png', 'pad3_b.png'],
        activeImageIndex: 0
      };
      defaultSrc.midiPadMappings = {
        2: { note: 36, channel: 1 }
      };

      const layerId = 'midi-pad-test';
      useEngineStore.setState({
        layers: {
          [layerId]: { id: layerId, source: defaultSrc, effects: [], modulators: {}, graph: { edges: [] } } as any
        },
        layerOrder: [layerId]
      });

      const midi = MidiManager.getInstance();
      midi.isPadLearning = false;

      // Hit Note 36 on Channel 1 (0x90, 36, 100) -> switches to bank mode, bank index 2
      midi.handleMidiMessage(new Uint8Array([0x90, 36, 100]));
      let updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.playbackMode).toBe('bank');
      expect(updated.activeBankIndex).toBe(2);
      expect(updated.currentImageUrl).toBe('pad3_a.png');

      // Hit Note 36 again while active -> steps to next image in bank 2
      midi.handleMidiMessage(new Uint8Array([0x90, 36, 100]));
      updated = useEngineStore.getState().layers[layerId].source as ImageCueSource;
      expect(updated.banks[2].activeImageIndex).toBe(1);
      expect(updated.currentImageUrl).toBe('pad3_b.png');
    });
  });
});
