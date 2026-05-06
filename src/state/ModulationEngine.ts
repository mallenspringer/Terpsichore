import { useEngineStore } from './store';
import { MidiCCListenerModulator, InternalLFOModulator } from './types';
import { SignalDispatcher } from './SignalDispatcher';

export class ModulationEngine {
  private midiAccess: any = null;
  private isRunning = false;
  // We keep a local smoothed value dictionary to handle the smoothing glide
  private smoothedMidiValues: Record<string, number> = {};
  private animationFrameId: number = 0;
  private lastTime: number = 0;
  private lfoPhases: Record<string, number> = {};

  public async initialize() {
    this.isRunning = true;
    try {
      if (navigator.requestMIDIAccess) {
        this.midiAccess = await navigator.requestMIDIAccess();
        for (const input of this.midiAccess.inputs.values()) {
          input.onmidimessage = this.handleMidiMessage.bind(this);
        }
        this.midiAccess.onstatechange = (e: any) => {
          if (e.port.type === 'input' && e.port.state === 'connected') {
            (e.port as any).onmidimessage = this.handleMidiMessage.bind(this);
          }
        };
      } else {
        console.warn("Web MIDI API not supported in this browser.");
      }
    } catch (err) {
      console.warn("Could not access Web MIDI.", err);
    }

    this.lastTime = performance.now();
    this.loop();
  }

  private handleMidiMessage(message: any) {
    const [command, data1, data2] = message.data;
    
    // Check if it's a Control Change message (176 to 191)
    if (command >= 176 && command <= 191) {
      const channel = (command & 0x0f) + 1; // 1-16
      const ccNumber = data1;
      const rawValue = data2 / 127.0; // Normalize to 0.0 - 1.0

      const state = useEngineStore.getState();
      
      // Find any MidiCCListeners that match this channel and CC
      Object.values(state.modulators).forEach(mod => {
        if (mod.type === 'MidiCCListener') {
          const midiMod = mod as MidiCCListenerModulator;
          if (midiMod.midiChannel === channel && midiMod.ccNumber === ccNumber) {
             // We update the local unsmoothed target value, and let the loop smooth it
             // Actually, if smoothing is 0, we can just update store immediately
             if (midiMod.smoothing === 0) {
               useEngineStore.getState().updateModulator(mod.id, { value: rawValue });
               this.smoothedMidiValues[mod.id] = rawValue;
             } else {
               // We need a target value store, we'll just stick it on the class
               (this as any)[`_target_${mod.id}`] = rawValue;
             }
          }
        }
      });
    }
  }

  private loop = () => {
    if (!this.isRunning) return;

    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const state = useEngineStore.getState();
    const updateModulator = state.updateModulator;
    const updateLayerSignals = state.updateLayerSignals;

    // 1. Update LFOs
    Object.values(state.modulators).forEach(mod => {
      if (mod.type === 'InternalLFO') {
        const lfo = mod as InternalLFOModulator;
        let phase = this.lfoPhases[mod.id] ?? lfo.phase ?? 0;
        phase = (phase + lfo.rate * delta) % 1.0;
        this.lfoPhases[mod.id] = phase;
        
        let value = 0;
        switch (lfo.waveform) {
          case 'sine': value = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; break;
          case 'square': value = phase < 0.5 ? 1 : 0; break;
          case 'triangle': value = phase < 0.5 ? phase * 2 : 2 - phase * 2; break;
          case 'saw': value = phase; break;
        }
        updateModulator(mod.id, { phase, value } as any);
      }
    });

    // 2. Apply smoothing to MIDI values

    Object.values(state.modulators).forEach(mod => {
      if (mod.type === 'MidiCCListener') {
        const midiMod = mod as MidiCCListenerModulator;
        const targetValue = (this as any)[`_target_${mod.id}`] ?? midiMod.value ?? 0;
        const currentValue = this.smoothedMidiValues[mod.id] ?? midiMod.value ?? 0;

        if (midiMod.smoothing > 0) {
           const diff = targetValue - currentValue;
           if (Math.abs(diff) > 0.001) {
             // Simple low-pass filter smoothing
             const factor = 1.0 - midiMod.smoothing; // 0 = fast, 0.99 = slow
             const newValue = currentValue + diff * factor * 0.1; 
             this.smoothedMidiValues[mod.id] = newValue;
             useEngineStore.getState().updateModulator(mod.id, { value: newValue });
           }
        }
      }
    });

    // 3. Process Signal Graph using the Dispatcher (JIT Compiler)
    SignalDispatcher.getInstance().execute();

    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  public destroy() {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);
    if (this.midiAccess) {
      for (const input of this.midiAccess.inputs.values()) {
        input.onmidimessage = null;
      }
    }
  }
}
