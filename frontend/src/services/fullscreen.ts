import { WindowFullscreen, WindowIsFullscreen, WindowUnfullscreen } from '../../wailsjs/runtime/runtime';

const FULLSCREEN_EVENT = 'recipta-fullscreen-change';

function isWailsRuntimeAvailable() {
  return Boolean((window as typeof window & { runtime?: { WindowIsFullscreen?: unknown } }).runtime?.WindowIsFullscreen);
}

export async function getFullscreenState(): Promise<boolean> {
  if (isWailsRuntimeAvailable()) return WindowIsFullscreen();
  return Boolean(document.fullscreenElement);
}

export async function toggleAppFullscreen(): Promise<boolean> {
  const active = await getFullscreenState();
  if (isWailsRuntimeAvailable()) {
    if (active) WindowUnfullscreen(); else WindowFullscreen();
  } else if (active) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
  const nextState = !active;
  window.dispatchEvent(new CustomEvent(FULLSCREEN_EVENT, { detail: nextState }));
  return nextState;
}

export { FULLSCREEN_EVENT };
