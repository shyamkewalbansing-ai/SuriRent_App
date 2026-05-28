import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, Check, Loader2, Home, ShieldCheck, FileText } from 'lucide-react';
import { api, formatError, fmtMoney } from '../../lib/api';

export default function ContractSignPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = 'Contract ondertekenen';
    api.get(`/contracts/sign/${token}`)
      .then((r) => {
        setInfo(r.data);
        setName(r.data?.tenant?.name || '');
        if (r.data?.already_signed) setDone(true);
      })
      .catch((e) => setError(formatError(e, 'Link ongeldig of verlopen')))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!accept) return setError('Vink eerst aan dat u akkoord gaat');
    if (!name || name.length < 2) return setError('Vul uw volledige naam in');
    setSubmitting(true); setError('');
    try {
      await api.post(`/contracts/sign/${token}`, { signed_by: name, accept: true });
      setDone(true);
    } catch (e) { setError(formatError(e)); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF7F0] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#FF5C00] animate-spin" />
      </div>
    );
  }
  if (error && !info) {
    return (
      <div className="min-h-screen bg-[#FFF7F0] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md text-center">
          <p className="text-lg font-bold text-red-600 mb-2">Link ongeldig</p>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }
  const { contract, tenant, apartment } = info;
  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FFF7F0] to-[#FFEAD3] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-12 h-12 text-emerald-600" strokeWidth={3} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Bedankt!</h1>
          <p className="text-slate-500 mb-6">Het contract is succesvol ondertekend.</p>
          <a href={`${apiBase}/contracts/${contract.id}/pdf`} target="_blank" rel="noreferrer"
            data-testid="sign-download"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl">
            <FileText className="w-4 h-4" /> Download contract (PDF)
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF7F0] to-[#FFEAD3] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center p-2 shadow-lg">
            <img src="/kiosk-icons/mark-white.png" alt="SuriRent" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-900">{contract.landlord || 'SuriRent N.V.'}</p>
            <p className="text-xs text-[#FF5C00] font-bold uppercase tracking-widest">Contract Ondertekening</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8">
          <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">Huurovereenkomst</h1>
          <p className="text-sm text-slate-500 mb-6">Nr. {contract.contract_number}</p>

          <div className="space-y-4 mb-6">
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
              <Home className="w-5 h-5 text-[#FF5C00] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-slate-500">Object</p>
                <p className="font-bold text-slate-900">Appt. {apartment.number} — {apartment.address}</p>
                <p className="text-sm text-slate-600">{fmtMoney(apartment.rent_amount, apartment.currency)} / maand</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
              <Building2 className="w-5 h-5 text-[#FF5C00] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-slate-500">Periode</p>
                <p className="font-bold text-slate-900">Vanaf {contract.start_date}{contract.end_date ? ` tot ${contract.end_date}` : ' — onbepaalde tijd'}</p>
                <p className="text-sm text-slate-600">Betaaldag: {contract.payment_day}e van de maand</p>
              </div>
            </div>
            {contract.deposit_amount > 0 && (
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <ShieldCheck className="w-5 h-5 text-[#FF5C00] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-widest font-bold text-slate-500">Borg</p>
                  <p className="font-bold text-slate-900">{fmtMoney(contract.deposit_amount, apartment.currency)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mb-6">
            <a href={`${apiBase}/contracts/${contract.id}/pdf`} target="_blank" rel="noreferrer"
              data-testid="sign-preview-pdf"
              className="inline-flex items-center gap-2 text-sm text-[#FF5C00] font-bold hover:underline">
              <FileText className="w-4 h-4" /> Bekijk volledig contract (PDF)
            </a>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}

          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Volledige naam</label>
              <input value={name} onChange={(e) => setName(e.target.value)} data-testid="sign-name"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <label className="flex items-start gap-3 p-3 bg-orange-50/50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)}
                data-testid="sign-accept"
                className="w-5 h-5 mt-0.5 accent-[#FF5C00]" />
              <span className="text-sm text-slate-700">
                Ik ga akkoord met de voorwaarden van deze huurovereenkomst en bevestig dat de gegevens kloppen.
              </span>
            </label>
          </div>

          <button onClick={submit} disabled={submitting || !accept || !name} data-testid="sign-submit"
            className="w-full h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white font-black rounded-xl text-lg flex items-center justify-center gap-2 shadow-[0_15px_30px_-10px_rgba(255,92,0,0.5)] disabled:opacity-50">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Ondertekenen
          </button>
          <p className="text-center text-xs text-slate-400 mt-4">
            Door te ondertekenen wordt uw naam en huidige datum/tijd vastgelegd als digitale handtekening.
          </p>
        </div>
      </div>
    </div>
  );
}
