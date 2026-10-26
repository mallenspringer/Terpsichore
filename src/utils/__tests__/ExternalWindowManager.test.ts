import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalWindowManager } from '../ExternalWindowManager';

describe('ExternalWindowManager', () => {
  let manager: ExternalWindowManager;

  beforeEach(() => {
    manager = ExternalWindowManager.getInstance();
    manager.close();
  });

  it('provides a singleton instance', () => {
    const inst1 = ExternalWindowManager.getInstance();
    const inst2 = ExternalWindowManager.getInstance();
    expect(inst1).toBe(inst2);
  });

  it('starts in a closed state', () => {
    expect(manager.isOpen()).toBe(false);
  });

  it('notifies subscribers on registration and state changes', () => {
    const states: boolean[] = [];
    const unsubscribe = manager.subscribe((isOpen) => {
      states.push(isOpen);
    });

    expect(states).toEqual([false]);
    unsubscribe();
  });

  it('opens and closes popup window gracefully with mock window', () => {
    const mockWindow = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(function(this: any) { this.closed = true; }),
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
        getElementById: vi.fn(() => ({
          addEventListener: vi.fn(),
          style: {},
          play: vi.fn().mockResolvedValue(undefined)
        })),
        documentElement: { requestFullscreen: vi.fn() },
        body: { classList: { add: vi.fn(), remove: vi.fn() } },
        fullscreenElement: null
      },
      addEventListener: vi.fn()
    };

    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow as any);

    const states: boolean[] = [];
    const unsubscribe = manager.subscribe((isOpen) => states.push(isOpen));

    const mockCanvas = {
      width: 1920,
      height: 1080,
      captureStream: vi.fn().mockReturnValue({
        getVideoTracks: () => [{ stop: vi.fn() }],
        getTracks: () => [{ stop: vi.fn() }]
      })
    } as unknown as HTMLCanvasElement;

    manager.open(mockCanvas);

    expect(windowOpenSpy).toHaveBeenCalledWith(
      '',
      'TerpsichoreOutputDisplay',
      expect.stringContaining('resizable=yes')
    );
    expect(manager.isOpen()).toBe(true);
    expect(states[states.length - 1]).toBe(true);

    manager.close();
    expect(manager.isOpen()).toBe(false);
    expect(mockWindow.close).toHaveBeenCalled();
    expect(states[states.length - 1]).toBe(false);

    unsubscribe();
    windowOpenSpy.mockRestore();
  });
});
