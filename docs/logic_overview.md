# Logic Overview & Handoff Guide

This document explains the internal engine architecture of Terpsichore to ensure continuity between different AI agents.

## Core Architectural Principle
Terpsichore uses a **Strictly Decoupled Engine**. 
- **Logic & Signal Flow:** Processed at 60fps in pure TypeScript/Memory.
- **Rendering:** Pulls data directly from logic objects to avoid the overhead of the React lifecycle.
- **UI & Presentation:** React/Zustand act as a "surface" that reflects the state of the engine at a throttled rate (10fps).

## Key Components

### 1. AudioEngine (`src/state/AudioEngine.ts`)
- **Role:** Singleton manager for the Web Audio API.
- **Logic:** Manages `AnalyserNode` instances per layer. Calculates rolling peak volume for sources.
- **Interface:** `getPeakVolume(layerId)` provides a 0.0–1.0 value used by the Dispatcher.

### 2. SignalDispatcher (`src/state/SignalDispatcher.ts`)
- **Role:** The "Heartbeat" and JIT Compiler.
- **Logic:**
  - Compiles the node graph into an optimized execution pipeline.
  - **Single Source of Math:** Handles all signal scaling (Amount), Bipolar conversion, and Smoothing.
  - **Direct Mutation:** Mutates `layer.signalValues` every frame (`requestAnimationFrame`). This allows the Renderer to see updates with zero latency.
  - **UI Bridge:** Throttles the update to the Zustand store (using `updateLayerSignals`) to ~10fps to keep the UI responsive without tanking FPS.
- **Handoff Tip:** All CV/Modulation math happens here. The Renderer just consumes the final value.

### 3. Renderer (`src/renderer/Renderer.ts`)
- **Role:** WebGL/WebGPU visual processor.
- **Logic:** 
  - Every frame, it reads from `layer.signalValues`.
  - **Analysis:** Performs GPU-based analysis (Luma/Color) and writes raw data to `latestLumaValues` for the Dispatcher to read.
  - **Aggregation:** Uses `getEffectiveParam()` to combine the **Base Slider Value** with the **Pre-Calculated Modulation Signal** from the Dispatcher.
- **Handoff Tip:** Ensure the Renderer only performs analysis; all modulation math belongs in the Dispatcher.

### 4. NodeGraph & PortDefs (`src/components/NodeGraph/`)
- **Role:** UI representation and port metadata.
- **Logic:** Defines which modules can connect to which ports.
- **Handoff Tip:** Always check `portDefs.ts` when adding new signals to ensure IDs match between the UI and the Renderer.
