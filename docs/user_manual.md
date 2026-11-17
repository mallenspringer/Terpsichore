# Terpsichore User Manual (Draft)

> **Living Document Notice:** This draft is populated incrementally as new modules and authoring conventions are built. Pre-existing modules and older visualizers have placeholder sections marked below for upcoming documentation review passes.

---

## Table of Contents
1. [Audio Input & Vocal Processing](#1-audio-input--vocal-processing)
2. [Spoken Word & Performative Typography](#2-spoken-word--performative-typography)
   - [Text Bank (`TextCue`) *(Placeholder)*](#text-bank-textcue-placeholder)
   - [Poetry Sequencer (`Poetry Seq`)](#poetry-sequencer-poetry-seq)
   - [Blackout / Erasure Poetry Synthesizer (`Blackout`)](#blackout--erasure-poetry-synthesizer-blackout)
   - [Text Authoring Markup: Bracket Pinning (`[word]` / `[[word]]`)](#text-authoring-markup-bracket-pinning)
3. [Pre-Existing Core Modules *(Pending Documentation Pass)*](#3-pre-existing-core-modules-pending-documentation-pass)

---

## 1. Audio Input & Vocal Processing

### Audio Input (`Audio In`) — Built-In Noise Gate
Both the Layer Source and Effect versions of `Audio In` include an input-stage noise gate ahead of downstream audio buses and vocal trackers:
- **Noise Gate (Default: Off):** Enable to choke room hum, fan noise, or ambient bleed before audio reaches `Vocal Env`, `Pitch Track`, `Vowel Track`, or `Poetry Seq`.
- **Mode (`Voice` / `Music`):**
  - **Voice:** Crisp attack (`8 ms`), tight hold (`90 ms`), and fast release (`250 ms`) tuned to clamp noise cleanly between spoken phrases.
  - **Music:** Slightly faster transient catch (`5 ms`) with longer hold (`160 ms`) and gentler release (`550 ms`) for musical tails.
- **Gate Thresh (`-80 dB` to `0 dB`, default `-40 dB`):** RMS threshold in decibels (includes `3 dB` close hysteresis to prevent threshold chatter). MIDI-mappable via `gateThresholdDb`.

---

## 2. Spoken Word & Performative Typography

### Text Bank (`TextCue`) *(Placeholder)*
*Multi-bank text storage (`24` banks × up to `64` cards per bank) with per-card triggers (`card_trig`), whole-bank switching (`bank_trig`), MIDI pads, and downstream sync. Full UI and workflow walkthrough to be added in a documentation review pass.*

---

### Poetry Sequencer (`Poetry Seq`)
Located under **Audio → `Poetry Seq`**. Breaks pasted prose/poetry or an incoming `Text Bank` (`text_in`) stream into sequential tokens and clocks steps directly from your voice cadence, speech pauses, or external CV triggers.

#### Patch Ports
- **Inputs:** `audio_in` (speech feed), `text_in` (from `Text Bank` or upstream text node), `step_trig`, `prev_trig`, `reset_trig`.
- **Outputs:** `text_out` (wire to `TextMaker`, `Glyph Map`, or `Blackout`), `step_out` (pulse per advance), `phrase_out`, `caesura_out`, `bank_step_out` (wire to `Text Bank` `card_trig`/`bank_trig`), `cadence_cv`, `progress_cv`, `tension_cv`.

#### Cadence Modes
- **`RESUME (C)` (Default):** Advances one step when your voice **resumes** after a silence longer than **`BRTH` ms** (bridges short intra-word stops below **`GAP` ms**).
- **`PAUSE (C)`:** Advances one step *mid-silence* as soon as a pause crosses **`BRTH` ms** (teleprompter look-ahead behavior).
- **`SYLL (A)`:** Advances on vocalic syllable peaks (`300–3000 Hz`) above **`PROM` dB**, rate-limited by **`LOCK` ms**.
- **`EXT TRIG`:** Responds solely to `step_trig` / `prev_trig` / `reset_trig` ports or manual buttons.

#### Tokenization & Reveal Options
- **Unit (`Word` | `Line` | `Stanza`):** Blank lines delimit stanzas; single line breaks delimit lines.
- **Output Format (`Single` | `Accum Line` | `Accum Stanza`):** Emit only the active unit, accumulate words across the current line, or accumulate line-by-line across the current stanza.
- **End & Caesura Actions:** Configure behavior at the end of a passage (`Next Bank`, `Loop`, `Hold`) and when a long dramatic silence crosses **`CAES` ms** (`Out Only`, `Step`, `Reset`, `Next Bank`).

---

### Blackout / Erasure Poetry Synthesizer (`Blackout`)
Located under **Effects → `Blackout`**. Converts prose or poems from `Text Bank` (`text_in`), `Poetry Seq`, or local prose into live, audio/CV-reactive blackout and erasure poetry using per-word GPU rendering (`512`-word cap per card).

#### Patch Ports
- **Inputs:** `video_in` (optional backdrop footage), `text_in` (connect to `Text Bank` / `Poetry Seq`), `palette_in` (`ColorPalette`), `card_trig`, `bank_trig`, `density_cv`, `entropy_trig`, `flash_trig`, `cursor_x_cv`, `cursor_y_cv`, `radius_cv`, `jitter_cv`, `word_dur_cv` (modulates per-word animation duration), `ramp_rate_cv` (modulates progressive sweep rate), `ramp_reset_trig`.
- **Outputs:** `video_out`, `matte_out` (selectable **Surviving Words** or **Redaction Bars** mask for `Key Mixer` / `UV Displace`), `survivor_cv` (`0..1` surviving fraction), `reroll_out` (trigger on seed reroll or card change), `ramp_cv` (current sweep progress density `0..1`), `ramp_done_out` (pulse when Sweep hits `Ceil`, wireable to `card_trig`).

#### Progressive Card Sweep & Per-Word Animation Duration
- **Sweep Mode (`Off` | `Floor → Ceil (Once)` | `Loop` | `Ping-Pong`):** Automatically progresses blackout density from **`FLR %`** (`0%` default) up to **`CEIL %`** (`85%` default) over **`TIME s`**, modulated live by **`ramp_rate_cv`**. With **`Rst/Card`** checked (default), every new `Text Bank` card resets cleanly to **`FLR %`** before erasing toward **`CEIL %`**. Wire **`ramp_done_out` -> `card_trig`** to auto-advance cards after each erasure pass!
- **Per-Word Anim (`WORD ms` + `word_dur_cv`):** Sets the exact transition duration (`20–3000 ms`, default `400 ms`) for *each individual word* to complete its blackout animation (fade, dissolve, marker stroke swipe, whiteout bloom, or bleach smudge).

#### Independent `Text Bank` Stepping
When wired from `Text Bank.text_out -> Blackout.text_in`, two separate stepping paths appear directly on the node (alongside the `card_trig` / `bank_trig` ports):
- **Card (`◀` / `Card X/Y` / `▶` & `card_trig`):** Cycles strictly within the currently active bank without jumping banks.
- **Bank (`◀` / dropdown / `▶` & `bank_trig`):** Switches between populated banks independently while preserving card positions.

#### Selection Modes
- **`ENTROPY`:** Assigns each word a deterministic rank from `Seed` + `Len Bias` (`-1` favors short words; `+1` favors longer anchor words). Sweeping `Blackout %` (`density_cv`) smoothly drops or restores words without random flickering. Click `🎲 #N` or pulse `entropy_trig` to reroll.
- **`SPOT XY`:** Carves a circular spotlight at `(Spot X, Spot Y)` (`cursor_x_cv` / `cursor_y_cv`) with adjustable radius & feather—ideal with `Vowel Track` (`vowel_x`, `vowel_y`) or LFOs.
- **`WALK`:** Sweeps a sequential frontier forward/backward across words via `Blackout %` / `density_cv`.
- **`FLASH`:** Holds heavy blackout ink until `flash_trig` (or audio transients) punches concealed words visible across `Flash Rel ms`.

#### Visual Styles (`Style` Selector)
1. **Sharpie Zine** — Uneven organic black marker strokes with ink bleed and bridged spaces across consecutive redacted words.
2. **Classified Redact** — Clean typewriter blocks and hard rectangular censor bars.
3. **Cut-Up Collage** — Slightly angled opaque paper/tape strips with cast shadows.
4. **Fade Out** — Smooth opacity fade of erased words (optional faint ghost via `Style %`).
5. **Ash Dissolve** — Stippled grain erosion dissolving concealed words pixel-by-pixel.
6. **Whiteout Glow** — Concealed words bloom outward into luminous haze until washed out and obscured.
7. **Spotlight Negative** — Inverse mode: dims concealed text to ash while surviving words emit luminous halos.
8. **Acid Erasure** — Bleach/ink-wash smudge dissolving concealed tokens into paper fiber haze.
9. **CRT Signal Censor** — Dark phosphor text where erased words break into animated scanline static blocks.

> **Tip:** Enable **`Transp BG`** (or drop **`Paper`** to `0%`) to knock out the paper surface across *all 9 styles*—leaving crisp typography, redaction bars, drop shadows, glows, and static floating cleanly over live `video_in` feeds or underlying layers, or send **`matte_out`** to `Key Mixer`.

---

### Text Authoring Markup: Bracket Pinning
*(For `Text Bank` cards and local text used with `Blackout`)*

You can embed lightweight bracket markup inside `Text Bank` cards or Blackout source text to control which words are protected or pre-censored while performing. The outer brackets are stripped cleanly from the rendered typography:

| Syntax | Behavior | Example Input | Rendered Words & Behavior |
| :--- | :--- | :--- | :--- |
| `[word]` or `[multi word phrase]` | **Anchor / Pin Visible:** Words inside single brackets always remain visible and are exempt from density/entropy/walk erasure (unless forced off via an optional *"Ignore Locks"* toggle). | `The [river] remembers [every stone]` | `The` and `remembers` can be redacted normally; **`river`** and **`every stone`** stay anchored on screen. |
| `[[word]]` or `[[phrase]]` | **Pre-Redacted:** Always starts censored/erased regardless of low density settings (except during explicit unmasked inspection or *Glimpse Flash* full-page overrides). | `Under [[classified]] glass` | **`classified`** renders censored from `0%` density upward. |
| `\[` or `\]` | **Literal Brackets:** Backslash-escape if you intentionally want square brackets rendered on canvas. | `\[Exhibit A\]` | Renders `[Exhibit A]` verbatim. |

#### Authoring Tips for Live Shows
1. Use single brackets sparingly (`2–5` structural anchors per card) so `Entropy Reroll` still discovers surprising poems around fixed thematic spine words.
2. When sharing a single `Text Bank` card between `TextMaker` (clean reading) and `Blackout` (erasure), note whether other text renderers display literal brackets cleanly — keep `[bracket]` markup primarily in dedicated Blackout banks until shared bracket-stripping is enabled globally if desired.

---

## 3. Pre-Existing Core Modules *(Pending Documentation Pass)*
*Sections below will be filled out during scheduled manual review passes:*
- `Audio Gate`, `Audio to CV`, `Spectral Splitter`, `Oscilloscope`, `Waterfall Spectrogram`
- `Vocal Env` (`SpeechEnvelopeTracker`), `Pitch Track` (`VocalPitchTracker`), `Vowel Track` (`VowelFormantTracker`), `Vocal Console` (`SpokenWordVisualizer`)
- `TextMaker`, `Glyph Map`, `Outline`, `Luma Bands`, `Chroma Bands`
- `Grass Field`, `Arabesque`, `Particle Cloud`, `Feedback Pro`, `Bad Analog`, `Data Mosh`, `Key Mixer`, `UV Displace`
