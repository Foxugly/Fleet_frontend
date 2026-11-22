export type OverviewView = 'list' | 'mosaic';

export const VIEW_STORAGE_KEY = 'fleet.overview.view';

/** Stored overview view; `list` when absent, unknown or storage is unavailable. */
export function readView(): OverviewView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'mosaic' ? 'mosaic' : 'list';
  } catch {
    return 'list';
  }
}

export function writeView(view: OverviewView): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Storage unavailable (private mode, quota): the choice just isn't remembered.
  }
}
