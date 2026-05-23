# Terpsichore: High-Fidelity Audio Reactivity & Vocal Tracking Implementation Plan

This document serves as an exhaustive, step-by-step developer specification for adding advanced audio reactivity and vocal tracking to Terpsichore. It is designed to guide different development agents across separate conversations, ensuring strict adherence to the project's decoupled high-frequency signal architecture, styling conventions, and DSP performance standards.

---

## 🏗️ Core Architectural Guidelines

Terpsichore uses a **Strictly Decoupled Engine**:
1. **Under-the-Hood DSP Utility Classes (`src/dsp/`)**: Pure TypeScript classes that handle complex math (sliding windows, autocorrelation, LPC analysis). They operate strictly on raw buffers, perform zero UI operations, and have no direct WebGPU handles.
2. **High-Frequency Dispatcher Integration (`src/state/SignalDispatcher.ts`)**: All analyzed descriptors (e.g., peak amplitude, pitches in Hz, vowel coordinates) must be written at 60fps directly into the `latestSignals` cache. This bypasses the React store to guarantee zero-latency modulation of WebGPU shader pipelines.
3. **Throttled UI Store Synced Presentation (`src/components/ModuleNode/`)**: The module views query the dispatcher or store to display smooth, beautiful, interactive UI elements (vowel 2D coordinates, scrolling pitch grids, and high-precision decibel meters) without impacting the audio processing thread.

---

## 🛠️ Step 1: Under-the-Hood DSP Utility Classes (`src/dsp/`)

Construct these mathematical utility classes as pure TypeScript files. To prevent audio buffer underruns and garbage collection pauses, **never allocate memory dynamically within the processing loop**. Reuse static `Float32Array` buffers.

### 1. `EnvelopeFollower.ts`
*   **File Path**: `src/dsp/EnvelopeFollower.ts`
*   **Mathematical Model**:
    Exponential smoothing with independent attack and release times:
    $$y[n] = y[n-1] + \alpha \cdot (x[n] - y[n-1])$$
    $$\alpha = \begin{cases} \alpha_{\text{attack}}, & \text{if } x[n] > y[n-1] \\ \alpha_{\text{release}}, & \text{otherwise} \end{cases}$$
    $$\alpha_{\text{step}} = 1.0 - e^{-1.0 / (F_s \cdot \tau)}$$
    where $F_s$ is the audio context sample rate (typically 44100Hz or 48000Hz) and $\tau$ is the time constant in seconds.
*   **API Specification**:
    ```typescript
    export class EnvelopeFollower {
      private lastValue = 0;
      private attackCoef = 0.99;
      private releaseCoef = 0.9;
      private sampleRate: number;

      constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
      }

      public setConstants(attackMs: number, releaseMs: number) {
        this.attackCoef = 1.0 - Math.exp(-1.0 / (this.sampleRate * (attackMs / 1000.0)));
        this.releaseCoef = 1.0 - Math.exp(-1.0 / (this.sampleRate * (releaseMs / 1000.0)));
      }

      public process(inputBuffer: Float32Array): number {
        let env = this.lastValue;
        for (let i = 0; i < inputBuffer.length; i++) {
          const absVal = Math.abs(inputBuffer[i]);
          const coef = absVal > env ? this.attackCoef : this.releaseCoef;
          env = env + coef * (absVal - env);
        }
        this.lastValue = env;
        return env;
      }
    }
    ```

### 2. `YinPitchDetector.ts`
*   **File Path**: `src/dsp/YinPitchDetector.ts`
*   **Vocal Range Target**: Monophonic pitch detection optimized for human voice ($80\text{Hz} - 800\text{Hz}$).
*   **Algorithm**: YIN (Autocorrelation-based):
    1. **Difference Function**: Measures the squared difference between the signal and its shifted version for lag $\tau$:
       $$d(\tau) = \sum_{j=1}^{W} (x[j] - x[j+\tau])^2$$
    2. **Cumulative Mean Normalized Difference**:
       $$d'(\tau) = \begin{cases} 1, & \text{if } \tau = 0 \\ \frac{d(\tau)}{\frac{1}{\tau} \sum_{j=1}^{\tau} d(j)}, & \text{otherwise} \end{cases}$$
    3. **Thresholding**: Locate the first local minimum of $d'(\tau)$ below the threshold (typically $0.10 \to 0.15$). If no minimum falls below, select the absolute global minimum.
    4. **Parabolic Interpolation**: Interpolate the three values around the minimum to achieve highly precise sub-sample frequency resolution.
*   **API Specification**:
    ```typescript
    export class YinPitchDetector {
      private threshold = 0.15;
      private sampleRate: number;
      private differenceBuffer: Float32Array;

      constructor(sampleRate: number, maxLag: number) {
        this.sampleRate = sampleRate;
        this.differenceBuffer = new Float32Array(maxLag);
      }

      public getPitch(buffer: Float32Array): { hz: number; confidence: number } {
        // Step 1: Calculate Difference Function
        // Step 2: Cumulative Mean Normalized Difference
        // Step 3: Find absolute minimum & threshold
        // Step 4: Parabolic interpolation on optimal index
        // Return frequency in Hz and confidence level (1.0 - minimum difference value)
      }
    }
    ```

### 3. `LpcFormantTracker.ts`
*   **File Path**: `src/dsp/LpcFormantTracker.ts`
*   **Purpose**: Tracks first two vocal formants ($F1$ and $F2$) to detect vowel sounds (Ah, Oh, Ee, Oo).
*   **Implementation Steps**:
    1. **Pre-emphasis**: Smooth the high frequencies using a simple high-pass filter:
       $$s'[n] = s[n] - 0.97 \cdot s[n-1]$$
    2. **Hamming Window**: Apply a window to the pre-emphasized signal to prevent edge leakage.
    3. **Autocorrelation**: Calculate autocorrelation values $R[0] \dots R[P]$ where $P = 12$ is the LPC predictor order.
    4. **Levinson-Durbin Recursion**: Solve the system of linear equations to calculate predictor coefficients $A$.
    5. **Root Finding**: Use Durand-Kerner or Jenkins-Traub algorithm to find the complex roots of the LPC polynomial:
       $$1 - \sum_{k=1}^{P} a_k \cdot z^{-k} = 0$$
    6. **Formant Extraction**: Convert complex roots $z_i = u + iv$ to frequencies:
       $$F_i = \text{atan2}(v, u) \cdot \frac{F_s}{2\pi}$$
       Filter out root frequencies below $250\text{Hz}$ or above $3000\text{Hz}$. Sort the remaining roots by bandwidth (closer to unit circle means sharper resonance). The lowest two frequencies are formants $F1$ and $F2$.
*   **Vowel Grid Mapping**: Scale $F1$ ($300\text{Hz} - 1000\text{Hz}$) and $F2$ ($800\text{Hz} - 2500\text{Hz}$) into a normalized coordinate system:
    $$Vowel_X = \frac{F2 - 800}{1700}, \quad Vowel_Y = \frac{F1 - 300}{700}$$

### 4. `SpectralTimbreExtractor.ts`
*   **File Path**: `src/dsp/SpectralTimbreExtractor.ts`
*   **Calculations**:
    *   **Spectral Centroid** (Vocal Brightness):
        $$f_c = \frac{\sum_{i=0}^{N-1} f_i \cdot A_i}{\sum_{i=0}^{N-1} A_i}$$
    *   **Spectral Flatness** (Tone vs. Noise ratio):
        $$g_f = \frac{\exp\left(\frac{1}{N}\sum_{i=0}^{N-1} \ln(A_i + \epsilon)\right)}{\frac{1}{N}\sum_{i=0}^{N-1} A_i}$$
    *   **Sibilance Ratio**:
        $$\text{Sibilance} = \frac{\text{Energy}(4\text{kHz} \to 12\text{kHz})}{\text{Energy}(100\text{Hz} \to 1\text{kHz})}$$

---

## 🛠️ Step 2: Global Configuration & Registries

Before building discrete modules, register the new types and ports so the Node Graph and Zustand state recognize them safely.

### 1. `src/state/types.ts`
Add the following interfaces to the effects definitions:
```typescript
export interface SpeechEnvelopeTrackerEffect {
  id: string;
  type: 'SpeechEnvelopeTracker';
  layerId: string;
  attackMs: number;
  releaseMs: number;
  sensitivityDb: number;
}

export interface VocalPitchTrackerEffect {
  id: string;
  type: 'VocalPitchTracker';
  layerId: string;
  minPitchHz: number;
  maxPitchHz: number;
  tolerance: number;
}

export interface VowelFormantTrackerEffect {
  id: string;
  type: 'VowelFormantTracker';
  layerId: string;
  smoothing: number;
}

export interface SpokenWordVisualizerEffect {
  id: string;
  type: 'SpokenWordVisualizer';
  layerId: string;
  renderMode: 'Constellation' | 'FlowingRibbon' | 'RadialWaterfall';
  colorPalette: string;
}
```
Update the global `AnyEffect` union type to include these new interfaces. Also add `'SpeechEnvelopeTracker' | 'VocalPitchTracker' | 'VowelFormantTracker' | 'SpokenWordVisualizer'` to the valid type strings.

### 2. `src/components/NodeGraph/portDefs.ts`
Add precise port bindings for the four new modules in `PORT_DEFS`:
```typescript
  SpeechEnvelopeTracker: [
    { id: 'audio_in', label: 'Audio In', direction: 'in', signalType: 'audio', priority: 0 },
    { id: 'envelope_out', label: 'Env Out', direction: 'out', signalType: 'modulation', priority: 1 },
    { id: 'cadence_out', label: 'Cadence', direction: 'out', signalType: 'modulation', priority: 2 },
    { id: 'speech_trig', label: 'Speech On', direction: 'out', signalType: 'trigger', priority: 3 },
    { id: 'silence_trig', label: 'Silence On', direction: 'out', signalType: 'trigger', priority: 4 }
  ],
  VocalPitchTracker: [
    { id: 'audio_in', label: 'Audio In', direction: 'in', signalType: 'audio', priority: 0 },
    { id: 'pitch_hz', label: 'Pitch Hz', direction: 'out', signalType: 'modulation', priority: 1 },
    { id: 'pitch_midi', label: 'MIDI Pitch', direction: 'out', signalType: 'modulation', priority: 2 },
    { id: 'stability', label: 'Stability', direction: 'out', signalType: 'modulation', priority: 3 },
    { id: 'note_change_trig', label: 'Note Trig', direction: 'out', signalType: 'trigger', priority: 4 }
  ],
  VowelFormantTracker: [
    { id: 'audio_in', label: 'Audio In', direction: 'in', signalType: 'audio', priority: 0 },
    { id: 'formant_f1', label: 'F1 Depth', direction: 'out', signalType: 'modulation', priority: 1 },
    { id: 'formant_f2', label: 'F2 Tongue', direction: 'out', signalType: 'modulation', priority: 2 },
    { id: 'vowel_x', label: 'Vowel X', direction: 'out', signalType: 'modulation', priority: 3 },
    { id: 'vowel_y', label: 'Vowel Y', direction: 'out', signalType: 'modulation', priority: 4 },
    { id: 'vowel_change_trig', label: 'Vowel Trig', direction: 'out', signalType: 'trigger', priority: 5 }
  ],
  SpokenWordVisualizer: [
    { id: 'audio_in', label: 'Audio In', direction: 'in', signalType: 'audio', priority: 0 },
    { id: 'video_out', label: 'Video Out', direction: 'out', signalType: 'video', priority: 1 },
    { id: 'cadence', label: 'Cadence', direction: 'out', signalType: 'modulation' },
    { id: 'timbre_brightness', label: 'Timbre Brightness', direction: 'out', signalType: 'modulation' },
    { id: 'sibilance', label: 'Sibilance', direction: 'out', signalType: 'modulation' },
    { id: 'onset_pulse', label: 'Onset Trig', direction: 'out', signalType: 'trigger' }
  ],
```
Add display name mappings in `MODULE_DISPLAY_NAMES`:
```typescript
  SpeechEnvelopeTracker: 'Vocal Env',
  VocalPitchTracker: 'Pitch Track',
  VowelFormantTracker: 'Vowel Track',
  SpokenWordVisualizer: 'Vocal Visualizer',
```

### 3. `src/utils/moduleFactory.ts`
Implement switch cases inside `createDefaultEffect` to yield default states:
```typescript
    case 'SpeechEnvelopeTracker':
      return {
        id,
        type: 'SpeechEnvelopeTracker',
        layerId,
        attackMs: 10,
        releaseMs: 150,
        sensitivityDb: -40
      };
    case 'VocalPitchTracker':
      return {
        id,
        type: 'VocalPitchTracker',
        layerId,
        minPitchHz: 80,
        maxPitchHz: 800,
        tolerance: 0.15
      };
    case 'VowelFormantTracker':
      return {
        id,
        type: 'VowelFormantTracker',
        layerId,
        smoothing: 0.8
      };
    case 'SpokenWordVisualizer':
      return {
        id,
        type: 'SpokenWordVisualizer',
        layerId,
        renderMode: 'Constellation',
        colorPalette: 'vibrant'
      };
```

---

## 🛠️ Step 3: Centralized Audio Logic & Dispatch Sync

This is the structural core where CPU/DSP analysis maps directly to zero-latency dispatch loops.

### 1. Integrate with `AudioEngine.ts`
Add instances of our pure DSP classes into the active connections inside `AudioEngine.ts`.
For any active audio tracking node (e.g. `SpeechEnvelopeTracker`), we fetch the raw `waveform` from the Analyser node on update, feed it through the corresponding DSP extractor, and populate secondary registers on the audio bus:
```typescript
// Inside AudioEngine.ts
public getSpeechFeatures(busId: string, attackMs: number, releaseMs: number) {
  const bus = this.buses.get(busId);
  const analyzer = this.analyzers.get(busId) || this.processingNodes.get(busId)?.analyzer;
  if (!bus || !analyzer) return null;

  // Lazily instantiate classes
  let follower = this.envelopeFollowers.get(busId);
  if (!follower) {
    follower = new EnvelopeFollower(this.context.sampleRate);
    this.envelopeFollowers.set(busId, follower);
  }
  follower.setConstants(attackMs, releaseMs);

  analyzer.getFloatTimeDomainData(bus.waveform as any);
  const envelope = follower.process(bus.waveform);

  // Peak/onset detection logic inside the envelope follower
  return { envelope, cadence: bus.rms * 1.5 }; 
}
```

### 2. Connect via `src/state/SignalDispatcher.ts`
Implement dispatch blocks in the `SignalDispatcher.ts` compilation pipeline:
```typescript
// Inside src/state/SignalDispatcher.ts
} else if (effect.type === 'SpeechEnvelopeTracker') {
  pipeline.push((ctx: DispatchContext) => {
    const ef = ctx.layer.effects.find(e => e.id === nodeId) as SpeechEnvelopeTrackerEffect;
    if (!ef) return;

    // Use active routing path to find source bus
    const edges = ctx.layer.graph?.edges || [];
    const incomingAudioEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
    const busId = incomingAudioEdge ? (incomingAudioEdge.fromNodeId === 'source' ? ctx.layer.id : incomingAudioEdge.fromNodeId) : 'master';

    const features = ctx.audioEngine.getSpeechFeatures(busId, ef.attackMs, ef.releaseMs);
    if (features) {
      ctx.signalValues[`${nodeId}.envelope_out`] = features.envelope;
      ctx.signalValues[`${nodeId}.cadence_out`] = Math.min(1.0, features.cadence);
      
      const threshold = Math.pow(10, ef.sensitivityDb / 20.0);
      const isSpeech = features.envelope > threshold;
      
      const prevState = this.speechStateMap.get(nodeId) ?? false;
      ctx.signalValues[`${nodeId}.speech_trig`] = (isSpeech && !prevState) ? 1.0 : 0.0;
      ctx.signalValues[`${nodeId}.silence_trig`] = (!isSpeech && prevState) ? 1.0 : 0.0;
      this.speechStateMap.set(nodeId, isSpeech);
    }
  });
}
```
Apply equivalent dispatch blocks for `VocalPitchTracker` and `VowelFormantTracker` by calling the matching DSP helpers on update.

---

## 🛠️ Step 4: Discrete Console UI Implementation

Create beautifully optimized React components in `src/components/ModuleNode/` incorporating high-density custom CSS styling.

### 📜 Common Design Rules for Audio Nodes:
1. **Never use generic standard controls**: Style using custom dense, dark-mode visual elements with glowing parameters (HSL tailors like `#18e4f5` cyan or `#d918f5` magenta).
2. **Keyboard Snappy Triggers**: Double-click resets for numerical sliders.
3. **Prevention of Focus Scroll-Snaps**: Use `onPointerDown={e => e.preventDefault()}` on all interactive knobs/toggles to avoid canvas transform snapping.
4. **Snappable Accordions**: Tag container subgroup headers with `data-group-header="SubgroupName"` to ensure the SVG edge router handles snap routing when parameters are collapsed.

### Phase 1 UI: Speech Envelope Tracker
*   **Layout**: Vertical console strip.
*   **Visual Assets**:
    *   **Peak Decibel Meter**: Custom vertical CSS grid meter displaying real-time envelope levels from $[-60\text{dB}, 0\text{dB}]$ with neon colors.
    *   **Threshold Line overlay**: Superimposed on the decibel meter to show sensitivity adjustments.
    *   **Onset Indicator**: Flashes yellow when a trigger is emitted.

### Phase 2 UI: Vocal Pitch Tracker
*   **Layout**: Integrated Retro LCD panel.
*   **Visual Assets**:
    *   **Note display**: Stylized dark LCD glass containing high-glowing note representations (e.g., `"C#4"`, `"A2"`).
    *   **Cents bar**: Horizontal tuning scale showing deviation from $[-50\text{c}, +50\text{c}]$.
    *   **Note History Sparkline**: 1D sliding canvas visualizer plotting active melodies.

### Phase 2 UI: Vowel Formant Tracker
*   **Layout**: 2D scatter-plot canvas.
*   **Visual Assets**:
    *   **Formant Space Scatter**: Draw a coordinate grid. Plot target vowels (Ah, Oh, Ee, Oo) in their calibrated formant zones ($F1/F2$ intersections).
    *   **Constellation Dot**: Animate a glowing particle cursor shifting in real time across vowel coordinates. Interpolate positions smoothly using exponential decay.

---

## 🛠️ Step 5: Compound Visualizer & WebGPU pipelines

The Phase 3 crown-jewel vocal visualizer combines descriptors into dedicated visual WebGPU render passes.

### 1. `SpokenWordVisualizer.ts` (GPU Shader)
Create high-performance fragment shaders mapping vocal tracking parameters:
*   `renderMode === 'Constellation'`: Plots active spectral components in a circular layout. Pitch controls frequency, envelope drives scale, formants deform the circumference.
*   `renderMode === 'FlowingRibbon'`: Feeds a continuous 1D trajectory (melody pitch path) into a feedback queue. Formant transitions shift color palettes dynamically.

### 2. State & Node Coordination
Add cleanup calls in `unregisterMediaElement` to ensure that hot-swapped or closed streams release hardware interfaces. Use:
```typescript
if (this.stream) {
  this.stream.getTracks().forEach(track => track.stop());
}
```

---

## 🚦 Phase Verification Plan

Verify development changes sequentially:
1. **Mathematical Check**: Run Vitest on DSP classes to check convergence and coefficient accuracy:
   ```bash
   npx vitest run src/dsp/__tests__/EnvelopeFollower.test.ts
   ```
2. **Type Safety**: Verify zero TypeScript compile warnings:
   ```bash
   npx tsc --noEmit
   ```
3. **Inter-port Auto-connection check**: Deploy to browser, add `AudioFile` source and connect its `audio_out` directly to `SpeechEnvelopeTracker`. Verify that the edge snaps seamlessly to folded groups.
4. **Signal Mapping Check**: Connect `SpeechEnvelopeTracker.envelope_out` to `Transform2D.scale`. Check that visual scale dynamically conforms to vocal syllable envelope inputs.
