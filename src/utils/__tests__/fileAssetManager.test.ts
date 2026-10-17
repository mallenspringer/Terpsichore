import { describe, it, expect } from 'vitest';
import { extractFileAsset, resolveAssetUrl, rehydrateProjectMedia, isDesktopApp } from '../fileAssetManager';

describe('fileAssetManager', () => {
  it('detects desktop environment safely', () => {
    // In node/vitest, isTauri() is false
    expect(isDesktopApp()).toBe(false);
  });

  it('extracts file asset with browser fallback when not in desktop', () => {
    const file = new File(['dummy content'], 'sample_video.mp4', { type: 'video/mp4' });
    const asset = extractFileAsset(file);

    expect(asset.fileName).toBe('sample_video.mp4');
    expect(asset.fileUrl).toBeDefined();
    expect(typeof asset.fileUrl).toBe('string');
  });

  it('resolves asset URL fallback to existing fileUrl when not on desktop', () => {
    const resolved = resolveAssetUrl({
      fileName: 'clip.mp4',
      fileUrl: 'blob:http://localhost:1420/test-id',
      filePath: 'C:\\Videos\\clip.mp4'
    });
    expect(resolved).toBe('blob:http://localhost:1420/test-id');
  });

  it('rehydrates project media layers cleanly', () => {
    const layers = [
      {
        id: 'layer_1',
        source: {
          type: 'VideoFile',
          fileName: 'loop.mp4',
          fileUrl: 'blob:expired-url',
          filePath: 'C:\\Visuals\\loop.mp4'
        },
        effects: [
          {
            id: 'fx_1',
            type: 'ImageFile',
            fileName: 'mask.png',
            fileUrl: 'blob:expired-img',
            filePath: 'C:\\Visuals\\mask.png'
          }
        ]
      }
    ];

    const rehydrated = rehydrateProjectMedia(layers);
    expect(rehydrated.length).toBe(1);
    expect(rehydrated[0].source.fileName).toBe('loop.mp4');
    expect(rehydrated[0].effects[0].fileName).toBe('mask.png');
  });
});
