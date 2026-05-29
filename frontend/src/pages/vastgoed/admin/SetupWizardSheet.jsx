import { X, Sparkles } from 'lucide-react';
import SetupWizard from './SetupWizard';

/** Bottom-sheet (mobiel) + center-modal (desktop) wrapper rond SetupWizard.
 *  Op telefoon: slide-up van onderaan met pull-handle.
 *  Op desktop: gecentreerde overlay met max-width.
 *  De wizard zelf blijft volledig functioneel; deze wrapper voegt alleen
 *  een sluit-knop + dismiss-handling toe. */
export default function SetupWizardSheet({ open, onClose, companyId }) {
  if (!open) return null;

  const handleClose = () => {
    // Onthoud per bedrijf zodat de wizard niet bij elke login terugkomt
    // voor klanten die hem bewust gesloten hebben.
    try {
      if (companyId) {
        localStorage.setItem(`setup_wizard_dismissed_${companyId}`, '1');
      }
    } catch { /* ignore */ }
    onClose?.();
  };

  // Sluit via overlay-klik op desktop, maar NIET op mobiel (sheets sluit
  // je daar via de X-knop of pull-down — voorkomt per-ongeluk weg-tikken).
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && window.innerWidth >= 768) {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm md:bg-white/30 md:backdrop-blur-md flex items-end md:items-center justify-center md:p-4 modal-open"
      data-testid="setup-wizard-sheet"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-white w-full md:max-w-5xl rounded-t-3xl md:rounded-3xl shadow-2xl pt-3 pb-6 px-0 md:p-0 animate-slide-up-sheet md:animate-slide-up max-h-[94vh] md:max-h-[90vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pull-handle (mobiel) */}
        <div className="md:hidden flex justify-center pb-2 shrink-0">
          <span className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>

        {/* Sticky header met close-knop */}
        <div className="flex items-center justify-between px-5 md:px-6 pb-3 md:pb-4 md:pt-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-black text-slate-500">Welkom!</p>
              <h2 className="text-base md:text-lg font-extrabold text-slate-900 leading-tight">
                Setup Wizard
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            data-testid="setup-wizard-sheet-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition shrink-0"
            aria-label="Sluiten"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable wizard inhoud */}
        <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-5">
          <SetupWizard />
        </div>

        {/* Footer-knop "Later voltooien" (alleen mobiel — desktop heeft X) */}
        <div className="md:hidden border-t border-slate-100 px-5 pt-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            data-testid="setup-wizard-sheet-later"
            className="w-full h-11 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition"
          >
            Later voltooien
          </button>
        </div>
      </div>
    </div>
  );
}
