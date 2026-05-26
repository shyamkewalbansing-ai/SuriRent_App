// Globale "swipe down to dismiss" voor alle .modal-sheet-auto bottom sheets.
// Werkt alleen op mobile (< 768px). Slim genoeg om scroll-binnen-content
// niet per ongeluk te interpreteren als dismiss (drag alleen als scrollTop=0).
import { useEffect } from 'react';

export function useSheetSwipeToDismiss() {
  useEffect(() => {
    let activeSheet = null;
    let activeOverlay = null;
    let startY = 0;
    let deltaY = 0;
    let dragging = false;

    function findSheetPanel(target) {
      // Klimt omhoog tot we een element vinden waarvan de parent
      // de modal-sheet-auto overlay class draagt → dat is het sheet-panel.
      let el = target;
      while (el && el !== document.body) {
        const parent = el.parentElement;
        if (parent && parent.classList && parent.classList.contains('modal-sheet-auto')) {
          return { panel: el, overlay: parent };
        }
        el = parent;
      }
      return null;
    }

    function onTouchStart(e) {
      if (window.innerWidth >= 768) return; // alleen mobile
      const hit = findSheetPanel(e.target);
      if (!hit) return;
      // Alleen swipe-to-dismiss starten als content niet gescrold is —
      // anders interfereert het met normaal scrollen binnen het sheet.
      if (hit.panel.scrollTop > 0) return;
      activeSheet = hit.panel;
      activeOverlay = hit.overlay;
      startY = e.touches[0].clientY;
      deltaY = 0;
      dragging = true;
    }

    function onTouchMove(e) {
      if (!dragging || !activeSheet) return;
      const dy = e.touches[0].clientY - startY;
      if (dy < 0) {
        deltaY = 0;
      } else {
        deltaY = dy;
      }
      activeSheet.style.transition = 'none';
      activeSheet.style.transform = `translateY(${deltaY}px)`;
      if (activeOverlay) {
        const dim = Math.max(0.1, 1 - deltaY / 400);
        activeOverlay.style.transition = 'none';
        activeOverlay.style.opacity = String(dim);
      }
    }

    function findCloseButton(panel) {
      // Vind de X (sluit)-knop binnen het sheet. Lucide's X icoon krijgt
      // een className die "lucide-x" bevat — daarmee identificeren we de
      // close-button universeel zonder per-modal coupling.
      const buttons = panel.querySelectorAll('button');
      for (const btn of buttons) {
        const svg = btn.querySelector('svg');
        if (!svg) continue;
        const cls = (svg.getAttribute('class') || '').toLowerCase();
        if (cls.includes('lucide-x') || cls === 'lucide x' || cls.match(/\blucide-x\b/)) {
          return btn;
        }
      }
      // Fallback: kleine ronde grijze knop in de header (typische close pattern)
      return panel.querySelector('button.rounded-full');
    }

    function onTouchEnd() {
      if (!dragging || !activeSheet) return;
      const sheet = activeSheet;
      const overlay = activeOverlay;
      const shouldClose = deltaY > 90;
      sheet.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
      if (overlay) overlay.style.transition = 'opacity 0.22s ease-out';
      if (shouldClose) {
        sheet.style.transform = 'translateY(100%)';
        if (overlay) overlay.style.opacity = '0';
        const closeBtn = findCloseButton(sheet);
        setTimeout(() => {
          // Probeer eerst de X-knop (werkt voor élke modal, ongeacht of
          // de backdrop een onClick handler heeft). Val terug op overlay
          // click voor modals die wèl een backdrop-handler hebben.
          if (closeBtn) {
            closeBtn.click();
          } else if (overlay) {
            overlay.click();
          }
          // Reset inline styles voor de volgende open.
          if (sheet) { sheet.style.transform = ''; sheet.style.transition = ''; }
          if (overlay) { overlay.style.opacity = ''; overlay.style.transition = ''; }
        }, 220);
      } else {
        sheet.style.transform = '';
        if (overlay) overlay.style.opacity = '';
      }
      dragging = false;
      activeSheet = null;
      activeOverlay = null;
      deltaY = 0;
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);
}
