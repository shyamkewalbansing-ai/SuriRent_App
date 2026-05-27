// Distinctive "ding-ding" sound voor pending-approval push notificaties.
//
// We gebruiken WebAudio in plaats van een audio-bestand zodat we geen extra
// asset hoeven te hosten + geen iOS PWA quirks met audio-tag krijgen.
// Het geluid bestaat uit twee korte sine-bell tonen (E6 en G6) met snelle
// decay — herkenbaar anders dan een gewone notificatie-piep.
//
// Beperking: alleen wanneer de app op de voorgrond staat. Voor echte
// achtergrond-pushes gebruikt de browser zijn eigen systeem-geluid (kan
// niet customized worden via Web Push API). Daarom doet de Service Worker
// óók een BADGE_CHANGED postMessage naar open tabs zodat — als de admin
// de app open heeft — de ding-ding alsnog speelt.

let _ctx = null;
let _lastPlayedAt = 0;

function getCtx() {
  if (_ctx) return _ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _ctx = new Ctx();
    return _ctx;
  } catch { return null; }
}

function _bell(ctx, freq, startAt, duration = 0.35, gain = 0.18) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  // Pluk-achtige decay (van gain naar 0) = klassiek bell-effect
  g.gain.setValueAtTime(0.001, startAt);
  g.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

// Speel de ding-ding. Tweede toon iets hoger dan de eerste → "stijgend".
// Anti-spam: minimum 800ms tussen plays zodat 3 pushes binnen 1s niet
// elkaar overschreeuwen.
export function playPendingApprovalDing() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = Date.now();
  if (now - _lastPlayedAt < 800) return;
  _lastPlayedAt = now;
  // iOS Safari schorst de context na inactiviteit op — wakker eerst weer op
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime + 0.02;
  _bell(ctx, 1318.5, t);            // E6
  _bell(ctx, 1568.0, t + 0.18);     // G6 — 180ms na de eerste → "ding-ding"
}

// Installeer een SW-message listener die de ding-ding speelt zodra een
// pending-approval push binnenkomt terwijl de app open is.
// Idempotent — meerdere calls registeren maar één listener.
let _installed = false;
export function installPendingApprovalDingListener() {
  if (_installed) return;
  if (!('serviceWorker' in navigator)) return;
  _installed = true;
  navigator.serviceWorker.addEventListener('message', (ev) => {
    const d = ev?.data;
    if (!d) return;
    // De service worker stuurt BADGE_CHANGED + (sinds v52) een
    // require_approval flag wanneer het om een pending payment gaat.
    if (d.type === 'BADGE_CHANGED' && d.require_approval) {
      playPendingApprovalDing();
    }
  });
}
