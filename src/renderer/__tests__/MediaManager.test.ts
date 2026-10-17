import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaManager } from '../MediaManager';
import { AudioEngine } from '../../state/AudioEngine';

vi.mock('../../state/AudioEngine', () => {
  const unregisterMediaElementMock = vi.fn();
  const registerMediaElementMock = vi.fn();
  const setModuleMuteMock = vi.fn();
  const setLayerMuteMock = vi.fn();
  const setMasterMuteMock = vi.fn();
  const getBusDataMock = vi.fn();

  return {
    AudioEngine: {
      getInstance: () => ({
        unregisterMediaElement: unregisterMediaElementMock,
        registerMediaElement: registerMediaElementMock,
        setModuleMute: setModuleMuteMock,
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

  it('should reset media playback time to loopStart on handleReset', () => {
    const mockVideo = { currentTime: 45.0 } as HTMLVideoElement;
    const mockAudio = { currentTime: 30.0 } as HTMLAudioElement;

    mediaManager.videoElements['layer_v'] = mockVideo;
    mediaManager.audioElements['layer_a'] = mockAudio;

    const layers: any = {
      layer_v: { source: { loopStart: 5.0 } },
      layer_a: { source: { loopStart: 2.5 } },
    };

    mediaManager.handleReset(1, layers);
    expect(mockVideo.currentTime).toBe(5.0);
    expect(mockAudio.currentTime).toBe(2.5);
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
    expect(stopTrackMock).toHaveBeenCalled();
    expect(Object.keys(mediaManager.videoElements).length).toBe(0);
    expect(Object.keys(mediaManager.activeStreams).length).toBe(0);
  });
});
