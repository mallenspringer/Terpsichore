# Signal Testing Suite

Use these tests to verify the integrity of the Terpsichore modulation pipeline after any architectural changes.

## Test 1: The "Recursive Pulse"
**Objective:** Verify Video-to-CV feedback, parameter summing, and signal smoothing.

1.  **Setup**:
    *   Add a **Shape Generator** (Source) -> White Circle.
    *   Add a **Luma Splitter** effect.
    *   Add a **Transform 2D** effect.
    *   Add an **Audio Analyzer** effect.
2.  **Routing**:
    *   `Shape.video_out` -> `LumaSplitter.video_in`.
    *   `LumaSplitter.video_out` -> `Transform.video_in`.
    *   `LumaSplitter.high_out` (CV) -> `Transform.scaleX`.
    *   `AudioAnalyzer.out` (CV) -> `Transform.scaleX` (Summing).
3.  **Verification**:
    *   **Summing**: Does the circle pulse to BOTH audio hits and its own brightness?
    *   **Bipolarity**: Toggle `Bipolar` on the Audio input. Does the scale shrink/grow around the center?
    *   **Smoothing**: High `Smoothing` on the Audio Analyzer should result in "liquid" movement.

## Test 2: The "RGB Chromatic Displace"
**Objective:** Verify discrete channel routing and multi-port logic.

1.  **Setup**:
    *   Add a **Video File** source (high color contrast).
    *   Add a **Color RGB** effect.
    *   Add a **Transform 2D** effect.
    *   Add a **Color Adjust** effect.
2.  **Routing**:
    *   `Video.video_out` -> `ColorRGB.video_in`.
    *   `ColorRGB.r_out` -> `Transform.translateX`.
    *   `ColorRGB.g_out` -> `Transform.translateY`.
    *   `ColorRGB.b_out` -> `ColorAdjust.saturation`.
3.  **Verification**:
    *   **Independence**: Do the X and Y meters move differently based on the video's red/green balance?
    *   **Sensitivity**: Do the `Amount` knobs correctly scale the displacement?

## System Health Check
- **Resource Stability**: Run for 5 minutes. If the canvas "freezes" while audio continues, check for WebGPU Buffer leaks.
- **Audio Hot-Swap**: Change the source from Video to Webcam. Does the Audio Analyzer immediately start tracking the mic/new stream?
