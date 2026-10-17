import { useEngineStore } from './store';

export interface NoteData {
  pitch: number;      // 0.0 to 1.0 (normalized C1-C9)
  rawPitch: number;   // 0 to 127
  velocity: number;   // 0.0 to 1.0
  gate: boolean;      // true if active note is pressed
}

export class MidiManager {
  private static instance: MidiManager;

  private isInitialized = false;
  private midiAccess: any = null;
  private inputs: any[] = [];
  
  // Storage for MIDI state
  private notes: Record<string | number, NoteData> = {};
  private activeNotes: Record<string | number, Set<number>> = {};
  private ccs: Record<string, number> = {}; // key: `${channel}_${ccNumber}`
  private messageListeners: ((data: Uint8Array) => void)[] = [];
  
  // Timing state
  private clockTicks = 0;
  private clockPulseActive = {
    '1/4': false,
    '1/8': false,
    '1/16': false,
    '1/32': false
  };

  public addMessageListener(cb: (data: Uint8Array) => void) {
    this.messageListeners.push(cb);
  }

  public removeMessageListener(cb: (data: Uint8Array) => void) {
    this.messageListeners = this.messageListeners.filter(l => l !== cb);
  }

  private constructor() {
    // Pre-populate empty lists
    this.resetState();
  }

  public static getInstance(): MidiManager {
    if (!MidiManager.instance) {
      MidiManager.instance = new MidiManager();
    }
    return MidiManager.instance;
  }

  private resetState() {
    const channels: (string | number)[] = ['all', ...Array.from({ length: 16 }, (_, i) => i + 1)];
    channels.forEach(ch => {
      this.notes[ch] = { pitch: 0, rawPitch: 0, velocity: 0, gate: false };
      this.activeNotes[ch] = new Set<number>();
    });
    this.ccs = {};
    this.clockTicks = 0;
    this.clockPulseActive = {
      '1/4': false,
      '1/8': false,
      '1/16': false,
      '1/32': false
    };
  }

  public initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      console.warn("Web MIDI API is not supported in this environment.");
      return;
    }

    navigator.requestMIDIAccess()
      .then((access: any) => {
        this.midiAccess = access;
        this.updateInputs();
        
        access.onstatechange = () => {
          this.updateInputs();
        };
      })
      .catch((err: any) => {
        console.error("Failed to get MIDI access:", err);
      });
  }

  private updateInputs() {
    if (!this.midiAccess) return;

    // Disconnect old listeners
    this.inputs.forEach(input => {
      input.onmidimessage = null;
    });

    this.inputs = Array.from(this.midiAccess.inputs.values());
    
    // Connect new listeners
    this.inputs.forEach(input => {
      input.onmidimessage = (event: any) => {
        this.handleMidiMessage(event.data);
      };
    });
  }

  public handleMidiMessage(data: Uint8Array) {
    if (!data || data.length === 0) return;

    // Dispatch raw message to observers
    this.messageListeners.forEach(cb => cb(data));

    const status = data[0];
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1; // 1-16

    // Timing Clock
    if (status === 0xf8) {
      this.clockTicks++;
      
      // Timing clock tick is sent 24 times per quarter note.
      // Quarter note = 24 ticks
      // 8th note = 12 ticks
      // 16th note = 6 ticks
      // 32nd note = 3 ticks
      if (this.clockTicks % 24 === 0) this.clockPulseActive['1/4'] = true;
      if (this.clockTicks % 12 === 0) this.clockPulseActive['1/8'] = true;
      if (this.clockTicks % 6 === 0)  this.clockPulseActive['1/16'] = true;
      if (this.clockTicks % 3 === 0)  this.clockPulseActive['1/32'] = true;
      
      return;
    }

    // Start / Continue timing clock reset
    if (status === 0xfa || status === 0xfb) {
      this.clockTicks = 0;
      return;
    }

    if (data.length < 2) return;
    const data1 = data[1];
    const data2 = data.length > 2 ? data[2] : 0;

    // --- MIDI Learn Target Interception ---
    const store = useEngineStore.getState();
    const learnTarget = store.midiLearnTarget;
    if (learnTarget) {
      if (command === 0xb0) { // CC
        const ccNum = data1;
        const newBinding = {
          id: `midi_bind_${Date.now()}`,
          type: 'parameter' as const,
          target: learnTarget,
          midiSource: {
            channel: channel,
            ccNumber: ccNum
          },
          range: [0, 1] as [number, number],
          invert: false
        };

        const cleanBindings = store.midiBindings.filter(b => 
          !(b.target.layerId === learnTarget.layerId && 
            (b.target as any).moduleId === (learnTarget as any).moduleId && 
            b.target.paramId === learnTarget.paramId)
        );

        useEngineStore.setState({
          midiBindings: [...cleanBindings, newBinding],
          midiLearnTarget: null // exit learn mode
        });
        return;
      } else if (command === 0x90 && data2 > 0) { // Note On
        const note = data1;
        const newBinding = {
          id: `midi_bind_${Date.now()}`,
          type: 'parameter' as const,
          target: learnTarget,
          midiSource: {
            channel: channel,
            noteNumber: note
          },
          range: [0, 1] as [number, number],
          invert: false
        };

        const cleanBindings = store.midiBindings.filter(b => 
          !(b.target.layerId === learnTarget.layerId && 
            (b.target as any).moduleId === (learnTarget as any).moduleId && 
            b.target.paramId === learnTarget.paramId)
        );

        useEngineStore.setState({
          midiBindings: [...cleanBindings, newBinding],
          midiLearnTarget: null // exit learn mode
        });
        return;
      }
    }

    // Note On
    if (command === 0x90 && data2 > 0) {
      const note = data1;
      const velocity = data2;

      this.addActiveNote(channel, note, velocity);
      this.addActiveNote('all', note, velocity);
    }
    // Note Off
    else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      const note = data1;

      this.removeActiveNote(channel, note);
      this.removeActiveNote('all', note);
    }
    // Control Change (CC)
    else if (command === 0xb0) {
      const ccNumber = data1;
      const ccValue = data2;

      const val = ccValue / 127;
      this.ccs[`${channel}_${ccNumber}`] = val;
      this.ccs[`all_${ccNumber}`] = val;
    }
  }

  private addActiveNote(ch: string | number, note: number, velocity: number) {
    if (!this.activeNotes[ch]) {
      this.activeNotes[ch] = new Set<number>();
    }
    this.activeNotes[ch].add(note);

    // Normalize pitch: scale raw MIDI note (0-127) using (note - 24) / 96, clamp 0 to 1
    const pitch = Math.max(0, Math.min(1, (note - 24) / 96));
    this.notes[ch] = {
      pitch,
      rawPitch: note,
      velocity: velocity / 127,
      gate: true
    };
  }

  private removeActiveNote(ch: string | number, note: number) {
    if (this.activeNotes[ch]) {
      this.activeNotes[ch].delete(note);
      
      // If there are still active notes, keep the latest one active
      if (this.activeNotes[ch].size > 0) {
        const remaining = Array.from(this.activeNotes[ch]);
        const latestNote = remaining[remaining.length - 1];
        
        const pitch = Math.max(0, Math.min(1, (latestNote - 24) / 96));
        const current = this.notes[ch];
        this.notes[ch] = {
          pitch,
          rawPitch: latestNote,
          velocity: current.velocity, // preserve velocity of pressed note
          gate: true
        };
      } else {
        this.notes[ch].gate = false;
      }
    }
  }

  // Getters for SignalDispatcher
  public getNoteData(channel: 'all' | number): NoteData {
    return this.notes[channel] || { pitch: 0, rawPitch: 0, velocity: 0, gate: false };
  }

  public getCCValue(channel: 'all' | number, ccNumber: number): number {
    return this.ccs[`${channel}_${ccNumber}`] ?? 0;
  }

  public getClockPulse(division: '1/4' | '1/8' | '1/16' | '1/32'): boolean {
    return this.clockPulseActive[division];
  }

  public clearClockPulses() {
    this.clockPulseActive['1/4'] = false;
    this.clockPulseActive['1/8'] = false;
    this.clockPulseActive['1/16'] = false;
    this.clockPulseActive['1/32'] = false;
  }
}
