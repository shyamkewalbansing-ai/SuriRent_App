// Globale tik-geluiden voor de hele app (kiosk + admin + huurder + klant).
//
// Werkt op iPhone PWA, Android PWA en in de browser. WebAudio wordt
// gebruikt zodat we geen audio-bestanden hoeven te hosten en de iOS
// "silent switch" niet roet in het eten gooit.
//
// Gebruik:
//   - In App-root (eenmaal): installGlobalTapSounds();
//   - Toggle: setTapSoundsEnabled(true|false);
//   - Status: isTapSoundsEnabled();
//
// Default = AAN. Gebruiker kan uitschakelen via /admin/notifications
// of door tk-instellingen. Voorkeur wordt bewaard in localStorage.

const LS_KEY = 'tap_sounds_enabled';

export function isTapSoundsEnabled() {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === null) return true;     // default ON
    return v !== 'false';
  } catch { return true; }
}

export function setTapSoundsEnabled(on) {
  try { localStorage.setItem(LS_KEY, on ? 'true' : 'false'); } catch { /* ignore */ }
}

// --- WebAudio singleton + lazy init -----------------------------------
let _ctx = null;
let _lastPlayedAt = 0;
let _installed = false;

function getCtx() {
  if (_ctx) return _ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _ctx = new Ctx();
    return _ctx;
  } catch { return null; }
}

function _click(ctx, type) {
  // Korte "tik" — twee parameters bepalen het karakter:
  //   freq  = hoogte van de klik (Hz)
  //   dur   = totale lengte (s)
  //   gain  = max volume (0..1)
  const cfg = type === 'key'
    ? { freq: 1800, dur: 0.025, gain: 0.07 }
    : { freq: 2400, dur: 0.020, gain: 0.09 };

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(cfg.freq, ctx.currentTime);
  // Hele snelle attack + decay = klik-karakter
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(cfg.gain, ctx.currentTime + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + cfg.dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + cfg.dur + 0.01);
}

function playTick(type) {
  if (!isTapSoundsEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  // iOS Safari schorst de context na inactiviteit. Wakker eerst weer op.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  // Anti-machinegun: minimaal 25ms tussen ticks (bij snelle keypad-spam).
  const now = performance.now();
  if (now - _lastPlayedAt < 25) return;
  _lastPlayedAt = now;
  try { _click(ctx, type); } catch { /* ignore */ }
}

export const playClickTick = () => playTick('click');
export const playKeyTick = () => playTick('key');

// --- Global listeners --------------------------------------------------
//
// We luisteren op `pointerdown` (niet `click`) zodat het geluid SYNCHROON
// met de tik komt, niet pas nadat React de update verwerkt heeft.
// Voor toetsenbord gebruiken we `keydown` (input/textarea + body).
//
// Selectors waar we tikken NIET willen:
//   - Elementen met [data-no-tap-sound] attribuut (escape hatch)
//   - Scroll-handlers buiten interactieve elementen (link-clicks tellen)

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  'input[type="button"]',
  'label',
  'select',
  '[data-tap-sound]',
].join(', ');

function _isInteractiveTarget(el) {
  if (!el || !el.closest) return false;
  if (el.closest('[data-no-tap-sound]')) return false;
  return !!el.closest(INTERACTIVE_SELECTOR);
}

function _isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    // Numeric/text inputs — niet voor button/checkbox/radio (die hebben click-sound)
    const t = (el.type || '').toLowerCase();
    return ['text', 'email', 'tel', 'number', 'password', 'search', 'url', ''].includes(t);
  }
  if (el.isContentEditable) return true;
  return false;
}

export function installGlobalTapSounds() {
  if (_installed) return;
  if (typeof document === 'undefined') return;
  _installed = true;

  const onPointerDown = (ev) => {
    if (!_isInteractiveTarget(ev.target)) return;
    playClickTick();
  };
  const onKeyDown = (ev) => {
    if (!_isTypingTarget(ev.target)) return;
    // Alleen voor zichtbare karakters + backspace
    const k = ev.key || '';
    if (k.length === 1 || k === 'Backspace' || k === 'Enter' || k === ' ') {
      playKeyTick();
    }
  };

  document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
  document.addEventListener('keydown', onKeyDown, { passive: true, capture: true });

  // Eerste gebruikersinteractie = goed moment om de AudioContext te
  // "ontgrendelen" (vooral iOS). We doen een silent prime-run.
  const prime = () => {
    const ctx = getCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    document.removeEventListener('pointerdown', prime, true);
    document.removeEventListener('touchstart', prime, true);
    document.removeEventListener('keydown', prime, true);
  };
  document.addEventListener('pointerdown', prime, { capture: true, once: false });
  document.addEventListener('touchstart', prime, { capture: true, once: false });
  document.addEventListener('keydown', prime, { capture: true, once: false });
}
