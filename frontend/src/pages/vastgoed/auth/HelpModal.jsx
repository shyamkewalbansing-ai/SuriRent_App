import { X as XIcon } from 'lucide-react';

function HelpModal({ onClose, primary = '#FF5C00' }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="help-modal">
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="text-base font-black text-slate-900">Hulp bij inloggen</h3>
          <button onClick={onClose} data-testid="help-modal-close"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
                style={{ background: primary }}>1</span>
              <h4 className="text-sm font-black text-slate-900">Inloggen met PIN</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed pl-9">
              Voer uw 4-cijferige PIN in. Dit is de bedrijfs-PIN of uw persoonlijke medewerker-PIN
              (toegewezen door de beheerder).
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
                style={{ background: primary }}>2</span>
              <h4 className="text-sm font-black text-slate-900">PIN vergeten?</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed pl-9">
              Vraag uw beheerder om een nieuwe PIN. Heeft u geen toegang? Tik op
              &quot;Inloggen met e-mail&quot; onderaan om met uw wachtwoord in te loggen.
            </p>
          </div>
          <button onClick={onClose}
            className="w-full h-12 rounded-xl text-white font-black text-sm"
            style={{ background: primary }}>
            Begrepen
          </button>
        </div>
      </div>
    </div>
  );
}



export default HelpModal;
