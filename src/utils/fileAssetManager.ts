import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

export function isDesktopApp(): boolean {
  try {
    return typeof window !== 'undefined' && isTauri();
  } catch {
    return false;
  }
}

export interface ResolvedAssetInfo {
  fileName: string;
  fileUrl: string;
  filePath?: string;
}

/**
 * Extracts normalized file info from a user-selected File object.
 * In Tauri/Webview2 on Windows/macOS/Linux, `(file as any).path` contains the absolute disk path.
 * If running inside Tauri, convertFileSrc converts that path into a permanent asset stream URL.
 * In a standard web browser, falls back to URL.createObjectURL(file).
 */
export function extractFileAsset(file: File): ResolvedAssetInfo {
  const filePath: string | undefined = (file as any).path || undefined;

  if (isDesktopApp() && filePath) {
    try {
      const assetUrl = convertFileSrc(filePath);
      return {
        fileName: file.name,
        fileUrl: assetUrl,
        filePath: filePath,
      };
    } catch (e) {
      console.warn('[fileAssetManager] convertFileSrc failed, falling back to object URL:', e);
    }
  }

  return {
    fileName: file.name,
    fileUrl: URL.createObjectURL(file),
    filePath: filePath,
  };
}

/**
 * Given a stored asset with filePath and fileUrl, resolves an active, valid streamable URL.
 * When opening a saved project on desktop, this restores all media streams without asking
 * the user to locate the files again.
 */
export function resolveAssetUrl(asset: { fileUrl?: string; filePath?: string; fileName?: string }): string {
  if (isDesktopApp() && asset.filePath) {
    try {
      return convertFileSrc(asset.filePath);
    } catch (e) {
      console.warn('[fileAssetManager] Failed to re-resolve asset path with convertFileSrc:', e);
    }
  }
  return asset.fileUrl || '';
}

/**
 * Traverses loaded project layers and rehydrates any VideoFile, ImageFile, or AudioFile
 * nodes with permanent asset stream URLs if running in Tauri desktop mode.
 */
export function rehydrateProjectMedia(layers: any[]): any[] {
  if (!Array.isArray(layers)) return layers;
  const inDesktop = isDesktopApp();

  return layers.map(layer => {
    let updatedSource = layer.source;
    if (updatedSource && ['VideoFile', 'ImageFile', 'AudioFile'].includes(updatedSource.type)) {
      if (inDesktop && updatedSource.filePath) {
        updatedSource = {
          ...updatedSource,
          fileUrl: convertFileSrc(updatedSource.filePath)
        };
      }
    }

    const updatedEffects = (layer.effects || []).map((eff: any) => {
      if (eff && ['VideoFile', 'ImageFile', 'AudioFile'].includes(eff.type)) {
        if (inDesktop && eff.filePath) {
          return {
            ...eff,
            fileUrl: convertFileSrc(eff.filePath)
          };
        }
      }
      return eff;
    });

    return {
      ...layer,
      source: updatedSource,
      effects: updatedEffects
    };
  });
}
