# Terpsichore Module Reference

This document provides a comprehensive overview of all modules available in the Terpsichore engine, detailing their parameters, signal handling, and visual behaviors.

---

## 1. Sources
Modules that generate or load video/image data.

### Shape Generator (⬜)
Generates procedural geometric shapes.
*   **Parameters**:
    *   **Shape Type**: Polygon, Star, Circle, Square.
    *   **Sides**: Number of points (for polygons/stars).
    *   **Roundness**: Rounds off sharp corners.
    *   **Convexity**: Inner radius for star shapes.
    *   **Stroke Mode**: `Classic` (Gate-like filling) or `Hollow` (Outline rendering).
    *   **Stroke Threshold**: Controls the thickness or filling cutoff.
*   **Signal Behavior**:
    *   Outputs a high-contrast video signal.
    *   `Stroke Threshold` is often used as a modulation target for rhythmic pulse effects.
*   **Use Cases**: Creating masks, minimalist geometric patterns, or foundational pulses for feedback loops.

### Video / Image File (📹 / 🖼️)
Loads local media assets.
*   **Parameters**:
    *   **File Path**: Selected via OS dialog.
    *   **Playback Speed**: 0.1x to 4.0x.
    *   **Loop**: Toggle for continuous playback.
    *   **Object Fit**: `Cover` or `Contain`.
*   **Signal Behavior**: Standard video output. Revokes Blob URLs on module removal to prevent memory leaks.

### Webcam (📷)
Captures live video feed.
*   **Parameters**:
    *   **Device ID**: Dropdown for available system cameras.
*   **Visual Behavior**: Real-time feedback with minimal latency. High-contrast subjects work best for downstream LumaKey or Splitter modules.

### Noise Source (🌫️)
Generates 2D procedural noise textures (GPU-bound).
*   **Parameters**:
    *   **Noise Type**: Perlin, Simplex, White.
    *   **Scale**: Zoom level of the noise grain.
    *   **Evolution**: Speed of the temporal morphing.
*   **Use Cases**: Creating organic backgrounds, displacement maps, or complex mask textures.

---

## 2. Effects
Spatial and color processors that manipulate incoming video signals.

### Transform 2D (↔️)
Primary spatial manipulator.
*   **Parameters**:
    *   **Translate X/Y**: Position offset (-1 to 1 range).
    *   **Scale X/Y**: Dimensions (0.1 to 5.0).
    *   **Rotation**: Angle in degrees.
    *   **Spin**: Continuous automatic rotation speed.
*   **Signal Logic**: Scale can be "linked" via UI checkbox to maintain aspect ratio during modulation.

### Kaleidoscope (✺)
Radial reflection effect.
*   **Parameters**:
    *   **Count**: Number of mirror segments (1 to 32).
    *   **Angle**: Rotation of the mirror plane.
    *   **Zoom**: Scale of the reflected content.
*   **Signal Scaling**: `Count` input uses a **Logarithmic Scaling** logic:
    *   `Value = Manual * (Max/Manual)^Modulation`
    *   Allows smooth, musical transitions from low segment counts to dense patterns.

### Pattern (▦)
Tiling and grid layout engine.
*   **Parameters**:
    *   **Count X/Y**: Number of tiles per axis (Log-scaled).
    *   **Spacing X/Y**: Gaps between tiles.
    *   **Offset X/Y**: Spatial phase shift.
    *   **Sync Toggles**: Links X and Y parameters for unified grid scaling.
    *   **Mirror X/Y**: Alternates orientation of every other tile.
*   **Signal Behavior**: When **Sync** is enabled, modulation signals from both X and Y jacks are **summed** before being applied to both axes.

### Color RGB (RGB)
Channel manipulation and static color generation.
*   **Modes**:
    *   **Add**: Offsets the channel value.
    *   **Mult**: Scales the channel intensity (ring modulation for color).
*   **Parameters**: Individual R, G, B levels and modulation jacks.
*   **Use Cases**: Color grading, channel swapping, or generating solid color backgrounds for masks.

---

## 3. Utility
Control signal generators and logic processors (CPU-bound).

### LFO (〜)
Low-Frequency Oscillator for modulation.
*   **Waveforms**: Sine, Square, Triangle, Saw.
*   **Speed Ranges**: `Low` (Slow drifts), `High` (Audio-rate/vibrato).
*   **Bipolar Toggle**: Switches output between `0 to 1` and `-1 to 1`.
*   **Global Sync**: Resets phase when the Global Reset signal is triggered.

### Signal Math (∑)
Algebraic processor for two control signals.
*   **Operators**:
    *   **Add / Subtract**: Mixing and biasing.
    *   **Multiply**: Signal scaling and ring modulation.
    *   **Divide**: Ratio-based control.
    *   **Min / Max**: Peak limiting or signal selection.
    *   **Pow**: Exponential curving (useful for snappier transients).
*   **Parameters**: `Manual A` and `Manual B` act as baseline offsets for the input ports.

### Noise (🎲)
Stochastic control signal generator (CPU-bound).
*   **Noise Types**:
    *   **White**: Pure randomness every frame.
    *   **Pink**: Balanced spectral density (1/f), less "hiss" than white noise.
    *   **Brown**: Random walk/Brownian motion, very smooth and drifting.
    *   **Perlin**: Smooth 1D gradient noise.
*   **Parameters**:
    *   **Frequency**: Rate of change (evolution speed).
    *   **Amplitude / Offset**: Scaling and bias.
    *   **Bipolar Toggle**: Outputs between `0 to 1` or `-1 to 1`.
*   **Use Cases**: Adding "jitter" to parameters, simulating organic camera shake, or subtle drifting modulation.

### Logic Gate (⊦)
Comparison-based signal processing.
*   **Operators**: AND, OR, XOR, NAND, NOR.
*   **Thresholds**: Dual thresholds (A and B) to convert continuous modulation into binary (0 or 1) gates.
*   **Use Cases**: Creating complex rhythmic patterns by combining two LFOs or Audio Analyzers.

### Inverter (⇅)
Flips signal polarity or video colors.
*   **Modes**:
    *   **Video**: Inverts RGB channels.
    *   **CV**: Inverts modulation values (`1.0 - x` for unipolar, `-x` for bipolar).
*   **Trigger Modes**: `Momentary` (while button/gate is held) or `Latch` (toggles on rising edge).

### Path (🛤️)
Trajectory and movement generator.
*   **Modes**: `Physics` (Drift and momentum), `Wander` (Perlin-based random walk).
*   **Output**: Sends a `Trajectory` signal (X/Y pair) compatible with Transform and Spawn modules.

---

## 4. Audio
Sound analysis and system capture.

### Audio Analyzer (📊)
Converts volume peaks into modulation signals.
*   **Parameters**:
    *   **Sensitivity**: Gain for the incoming audio.
    *   **Smoothing**: Temporal averaging (RMS-like) to remove jitter.
    *   **Logarithmic**: Applies log-scaling to the peak value to better match human hearing/decibel perception.
*   **Signal Output**: `0.0 to 1.0` modulation signal based on the current layer's audio peak.

---

## 5. System Nodes
Specialized nodes for routing.

### Layer Input / Output (⎆)
Routes signals between layers.
*   **Behavior**:
    *   Outputs are stored in a global `interLayerBus` in the `SignalDispatcher`.
    *   Inputs pull from this bus at the start of the dispatch cycle.
    *   Enables complex cross-layer modulation (e.g., Layer 1's audio peak controlling Layer 3's rotation).
