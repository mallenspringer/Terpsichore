# Implementation Plan: Signal Dispatcher & Audio Pipeline
**Status: Complete (Verified 2026-05-04)**

## Overview
Implement a centralized **Signal Dispatcher** that acts as the "JIT Compiler" for the Terpsichore logic layer. It will handle the routing and translation of signals (Video, Audio, Modulation, Triggers) between modules with minimal latency and high efficiency.

## Core Architecture: The "JIT Dispatcher"
Instead of simple value copying, the Dispatcher will treat the signal graph as a mathematical pipeline.

### 1. Input/Output Contracts
Every port will define a contract:
- **Type**: `video` | `audio` | `modulation` | `trigger`
- **Range**: Unipolar (0..1) or Bipolar (-1..1).
- **Scale**: Linear, Logarithmic, or Exponential.

### 2. Implicit Signal Conversion
When a wire connects two incompatible ports, the Dispatcher inserts a "Virtual Converter":
- **Audio -> Modulation**: High-frequency Peak Tracking (60Hz sample of highest amplitude).
- **Modulation -> Trigger**: Threshold crossing detection with a "Rolling Mean" (Ring Buffer) for debouncing/smoothing.
- **Trigger -> Modulation**: ADSR/Envelope generation (e.g., a pulse triggers a decaying 1.0 to 0.0 value).

### 3. Execution Pipeline (The Heartbeat)
The Dispatcher runs on the `requestAnimationFrame` loop **BEFORE** the `Renderer`.
1. **Gather**: Pull raw data from Audio Engine, Video clocks, and UI.
2. **Compile**: Convert the active graph of wires into a flat array of "Signal Functions."
3. **Execute**: Run the math for all signals.
4. **Broadcast**: Update the `signalValues` registry in the store.
5. **Render**: The Renderer uses the final values to draw the GPU frame.

## The Audio Engine Integration
- Use a single global `AudioContext`.
- For each video layer, create a `MediaElementAudioSourceNode`.
- Use `AnalyserNode` for Peak/RMS tracking to feed the Dispatcher.
- Implement an `audio` signal type (Cyan: `#00d4ff`) for routing audio through processing modules before output.

## Temporal Management (Smoothing)
- **Ring Buffers**: For any smoothing operation (like a 10-frame mean), use a fixed-size ring buffer to keep execution $O(1)$.
- **Latency Compensation**: The "Heartbeat" architecture ensures that modulation-to-visual latency is strictly 1 frame (~16ms).

## Success Metrics
- A Video module outputting audio to a "Peak Follower" module.
- The Peak Follower outputting modulation to a "Layer Opacity" fader.
- The visuals pulse in perfect sync with the music.
