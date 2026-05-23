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

## Test 3: The VideoMixer Quad-Blend & Inversion
**Objective:** Verify 4-channel composition blending, dummy fallback textures, accordion snap routing, and parameter-level unipolar inversion.

1.  **Setup**:
    *   Add a **Video File** source (Channel V1).
    *   Add a **Noise Source** (Channel V2).
    *   Leave Channels V3 and V4 disconnected.
    *   Add an **LFO** module.
2.  **Routing & Invert Mode**:
    *   `LFO.modulation_out` -> `VideoMixer.v1_alpha_cv` (Unipolar mode, Invert = ON, Amount = 1.0).
    *   Set the manual `V1 Alpha` slider on the VideoMixer to 1.0.
    *   Set the `V2 Level` knob to 0.5. Select `Add` mode for Channel V2.
3.  **Verification**:
    *   **Unipolar Inversion**: Confirm that as the LFO sine wave rises from 0.0 to 1.0, the composite opacity of the V1 Video File *decreases* from 1.0 to 0.0 (fades out). Disabling the `Invert` toggle should make it rise.
    *   **Dummy Fallback**: Confirm there are no console errors or black-outs from the disconnected V3 and V4 channels. The background blending should proceed smoothly.
    *   **Accordion Snapping**: Collapse the Channel V2 subgroup in the VideoMixer parameters. Confirm the incoming wire edge from the Noise Source dynamically snaps directly to the folded V2 header boundary without glitching coordinates.

## System Health Check
- **Resource Stability**: Run for 5 minutes. If the canvas "freezes" while audio continues, check for WebGPU Buffer leaks.
- **Audio Hot-Swap**: Change the source from Video to Webcam. Does the Audio Analyzer immediately start tracking the mic/new stream?
