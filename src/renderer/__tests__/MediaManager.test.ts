import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaManager } from '../MediaManager';
import { AudioEngine } from '../../state/AudioEngine';

vi.mock('../../state/AudioEngine', () => {
  const unregisterMediaElementMock = vi.fn();
  const registerMediaElementMock = vi.fn();
  const registerStreamMock = vi.fn().mockResolvedValue(undefined);
  const resumeMock = vi.fn().mockResolvedValue(undefined);
  const setModuleMuteMock = vi.fn();
  const setModuleVolumeMock = vi.fn();
  const setLayerMuteMock = vi.fn();
  const setMasterMuteMock = vi.fn();
  const getBusDataMock = vi.fn();

  return {
    AudioEngine: {
      getInstance: () => ({
        unregisterMediaElement: unregisterMediaElementMock,
        registerMediaElement: registerMediaElementMock,
        registerStream: registerStreamMock,
        resume: resumeMock,
        setModuleMute: setModuleMuteMock,
        setModuleVolume: setModuleVolumeMock,
        setLayerMute: setLayerMuteMock,
        setMasterMute: setMasterMuteMock,
        getBusData: getBusDataMock,
      }),
    },
  };
});

describe('MediaManager', () => {
  let mediaManager: MediaManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mediaManager = new MediaManager();
  });

  it('should return null for getMediaElement when no media registered', () => {
    expect(mediaManager.getMediaElement('unknown_key')).toBeNull();
    expect(mediaManager.getMediaProgress('unknown_key')).toEqual({ currentTime: 0, duration: 0 });
  });

  it('should retrieve progress from an active media element', () => {
    const mockVideo = {
      currentTime: 12.5,
      duration: 60.0,
    } as unknown as HTMLVideoElement;

    mediaManager.videoElements['layer_1'] = mockVideo;
    expect(mediaManager.getMediaElement('layer_1')).toBe(mockVideo);
    expect(mediaManager.getMediaProgress('layer_1')).toEqual({ currentTime: 12.5, duration: 60.0 });
  });

  it('should reset media playback time respecting resetTarget on handleReset', () => {
    const mockVideo = { currentTime: 45.0 } as HTMLVideoElement;
    const mockAudio = { currentTime: 30.0 } as HTMLAudioElement;

    mediaManager.videoElements['layer_v'] = mockVideo;
    mediaManager.audioElements['layer_a'] = mockAudio;

    const layers: any = {
      layer_v: { source: { loopStart: 5.0, resetTarget: 'start flag' } },
      layer_a: { source: { loopStart: 2.5, resetTarget: 'start of file' } },
    };

    mediaManager.handleReset(1, layers);
    expect(mockVideo.currentTime).toBe(5.0);
    expect(mockAudio.currentTime).toBe(0);
  });

  it('should allow direct seekMedia to any target time', () => {
    const mockVideo = { currentTime: 10.0 } as HTMLVideoElement;
    mediaManager.videoElements['layer_test'] = mockVideo;

    mediaManager.seekMedia('layer_test', 3.5);
    expect(mockVideo.currentTime).toBe(3.5);
  });

  it('should pause and resume all media elements on handlePause', () => {
    const mockVideo = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;

    const mockAudio = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    } as unknown as HTMLAudioElement;

    mediaManager.videoElements['layer_1'] = mockVideo;
    mediaManager.audioElements['layer_2'] = mockAudio;

    // Trigger pause
    mediaManager.handlePause(true);
    expect(mockVideo.pause).toHaveBeenCalled();
    expect(mockAudio.pause).toHaveBeenCalled();

    // Trigger resume
    mediaManager.handlePause(false);
    expect(mockVideo.play).toHaveBeenCalled();
    expect(mockAudio.play).toHaveBeenCalled();
  });

  it('should clean up inactive media elements and unregister from AudioEngine', () => {
    const stopTrackMock = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: stopTrackMock }],
    } as unknown as MediaStream;

    const mockVideo = {
      pause: vi.fn(),
      load: vi.fn(),
      remove: vi.fn(),
      removeAttribute: vi.fn(),
      src: 'blob:test',
      srcObject: mockStream,
    } as unknown as HTMLVideoElement;

    mediaManager.videoElements['dead_layer'] = mockVideo;
    mediaManager.activeStreams['dead_layer'] = mockStream;

    const activeNodeIds = new Set(['active_layer']);
    const layers: any = {};

    mediaManager.cleanupInactive(activeNodeIds, layers);

    expect(mockVideo.pause).toHaveBeenCalled();
    expect(stopTrackMock).toHaveBeenCalled();
    expect(mockVideo.remove).toHaveBeenCalled();
    expect(AudioEngine.getInstance().unregisterMediaElement).toHaveBeenCalledWith('dead_layer');
    expect(mediaManager.videoElements['dead_layer']).toBeUndefined();
    expect(mediaManager.activeStreams['dead_layer']).toBeUndefined();
  });

  it('should stop all media streams and clear state on dispose', () => {
    const stopTrackMock = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: stopTrackMock }],
    } as unknown as MediaStream;

    const mockVideo = {
      pause: vi.fn(),
      src: 'blob:test',
      srcObject: mockStream,
    } as unknown as HTMLVideoElement;

    mediaManager.videoElements['v1'] = mockVideo;
    mediaManager.activeStreams['s1'] = mockStream;

    mediaManager.dispose();

    expect(mockVideo.pause).toHaveBeenCalled();
    expect(Object.keys(mediaManager.videoElements).length).toBe(0);
    expect(Object.keys(mediaManager.activeStreams).length).toBe(0);
  });

  it('should not call getDisplayMedia in manageMediaSource for SystemAudio', () => {
    const getDisplayMediaMock = vi.fn();
    (globalThis as any).navigator = {
      mediaDevices: {
        getDisplayMedia: getDisplayMediaMock,
      },
    };

    const res = mediaManager.manageMediaSource('sys_1', { type: 'SystemAudio', volume: 1.0, muted: false });
    expect(res).toBeNull();
    // Must NOT call getDisplayMedia in the render loop!
    expect(getDisplayMediaMock).not.toHaveBeenCalled();
  });

  it('should handle startSystemAudio successfully and stop video tracks', async () => {
    const stopVideoMock = vi.fn();
    const stopAudioMock = vi.fn();
    const audioTrack = { kind: 'audio', label: 'Chrome Tab Audio', stop: stopAudioMock, onended: null };
    const videoTrack = { kind: 'video', label: 'Screen Share', stop: stopVideoMock };

    const mockStream = {
      getTracks: () => [audioTrack, videoTrack],
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;

    (globalThis as any).navigator = {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      },
    };

    const stream = await mediaManager.startSystemAudio('sys_audio_1');
    expect(stream).toBe(mockStream);
    expect(stopVideoMock).toHaveBeenCalled();
    expect(mediaManager.streamStatuses['sys_audio_1']).toBe('active');
    expect(mediaManager.streamLabels['sys_audio_1']).toBe('Chrome Tab Audio');
    expect(mediaManager.activeStreams['sys_audio_1']).toBe(mockStream);

    mediaManager.stopStream('sys_audio_1');
    expect(stopAudioMock).toHaveBeenCalled();
    expect(mediaManager.activeStreams['sys_audio_1']).toBeUndefined();
    expect(mediaManager.streamStatuses['sys_audio_1']).toBe('idle');
  });

  it('should detect when user cancels or shares without audio', async () => {
    // 1. Sharing without audio track
    const mockStreamNoAudio = {
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    } as unknown as MediaStream;

    (globalThis as any).navigator = {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStreamNoAudio),
      },
    };

    const stream1 = await mediaManager.startSystemAudio('sys_no_aud');
    expect(stream1).toBeNull();
    expect(mediaManager.streamStatuses['sys_no_aud']).toBe('no_audio');

    // 2. Cancellation / NotAllowedError
    (globalThis as any).navigator = {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockRejectedValue({ name: 'NotAllowedError', message: 'Permission denied' }),
      },
    };

    const stream2 = await mediaManager.startSystemAudio('sys_cancelled');
    expect(stream2).toBeNull();
    expect(mediaManager.streamStatuses['sys_cancelled']).toBe('denied');
  });

  it('should switch audio input streams cleanly when deviceId changes', async () => {
    const stopTrack1 = vi.fn();
    const stream1 = {
      getTracks: () => [{ stop: stopTrack1 }],
    } as unknown as MediaStream;

    const stopTrack2 = vi.fn();
    const stream2 = {
      getTracks: () => [{ stop: stopTrack2 }],
    } as unknown as MediaStream;

    const getUserMediaMock = vi.fn()
      .mockResolvedValueOnce(stream1)
      .mockResolvedValueOnce(stream2);

    (globalThis as any).navigator = {
      mediaDevices: {
        getUserMedia: getUserMediaMock,
      },
    };

    // First request with device "mic_1"
    mediaManager.manageMediaSource('layer_audio', { type: 'AudioInput', deviceId: 'mic_1', volume: 1.0 });
    await new Promise(r => setTimeout(r, 0));

    expect(getUserMediaMock).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({ deviceId: { exact: 'mic_1' }, channelCount: { ideal: 2 } })
    }));
    expect(AudioEngine.getInstance().registerStream).toHaveBeenCalledWith('layer_audio', stream1);
    expect(mediaManager.getMediaElement('layer_audio')).toBeNull();

    // Switch device to "mic_2"
    mediaManager.manageMediaSource('layer_audio', { type: 'AudioInput', deviceId: 'mic_2', volume: 1.0 });
    await new Promise(r => setTimeout(r, 0));

    expect(stopTrack1).toHaveBeenCalled();
    expect(AudioEngine.getInstance().unregisterMediaElement).toHaveBeenCalledWith('layer_audio');
    expect(getUserMediaMock).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({ deviceId: { exact: 'mic_2' }, channelCount: { ideal: 2 } })
    }));
    expect(AudioEngine.getInstance().registerStream).toHaveBeenCalledWith('layer_audio', stream2);
  });
});
