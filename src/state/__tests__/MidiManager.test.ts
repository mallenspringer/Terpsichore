import { describe, it, expect, beforeEach } from 'vitest';
import { MidiManager } from '../MidiManager';
import { useEngineStore } from '../store';

describe('MidiManager', () => {
  let midiManager: MidiManager;

  beforeEach(() => {
    midiManager = MidiManager.getInstance();
    (midiManager as any).resetState();
    useEngineStore.setState({
      midiBindings: [],
      midiLearnTarget: null,
      midiOverlayActive: false
    });
  });

  describe('Clock Pulse Distribution', () => {
    it('should accurately calculate clock division pulses on 0xf8 ticks', () => {
      // 24 ticks = quarter note ('1/4')
      for (let i = 0; i < 23; i++) {
        midiManager.handleMidiMessage(new Uint8Array([0xf8]));
        expect(midiManager.getClockPulse('1/4')).toBe(false);
      }
      
      // 24th tick triggers 1/4 (and also 1/8, 1/16, 1/32)
      midiManager.handleMidiMessage(new Uint8Array([0xf8]));
      expect(midiManager.getClockPulse('1/4')).toBe(true);
      expect(midiManager.getClockPulse('1/8')).toBe(true);
      expect(midiManager.getClockPulse('1/16')).toBe(true);
      expect(midiManager.getClockPulse('1/32')).toBe(true);
    });

    it('should allow multiple readers to query the same clock pulse without resetting on read', () => {
      // Send 24 clock ticks
      for (let i = 0; i < 24; i++) {
        midiManager.handleMidiMessage(new Uint8Array([0xf8]));
      }

      // First module queries
      expect(midiManager.getClockPulse('1/4')).toBe(true);
      // Second module queries in the same frame - MUST still be true
      expect(midiManager.getClockPulse('1/4')).toBe(true);
      // Third module queries in the same frame - MUST still be true
      expect(midiManager.getClockPulse('1/4')).toBe(true);

      // Frame finishes, dispatcher clears pulses
      midiManager.clearClockPulses();
      expect(midiManager.getClockPulse('1/4')).toBe(false);
    });

    it('should reset clock tick counter on start (0xfa) or continue (0xfb)', () => {
      for (let i = 0; i < 12; i++) {
        midiManager.handleMidiMessage(new Uint8Array([0xf8]));
      }
      expect((midiManager as any).clockTicks).toBe(12);

      midiManager.handleMidiMessage(new Uint8Array([0xfa]));
      expect((midiManager as any).clockTicks).toBe(0);
    });
  });

  describe('Control Change (CC) Handling', () => {
    it('should parse CC messages and normalize values to 0.0 - 1.0', () => {
      // Channel 1, CC 7 (Volume), Value 127 (max)
      midiManager.handleMidiMessage(new Uint8Array([0xb0, 7, 127]));
      expect(midiManager.getCCValue(1, 7)).toBe(1.0);
      expect(midiManager.getCCValue('all', 7)).toBe(1.0);

      // Channel 2, CC 10 (Pan), Value 64 (center)
      midiManager.handleMidiMessage(new Uint8Array([0xb1, 10, 64]));
      expect(midiManager.getCCValue(2, 10)).toBeCloseTo(64 / 127, 4);
      expect(midiManager.getCCValue('all', 10)).toBeCloseTo(64 / 127, 4);
      // Channel 1 should not be affected by Channel 2's CC 10
      expect(midiManager.getCCValue(1, 10)).toBe(0);
    });
  });

  describe('Note On / Note Off Handling', () => {
    it('should track note on and calculate normalized pitch and velocity', () => {
      // Note On: Channel 1, Note 60 (Middle C), Velocity 100
      midiManager.handleMidiMessage(new Uint8Array([0x90, 60, 100]));
      
      const noteData = midiManager.getNoteData(1);
      expect(noteData.gate).toBe(true);
      expect(noteData.rawPitch).toBe(60);
      expect(noteData.pitch).toBeCloseTo((60 - 24) / 96, 4);
      expect(noteData.velocity).toBeCloseTo(100 / 127, 4);

      const allData = midiManager.getNoteData('all');
      expect(allData.gate).toBe(true);
      expect(allData.rawPitch).toBe(60);
    });

    it('should maintain a held note stack and fallback to previously held note when one is released', () => {
      // Press Note 60
      midiManager.handleMidiMessage(new Uint8Array([0x90, 60, 80]));
      expect(midiManager.getNoteData(1).rawPitch).toBe(60);

      // Press Note 72 while still holding 60
      midiManager.handleMidiMessage(new Uint8Array([0x90, 72, 110]));
      expect(midiManager.getNoteData(1).rawPitch).toBe(72);

      // Release Note 72 (Note Off 0x80 or Note On with 0 velocity)
      midiManager.handleMidiMessage(new Uint8Array([0x80, 72, 0]));
      
      // Should fall back to held Note 60 with gate still open
      const fallback = midiManager.getNoteData(1);
      expect(fallback.gate).toBe(true);
      expect(fallback.rawPitch).toBe(60);

      // Release Note 60
      midiManager.handleMidiMessage(new Uint8Array([0x90, 60, 0]));
      expect(midiManager.getNoteData(1).gate).toBe(false);
    });
  });

  describe('Interactive MIDI Learn', () => {
    it('should intercept CC wiggles and bind to learn target', () => {
      useEngineStore.setState({
        midiLearnTarget: {
          type: 'absolute',
          layerId: 'layer_1',
          moduleId: 'fx_transform',
          paramId: 'rotation'
        }
      });

      // User turns knob on hardware: Channel 3, CC 16, Value 80
      midiManager.handleMidiMessage(new Uint8Array([0xb2, 16, 80]));

      const store = useEngineStore.getState();
      expect(store.midiLearnTarget).toBeNull(); // Automatically exited learn mode
      expect(store.midiBindings.length).toBe(1);
      
      const binding = store.midiBindings[0];
      expect(binding.target.layerId).toBe('layer_1');
      expect((binding.target as any).moduleId).toBe('fx_transform');
      expect(binding.target.paramId).toBe('rotation');
      expect(binding.midiSource.channel).toBe(3);
      expect(binding.midiSource.ccNumber).toBe(16);
    });
  });
});
