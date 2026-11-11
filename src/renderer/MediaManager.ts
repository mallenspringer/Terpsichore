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
  private static instance: MediaManager | null = null;

  public static getInstance(): MediaManager | null {
    return MediaManager.instance;
  }

  public videoElements: Record<string, HTMLVideoElement> = {};
  public audioElements: Record<string, HTMLAudioElement> = {};
  public activeStreams: Record<string, MediaStream> = {};
  public imageElements: Record<string, HTMLImageElement> = {};
  public imageBitmaps: Record<string, ImageBitmap> = {};
  public activeDeviceIds: Record<string, string> = {};
  public isSeeking: Record<string, boolean> = {};

  public streamStatuses: Record<string, 'idle' | 'requesting' | 'active' | 'denied' | 'no_audio'> = {};
  public streamLabels: Record<string, string> = {};
  public requestingStreams: Set<string> = new Set();
  public deniedStreams: Set<string> = new Set();
  private streamListeners: Set<() => void> = new Set();

  private wasPaused = false;
  private lastResetSignal = 0;

  constructor() {
    MediaManager.instance = this;
  }

  public subscribeStreamChanges(fn: () => void): () => void {
    this.streamListeners.add(fn);
    return () => this.streamListeners.delete(fn);
  }

  private notifyStreamChanges() {
    this.streamListeners.forEach(fn => {
      try {
        fn();
      } catch (e) {
        console.error('[MediaManager] Stream listener error:', e);
      }
    });
  }

  public async startSystemAudio(key: string): Promise<MediaStream | null> {
    if (this.requestingStreams.has(key)) return null;
    this.requestingStreams.add(key);
    this.streamStatuses[key] = 'requesting';
    this.notifyStreamChanges();

    // Stop existing stream if any
    this.stopStream(key);

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('getDisplayMedia is not supported in this browser.');
      }

      await AudioEngine.getInstance().resume();

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // User didn't check "Also share tab audio"
        stream.getTracks().forEach(t => t.stop());
        this.streamStatuses[key] = 'no_audio';
        this.requestingStreams.delete(key);
        this.notifyStreamChanges();
        return null;
      }

      // Stop video tracks since we only need the audio stream; this stops screen capture overhead
      stream.getVideoTracks().forEach(t => t.stop());

      this.activeStreams[key] = stream;
      this.streamStatuses[key] = 'active';
      this.streamLabels[key] = audioTracks[0].label || 'Tab / System Audio';

      await AudioEngine.getInstance().registerStream(key, stream);

      audioTracks[0].onended = () => {
        this.stopStream(key);
      };

      this.requestingStreams.delete(key);
      this.notifyStreamChanges();
      return stream;
    } catch (err: any) {
      this.requestingStreams.delete(key);
      if (err?.name === 'NotAllowedError') {
        this.streamStatuses[key] = 'denied';
      } else {
        console.error('[MediaManager] SystemAudio error:', err);
        this.streamStatuses[key] = 'denied';
      }
      this.notifyStreamChanges();
      return null;
    }
  }

  public stopStream(key: string) {
    const stream = this.activeStreams[key];
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      delete this.activeStreams[key];
    }
    const aud = this.audioElements[key];
    if (aud) {
      aud.pause();
      aud.srcObject = null;
      aud.src = '';
      aud.remove();
      delete this.audioElements[key];
    }
    AudioEngine.getInstance().unregisterMediaElement(key);
    this.streamStatuses[key] = 'idle';
    delete this.streamLabels[key];
    this.requestingStreams.delete(key);
    this.deniedStreams.delete(key);
    this.notifyStreamChanges();
  }

  public seekMedia(key: string, targetTime: number) {
    const el = this.getMediaElement(key);
    if (el) {
      el.currentTime = Math.max(0, targetTime);
      (el as any).__lastTime = el.currentTime;
    }
  }

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
    el: HTMLAudioElement | HTMLVideoElement | null,
    src: any,
    isMutedFromLayer: boolean,
    key: string
  ) {
    const globalMute = useEngineStore.getState().globalAudioMuted;
    const isModuleMuted = !!(src.audioMuted || src.muted);
    const shouldMute = isModuleMuted || isMutedFromLayer || globalMute;

    // Physical element level mute & volume clamping to prevent rogue direct-to-speaker leaks
    if (el) {
      el.muted = shouldMute;
      el.volume = shouldMute ? 0 : 1.0;
    }

    const ae = AudioEngine.getInstance();
    ae.setModuleMute(key, isModuleMuted);
    ae.setLayerMute(key, isMutedFromLayer);
    ae.setMasterMute(globalMute);
    if (!isModuleMuted && !isMutedFromLayer && !globalMute) {
      const vol = typeof src.volume === 'number' && isFinite(src.volume) ? src.volume : 1.0;
      ae.setModuleVolume(key, vol);
    }
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

    if (source.type !== 'AudioInput' && source.type !== 'SystemAudio') {
      if (this.activeStreams[key]) {
        this.stopStream(key);
      }
    }

    if (source.type === 'AudioInput') {
      const aud = this.audioElements[key];
      if (aud) {
        aud.pause();
        aud.srcObject = null;
        aud.src = '';
        aud.remove();
        delete this.audioElements[key];
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
    } else if (source.type === 'SystemAudio') {
      const src = source as any;
      const aud = this.audioElements[key] || null;
      this.applyAudioState(aud, src, source._layerAudioMuted, key);
      return null;
    } else if (source.type === 'AudioInput') {
      const src = source as any;
      const deviceIdChanged = this.activeDeviceIds[key] !== (src.deviceId || '');
      let stream = this.activeStreams[key];

      if (deviceIdChanged || (!stream && !this.requestingStreams.has(key) && !this.deniedStreams.has(key))) {
        this.activeDeviceIds[key] = src.deviceId || '';
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          delete this.activeStreams[key];
        }
        if (this.audioElements[key]) {
          this.audioElements[key].pause();
          this.audioElements[key].srcObject = null;
          this.audioElements[key].remove();
          delete this.audioElements[key];
        }
        AudioEngine.getInstance().unregisterMediaElement(key);

        this.requestingStreams.add(key);
        const audioConstraint: MediaTrackConstraints = src.deviceId
          ? { deviceId: { exact: src.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };

        navigator.mediaDevices?.getUserMedia?.({ audio: audioConstraint })
          ?.catch(err => {
            if (src.deviceId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError')) {
              console.warn(`[MediaManager] Specified audio device unavailable, falling back to default input:`, err);
              return navigator.mediaDevices?.getUserMedia?.({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }
              });
            }
            throw err;
          })
          ?.then(async s => {
            this.requestingStreams.delete(key);
            this.deniedStreams.delete(key);
            if (!s) return;
            if (this.activeDeviceIds[key] !== (src.deviceId || '')) {
              s.getTracks().forEach(t => t.stop());
              return;
            }
            this.activeStreams[key] = s;
            const audioTrack = s.getAudioTracks ? s.getAudioTracks()[0] : (s.getTracks?.()[0] as any);
            if (audioTrack) {
              audioTrack.onended = () => {
                this.stopStream(key);
              };
            }
            await AudioEngine.getInstance().resume()?.catch(() => {});
            await AudioEngine.getInstance().registerStream(key, s);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('terp_device_permission_granted'));
            }
          })
          ?.catch(e => {
            this.requestingStreams.delete(key);
            this.deniedStreams.add(key);
            console.error(`AudioInput Error:`, e);
          });
      }

      this.applyAudioState(null, src, source._layerAudioMuted, key);
      return null;
    }
    return null;
  }

  public handleReset(globalResetSignal: number, layers: Record<string, LayerState>) {
    if (globalResetSignal !== this.lastResetSignal) {
      this.lastResetSignal = globalResetSignal;
      Object.entries(this.videoElements).forEach(([key, v]) => {
        const layer = layers[key];
        const src = layer ? layer.source : Object.values(layers).flatMap(l => l.effects).find(e => e.id === key);
        const resetTarget = (src as any)?.resetTarget || 'start flag';
        const targetTime = resetTarget === 'start of file' ? 0 : ((src as any)?.loopStart ?? 0);
        v.currentTime = targetTime;
        (v as any).__lastTime = targetTime;
      });
      Object.entries(this.audioElements).forEach(([key, a]) => {
        const layer = layers[key];
        const src = layer ? layer.source : Object.values(layers).flatMap(l => l.effects).find(e => e.id === key);
        const resetTarget = (src as any)?.resetTarget || 'start flag';
        const targetTime = resetTarget === 'start of file' ? 0 : ((src as any)?.loopStart ?? 0);
        a.currentTime = targetTime;
        (a as any).__lastTime = targetTime;
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

    Object.keys(this.activeStreams).forEach(id => {
      if (!activeNodeIds.has(id)) {
        this.stopStream(id);
      }
    });

    Object.values(layers).forEach(layer => {
      const isMedia = [
        'VideoURL',
        'VideoFile',
        'WebcamCapture',
        'AudioInput',
        'AudioFile',
        'SystemAudio',
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
    if (MediaManager.instance === this) {
      MediaManager.instance = null;
    }
  }
}
