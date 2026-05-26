// Open WhatsApp zonder dat de PWA/browser de huidige pagina kwijtraakt.
//
// Probleem: `window.open('https://wa.me/...', '_blank')` werkt in een normale
// browser tab, maar in een geïnstalleerde PWA op iOS (standalone display-mode)
// **vervangt** dit vaak het huidige scherm in plaats van een nieuwe tab te
// openen. Als de gebruiker dan terugkomt is de PWA opnieuw geladen en
// terechtgekomen op het login/landing-scherm.
//
// Oplossing: een tijdelijke <a target="_blank" rel="noopener noreferrer"> die
// we programmatisch klikken. iOS Safari + Android Chrome behandelen dit als
// een gebruikersactie en openen de externe URL in een aparte view (of
// de native WhatsApp-app als die geïnstalleerd is), zonder de PWA-context
// te raken.

/**
 * @param {string} phoneDigits  alleen cijfers (geen +, geen spaties)
 * @param {string} [message]    vrije tekst
 */
export function openWhatsApp(phoneDigits, message = '') {
  const digits = String(phoneDigits || '').replace(/\D/g, '');
  if (!digits) return;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  const url = `https://wa.me/${digits}${text}`;
  openExternal(url);
}

/** Open een willekeurige externe URL zonder de PWA-context te raken. */
export function openExternal(url) {
  if (!url) return;
  // Bouw een onzichtbaar <a> element. Hierop een synchrone click triggeren
  // is wat iOS Safari als een geldige user-initiated navigation accepteert.
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.position = 'absolute';
  a.style.opacity = '0';
  a.style.pointerEvents = 'none';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    setTimeout(() => { try { a.remove(); } catch { /* noop */ } }, 0);
  }
}
