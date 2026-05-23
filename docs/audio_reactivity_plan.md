# Terpsichore: Audio Reactivity Implementation Plan

This document details the architecture, DSP classes, and step-by-step module guidelines to implement **High-Fidelity Audio Reactivity & Vocal Tracking** in Terpsichore. It serves as a unified blueprint to maintain structural and mathematical consistency across multiple coding sessions and agent interactions.

---

## 🏗️ Architectural Overview

All audio analysis occurs on the CPU (logic/memory thread) using the **Web Audio API** and custom DSP helper classes. Calculated descriptors are written at high frequency to the `SignalDispatcher`'s active signal bus, immediately rendering zero-latency visual modulations via WebGPU.

```
       Web Audio API (AudioEngine)
                   │
                   ▼
  ┌─────────────────────────────────┐
  │      DSP Extractor Classes      │
  │  (Envelope, YIN, LPC, Timbre)   │
  └────────────────┬────────────────┘
                   │  calculates descriptors (60fps)
                   ▼
  ┌─────────────────────────────────┐
  │        SignalDispatcher         │
  │     (latestSignals Cache)       │
  └────────────────┬────────────────┘
                   │  consumes in getEffectiveParam
                   ▼
  ┌─────────────────────────────────┐
  │         WebGPU Renderer         │
  └─────────────────────────────────┘
```

---

## 1. Under-the-Hood DSP Classes (`src/dsp/`)

These pure TypeScript math utility classes are imported and run inside the audio nodes. They perform no direct rendering and have no UI representation.

### A. `EnvelopeFollower.ts`
Captures vocal envelope amplitude, prosody, and syllables.
*   **Math**: Exponential smoothing:
    $$y[n] = y[n-1] + \alpha \cdot (x[n] - y[n-1])$$
    where $\alpha$ is dynamic: $\alpha_{attack}$ if $x[n] > y[n-1]$, else $\alpha_{release}$.
*   **Coefficients**: Formulated by sample rate ($F_s$) and time constant ($\tau$ in seconds):
    $$\alpha = 1.0 - e^{-1.0 / (F_s \cdot \tau)}$$
*   **Dynamic Thresholding**: Rather than a static gate, maintains a slow-moving average of the noise floor to detect speech onsets reliably across quiet and loud rooms.

### B. `YinPitchDetector.ts`
Real-time monophonic pitch detection optimized for human vocals ($80\text{Hz} - 800\text{Hz}$).
*   **Algorithm**: **YIN (Autocorrelation-based)**:
    1.  **Difference Function**: Measures the squared difference between the signal and its shifted version:
        $$d_t(\tau) = \sum_{j=1}^{W} (x_j - x_{j+\tau})^2$$
    2.  **Cumulative Mean Normalized Difference**:
        $$d'_t(\tau) = \frac{d_t(\tau)}{\frac{1}{\tau} \sum_{j=1}^{\tau} d_t(j)}$$
    3.  **Thresholding**: Find the smallest lag $\tau$ where $d'_t(\tau)$ is below a threshold (typically $0.1$ to $0.15$).
    4.  **Parabolic Interpolation**: Refine the pitch peak location mathematically for high frequency resolution.

### C. `LpcFormantTracker.ts`
Analyzes vocal resonances ($F1$ and $F2$ formant peaks) to identify vowel shapes.
*   **Algorithm**: **Linear Predictive Coding (LPC)** via Levinson-Durbin:
    1.  Pre-emphasize the input speech buffer ($s'[n] = s[n] - 0.97 \cdot s[n-1]$).
    2.  Apply a Hamming window.
    3.  Calculate autocorrelation coefficients ($R$).
    4.  Solve the LPC filter coefficient polynomial ($A$) of order $P$ (typically $P = 10 - 12$ for a $16\text{kHz}$ speech bandwidth).
    5.  Locate polynomial roots (poles) to extract peak resonance frequencies ($F1$, $F2$, $F3$).
*   **Vowel Charting**: Map $F1$ ($300\text{Hz} - 1000\text{Hz}$) and $F2$ ($800\text{Hz} - 2500\text{Hz}$) coordinates onto a normalized $0.0 \to 1.0$ virtual grid.

### D. `SpectralTimbreExtractor.ts`
Calculates timbral shape metrics from the raw FFT bins.
*   **Spectral Centroid**: Sum of bin frequencies weighted by their amplitude. Represents brightness:
    $$f_c = \frac{\sum (f_i \cdot A_i)}{\sum A_i}$$
*   **Spectral Flatness**: Ratio of geometric mean to arithmetic mean of the spectrum. Measures tone vs. noise:
    $$g_f = \frac{\exp\left(\frac{1}{N}\sum \ln(A_i)\right)}{\frac{1}{N}\sum A_i}$$
*   **Sibilance Detector**: Measures the ratio of high-frequency energy ($4\text{kHz} - 12\text{kHz}$) to low-frequency energy ($100\text{Hz} - 1\text{kHz}$).

---

## 2. Discrete UI Modules & Phased Implementation

Develop modules in these sequential steps to establish foundations before constructing complex visualizers.

### Phase 1: Foundational Cadence & Splitting

#### 1. Speech Envelope Tracker (Discrete Module)
Tracks physical timing, cadence, and breath boundaries.
*   **UI Representation**: High-density console strip. Vertical peak meter + syllabic rate counter.
*   **In-Ports**:
    *   `audio_in` (Audio)
*   **Out-Ports**:
    *   `envelope_out` (Modulation, $0.0 \to 1.0$ following amplitude)
    *   `cadence_out` (Modulation, syllables/sec, $0.0 \to 1.0$)
    *   `speech_trig` (Trigger, fires when onset thresholds are met)
    *   `silence_trig` (Trigger, fires on phrase pauses)
*   **Settings**: Attack (ms), Release (ms), Sensitivity (dB).

---

### Phase 2: Tone, Pitch, & Resonant Formants

#### 2. Vocal Pitch Tracker (Discrete Module)
Monophonic frequency tracker for melodies and spoken pitches.
*   **UI Representation**: LCD readout displaying note letters (e.g., "A4", "C#3") and pitch-bend bar.
*   **In-Ports**:
    *   `audio_in` (Audio)
*   **Out-Ports**:
    *   `pitch_hz` (Modulation, raw $Hz$)
    *   `pitch_midi` (Modulation, scaled note pitch $0.0 \to 1.0$)
    *   `stability` (Modulation, $1.0$ for steady singing, $0.0$ for speech or sibilants)
    *   `note_change_trig` (Trigger, fires on new note triggers)

#### 3. Vowel / Formant Tracker (Discrete Module)
Detects vowel shapes (Ah, Oh, Ee, Oo).
*   **UI Representation**: Small 2D scatter-plot grid representing the Formant space ($F1$ vs $F2$).
*   **In-Ports**:
    *   `audio_in` (Audio)
*   **Out-Ports**:
    *   `formant_f1` (Modulation, throat opening depth)
    *   `formant_f2` (Modulation, mouth/tongue position)
    *   `vowel_x` / `vowel_y` (Modulation, coordinate grid mapping vowel shifts)
    *   `vowel_change_trig` (Trigger, fires when vowel states transition)

---

### Phase 3: The "Crown Jewel" Vocal Visualizer

#### 4. Spoken Word Visualizer (Compound Module)
Designed specifically to accompany poetry, spoken word, and literary performance. Hides under-the-hood complexity to offer a cohesive creative experience.
*   **Internal Machinery**: Synthesizes output from all Phase 1 & 2 classes.
*   **Visual Interface**: Integrated 2D spectrogram waterfall or radial vowel constellation visualization showing vocal characteristics directly inside the rack interface.
*   **In-Ports**:
    *   `audio_in` (Audio)
*   **Out-Ports**:
    *   `cadence` (Modulation, flow pace)
    *   `timbre_brightness` (Modulation, maps spectral centroid)
    *   `sibilance` (Modulation, maps breath noise ratio)
    *   `pitch_path` (Trajectory, coordinate pair of the vocal melody)
    *   `onset_pulse` (Trigger, fires on hard consonants)
*   **Visualizer Controls**: Preset selector ("Constellation", "Flowing Ribbon", "Particle Cascade") mapping voice outputs directly to WebGPU pipelines.

---

## 3. Structural & Architectural Coding Rules
When coding these audio features, subagents must adhere to the following:
1.  **DSP Performance**: Autocorrelation and LPC math must be optimized to prevent audio buffer underruns. Use fast sliding-window arrays rather than allocating memory on every frame.
2.  **Dispatcher Sync**: All analyzed values must be committed directly to `latestSignals` in the `SignalDispatcher` high-frequency path inside `src/state/SignalDispatcher.ts`.
3.  **Port Definitions**: Every new module MUST have exact port listings in `src/components/NodeGraph/portDefs.ts` mapping to their respective `SignalType`.
4.  **Audio State Safety**: If an audio capture device is hot-swapped, the underlying Web Audio stream must close gracefully to prevent memory leaks and thread crashes.
