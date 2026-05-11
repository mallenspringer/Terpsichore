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
  - **2-Pass Execution:**
    - **Pass 1 (Fixed):** Populates `signalValues` from Sources (e.g., `audio_out`), Modulators (e.g., LFO `value`), and Inter-layer inputs.
    - **Pass 2 (Dynamic):** Executes the JIT-compiled pipeline of edges to propagate signals through the graph.
  - **Single Source of Math:** Handles all signal scaling (Amount), Bipolar conversion, and Smoothing.
  - **Direct Mutation:** Mutates `layer.signalValues` every frame (`requestAnimationFrame`) for zero-latency rendering.
  - **UI Bridge:** Throttles store updates to ~10fps to keep the React tree performant.
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

## Testing & Stability

### 1. The Safety Net (`src/state/__tests__/`)
- **Vitest:** The project uses Vitest + jsdom for logic testing.
- **Scope:** All core signal dispatching, inter-layer routing, and graph auto-wiring logic is covered by unit tests.
- **Command:** Run `npm test` to verify the engine's integrity before starting a new feature.

### 2. Store-Driven Graph
- **Event-Driven:** Graph re-wiring is triggered by store actions (`setSource`, `addEffect`), NOT React `useEffect`.
- **Selectors:** Always use specific Zustand selectors (e.g., `useEngineStore(s => s.layers)`) to prevent global re-render cascades during signal updates.
