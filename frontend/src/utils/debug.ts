// Lightweight debug logger for frontend. Replaces scattered console.* calls.
// Usage: import { debug, debugError } from '../utils/debug';
// Messages suppressed in production unless FORCE_DEBUG=true is set at build time.

const enabled = (() => {
  if (typeof process !== 'undefined') {
    if (process.env.REACT_APP_FORCE_DEBUG === 'true') return true;
    return process.env.NODE_ENV !== 'production';
  }
  return false;
})();

export function debug(...args: any[]) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log('[debug]', ...args);
}

export function debugInfo(...args: any[]) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.info('[info]', ...args);
}

export function debugError(...args: any[]) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.error('[error]', ...args);
}

export const debugEnabled = enabled;
