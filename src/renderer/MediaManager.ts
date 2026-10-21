import { AudioEngine } from '../state/AudioEngine';
import { useEngineStore } from '../state/store';
import {
  LayerState,
  VideoURLSource,
  VideoFileSource,
  WebcamCaptureSource,
  ImageLoaderSource,
  ImageFileSource,
} from '../state/types';

export class MediaManager {
  public videoElements: Record<string, HTMLVideoElement> = {};
  public audioElements: Record<string, HTMLAudioElement> = {};
  public activeStreams: Record<string, MediaStream> = {};
  public imageElements: Record<string, HTMLImageElement> = {};
  public imageBitmaps: Record<string, ImageBitmap> = {};
  public activeDeviceIds: Record<string, string> = {};
  public isSeeking: Record<string, boolean> = {};

  private wasPaused = false;
  private lastResetSignal = 0;

  public getMediaElement(key: string): HTMLVideoElement | HTMLAudioElement | null {
    return this.videoElements[key] || this.audioElements[key] || null;
  }

  public getMediaProgress(key: string): { currentTime: number; duration: number } {
    const el = this.getMediaElement(key);
    if (el) {
      return { currentTime: el.currentTime, duration: el.duration };
    }
    return { currentTime: 0, duration: 0 };
  }

  public syncMediaPlayback(
    el: HTMLAudioElement | HTMLVideoElement,
    src: any,
    isMutedFromLayer: boolean,
    key: string
  ) {
    const speed = typeof src.playbackSpeed === 'number' && isFinite(src.playbackSpeed) ? src.playbackSpeed : 1.0;
    el.playbackRate = speed;
    el.loop = false; // We handle loop manually for start/end flags

    const loopStart = src.loopStart ?? 0;
    const loopEnd = src.loopEnd && src.loopEnd > loopStart ? src.loopEnd : el.duration || Infinity;

    const lastTime = (el as any).__lastTime ?? 0;
    const delta = el.currentTime - lastTime;
    const isOrganicPlayback = delta > 0 && delta < 1.0;
    const layerIsSeeking = !!this.isSeeking[key];

    // Manual loop logic
    if (
      src.playState === 'play' &&
      src.loop &&
      !layerIsSeeking &&
      !isNaN(el.duration) &&
      el.duration > 0.1 &&
      el.currentTime >= loopEnd &&
      isOrganicPlayback &&
      lastTime < loopEnd
    ) {
      el.currentTime = loopStart;
    }

    if (
      src.playState === 'play' &&
      src.loop &&
      !layerIsSeeking &&
      !isNaN(el.duration) &&
      el.duration > 0.1 &&
      el.currentTime >= el.duration - 0.05
    ) {
      el.currentTime = loopStart;
      el.play().catch(() => {});
    }

    if (
      src.playState === 'play' &&
      el.paused &&
      !layerIsSeeking &&
      el.currentTime < (el.duration || Infinity) - 0.05 &&
      !useEngineStore.getState().isGlobalPaused
    ) {
      el.play().catch(() => {});
    }

    if (src.playState === 'pause' && !el.paused) el.pause();
    if (src.playState === 'stop') {
      if (!el.paused) el.pause();
      if (!layerIsSeeking && Math.abs(el.currentTime - loopStart) > 0.01) {
        el.currentTime = loopStart;
      }
    }

    (el as any).__lastTime = el.currentTime;
    this.applyAudioState(el, src, isMutedFromLayer, key);
  }

  public applyAudioState(
    el: HTMLAudioElement | HTMLVideoElement,
    src: any,
    isMutedFromLayer: boolean,
    key: string
  ) {
    const globalMute = useEngineStore.getState().globalAudioMuted;
    const isModuleMuted = !!(src.audioMuted || src.muted);
    const shouldMute = isModuleMuted || isMutedFromLayer || globalMute;

    // Physical element level mute & volume clamping to prevent rogue direct-to-speaker leaks
    el.muted = shouldMute;
    el.volume = shouldMute ? 0 : 1.0;

    const ae = AudioEngine.getInstance();
    ae.setModuleMute(key, isModuleMuted);
    ae.setLayerMute(key, isMutedFromLayer);
    ae.setMasterMute(globalMute);
  }

  public manageMediaSource(key: string, source: any): HTMLVideoElement | ImageBitmap | null {
    // 1. Cross-type Cleanup (Video -> Audio or vice versa)
    if (source.type === 'AudioInput' || source.type === 'AudioFile' || source.type === 'SystemAudio') {
      const vid = this.videoElements[key];
      if (vid && !vid.paused) {
        vid.pause();
        vid.src = '';
        vid.srcObject = null;
      }
    } else if (source.type === 'VideoURL' || source.type === 'VideoFile' || source.type === 'WebcamCapture') {
      const aud = this.audioElements[key];
      if (aud && !aud.paused) {
        aud.pause();
        aud.src = '';
      }
    }

    if (source.type === 'VideoURL' || source.type === 'VideoFile' || source.type === 'WebcamCapture') {
      let vid = this.videoElements[key] as any;
      if (!vid) {
        vid = document.createElement('video');
        vid.muted = true;
        vid.playsInline = true;
        vid.style.position = 'absolute';
        vid.style.opacity = '0';
        vid.style.pointerEvents = 'none';
        vid.style.width = '1px';
        vid.style.height = '1px';
        document.body.appendChild(vid);
        vid.onerror = () =>
          console.error(`Video Error on Node ${key}:`, vid.error?.message, 'Code:', vid.error?.code);
        vid.onloadedmetadata = () => {};
        this.videoElements[key] = vid;

        // Register with AudioEngine for signal dispatching immediately
        AudioEngine.getInstance().registerMediaElement(key, vid);
      }

      if (source.type === 'VideoURL') {
        const src = source as VideoURLSource;
        if (src.videoUrl && vid.__lastSrc !== src.videoUrl && !vid.srcObject) {
          vid.pause();
          vid.srcObject = null;
          vid.crossOrigin = 'anonymous';
          vid.src = src.videoUrl;
          vid.__lastSrc = src.videoUrl;
          vid.load();
        }
        this.syncMediaPlayback(vid, src, src.audioMuted || (source as any)._layerAudioMuted, key);
      } else if (source.type === 'VideoFile') {
        const src = source as VideoFileSource;
        if (src.fileUrl && vid.__lastSrc !== src.fileUrl && !vid.srcObject) {
          vid.pause();
          vid.srcObject = null;
          vid.removeAttribute('crossOrigin');
          vid.src = src.fileUrl;
          vid.__lastSrc = src.fileUrl;
          vid.load();
        }
        this.syncMediaPlayback(vid, src, src.audioMuted || (source as any)._layerAudioMuted, key);
      } else if (source.type === 'WebcamCapture') {
        const src = source as WebcamCaptureSource;
        if (this.activeDeviceIds[key] !== src.deviceId || (!vid.srcObject && !vid.src)) {
          this.activeDeviceIds[key] = src.deviceId;
          vid.pause();
          vid.removeAttribute('src');
          vid.__lastSrc = undefined;

          const constraints: MediaStreamConstraints = {
            video: src.deviceId ? { deviceId: { exact: src.deviceId } } : true,
            audio: false,
          };

          navigator.mediaDevices
            .getUserMedia(constraints)
            .then(stream => {
              if (this.activeDeviceIds[key] === src.deviceId) {
                vid.srcObject = stream;
                vid.play().catch(() => {});
              } else {
                stream.getTracks().forEach(t => t.stop());
              }
            })
            .catch(err => console.error('Webcam error:', err));
        }
        this.syncMediaPlayback(vid, src, (source as any)._layerAudioMuted, key);
      }
      return vid as HTMLVideoElement;
    } else if (source.type === 'ImageLoader' || source.type === 'ImageFile') {
      const srcUrl =
        source.type === 'ImageLoader'
          ? (source as ImageLoaderSource).imageUrl
          : (source as ImageFileSource).fileUrl;

      if (srcUrl && (!this.imageElements[key] || this.imageElements[key].src !== srcUrl)) {
        const img = new Image();
        if (source.type === 'ImageLoader') img.crossOrigin = 'anonymous';
        img.src = srcUrl;
        this.imageElements[key] = img;
        img.onload = () => {
          createImageBitmap(img).then(bmp => (this.imageBitmaps[key] = bmp));
        };
      }
      return this.imageBitmaps[key] || null;
    } else if (source.type === 'AudioFile') {
      let aud = this.audioElements[key];
      if (!aud) {
        aud = document.createElement('audio');
        aud.crossOrigin = 'anonymous';
        this.audioElements[key] = aud;
      }
      const src = source as any;
      if (src.fileUrl && (aud.src !== src.fileUrl || !AudioEngine.getInstance().getBusData(key))) {
        if (aud.src !== src.fileUrl) {
          aud.src = src.fileUrl;
          aud.load();
        }
        AudioEngine.getInstance().registerMediaElement(key, aud);
      }
      if (src.playState === 'play' && aud.paused && !useEngineStore.getState().isGlobalPaused) {
        aud.play().catch(e => console.error('Audio Play Error:', e));
      } else if (src.playState === 'pause' && !aud.paused) {
        aud.pause();
      } else if (src.playState === 'stop') {
        aud.pause();
        aud.currentTime = 0;
      }

      this.syncMediaPlayback(aud, src, source._layerAudioMuted, key);
      return null;
    } else if (source.type === 'AudioInput' || source.type === 'SystemAudio') {
      const src = source as any;
      let stream = this.activeStreams[key];
      if (!stream) {
        const constraints =
          source.type === 'AudioInput'
            ? {
                audio: src.deviceId
                  ? { deviceId: src.deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                  : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
              }
            : { audio: true, video: true };

        const promise =
          source.type === 'AudioInput'
            ? navigator.mediaDevices.getUserMedia(constraints)
            : navigator.mediaDevices.getDisplayMedia(constraints);

        promise
          .then(s => {
            this.activeStreams[key] = s;
            let aud = this.audioElements[key];
            if (!aud) {
              aud = document.createElement('audio');
              document.body.appendChild(aud);
              aud.style.display = 'none';
              this.audioElements[key] = aud;
            }
            aud.srcObject = s;
            aud.play();
            AudioEngine.getInstance().registerMediaElement(key, aud);
          })
          .catch(e => console.error(`${source.type} Error:`, e));
      }

      const aud = this.audioElements[key];
      if (aud) {
        this.applyAudioState(aud, src, source._layerAudioMuted, key);
      }
      return null;
    }
    return null;
  }

  public handleReset(globalResetSignal: number, layers: Record<string, LayerState>) {
    if (globalResetSignal !== this.lastResetSignal) {
      this.lastResetSignal = globalResetSignal;
      Object.entries(this.videoElements).forEach(([layerId, v]) => {
        const layer = layers[layerId];
        const loopStart = (layer?.source as any)?.loopStart ?? 0;
        v.currentTime = loopStart;
      });
      Object.entries(this.audioElements).forEach(([layerId, a]) => {
        const layer = layers[layerId];
        const loopStart = (layer?.source as any)?.loopStart ?? 0;
        a.currentTime = loopStart;
      });
    }
  }

  public handlePause(isGlobalPaused: boolean) {
    if (!isGlobalPaused) {
      if (this.wasPaused) {
        Object.values(this.videoElements).forEach(v => v.play().catch(e => e));
        Object.values(this.audioElements).forEach(a => a.play().catch(e => e));
        this.wasPaused = false;
      }
    } else {
      if (!this.wasPaused) {
        Object.values(this.videoElements).forEach(v => v.pause());
        Object.values(this.audioElements).forEach(a => a.pause());
        this.wasPaused = true;
      }
    }
  }

  public cleanupInactive(activeNodeIds: Set<string>, layers: Record<string, LayerState>) {
    Object.keys(this.videoElements).forEach(id => {
      if (!activeNodeIds.has(id)) {
        const v = this.videoElements[id];
        v.pause();
        if (v.srcObject) {
          (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
          v.srcObject = null;
        }
        v.src = '';
        v.removeAttribute('src');
        v.load();
        v.remove();
        AudioEngine.getInstance().unregisterMediaElement(id);
        delete this.videoElements[id];
        delete this.activeStreams[id];
      }
    });

    Object.keys(this.audioElements).forEach(id => {
      if (!activeNodeIds.has(id)) {
        const a = this.audioElements[id];
        a.pause();
        if (a.srcObject) {
          (a.srcObject as MediaStream).getTracks().forEach(t => t.stop());
          a.srcObject = null;
        }
        a.src = '';
        a.remove();
        AudioEngine.getInstance().unregisterMediaElement(id);
        delete this.audioElements[id];
        delete this.activeStreams[id];
      }
    });

    Object.values(layers).forEach(layer => {
      const isMedia = [
        'VideoURL',
        'VideoFile',
        'WebcamCapture',
        'AudioInput',
        'AudioFile',
        'ImageFile',
        'ImageLoader',
      ].includes(layer.source.type);
      if (!isMedia) {
        const vid = this.videoElements[layer.id];
        if (vid) {
          vid.pause();
          vid.src = '';
          vid.removeAttribute('src');
          vid.load();
          vid.remove();
          delete this.videoElements[layer.id];
          AudioEngine.getInstance().setModuleMute(layer.id, true);
        }
        const aud = this.audioElements[layer.id];
        if (aud) {
          aud.pause();
          aud.src = '';
          aud.removeAttribute('src');
          aud.load();
          aud.remove();
          delete this.audioElements[layer.id];
          AudioEngine.getInstance().setModuleMute(layer.id, true);
        }
      }
    });
  }

  public dispose() {
    Object.values(this.videoElements).forEach(v => {
      v.pause();
      v.src = '';
      if (v.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        v.srcObject = null;
      }
    });
    Object.values(this.audioElements).forEach(a => {
      a.pause();
      a.src = '';
      if (a.srcObject) {
        (a.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        a.srcObject = null;
      }
    });
    Object.values(this.activeStreams).forEach(s => {
      s.getTracks().forEach(t => t.stop());
    });
    this.videoElements = {};
    this.audioElements = {};
    this.activeStreams = {};
    this.imageElements = {};
    this.imageBitmaps = {};
    this.activeDeviceIds = {};
  }
}
