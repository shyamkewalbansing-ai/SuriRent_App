// Bedrijfs-admin: Backup & Herstel
// - Download knop: GET /api/companies/me/backup → JSON file
// - Upload: parse JSON → POST /api/companies/me/restore (merge of replace)
// - Plan moet `allow_backup=true` hebben, anders 403.

import { useState, useRef } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2, Loader2, Database, ShieldAlert } from 'lucide-react';
import { api, formatError } from '../../../lib/api';

export default function BackupRestore() {
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [mode, setMode] = useState('merge');  // merge | replace
  const fileRef = useRef(null);

  const downloadBackup = async () => {
    setDownloading(true); setError(''); setSummary(null);
    try {
      const { data, headers } = await api.get('/companies/me/backup', { responseType: 'blob' });
      // Server geeft Content-Disposition met filename — fallback op generieke naam.
      const cd = headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `surirent-backup-${Date.now()}.json`;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(formatError(e, 'Download mislukt'));
    } finally {
      setDownloading(false);
    }
  };

  const uploadBackup = async (file) => {
    if (!file) return;
    setUploading(true); setError(''); setSummary(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (backup.format_version !== 1) {
        throw new Error('Ongeldig backup formaat (verwacht v1)');
      }
      if (mode === 'replace') {
        const ok = window.confirm(
          'WAARSCHUWING: VERVANGEN-modus wist ALLE huidige gegevens van uw bedrijf en herstelt vanuit de backup. ' +
          'Dit kan niet ongedaan worden gemaakt. Doorgaan?',
        );
        if (!ok) { setUploading(false); return; }
      }
      const { data } = await api.post('/companies/me/restore', { backup, mode });
      setSummary(data);
    } catch (e) {
      setError(formatError(e, 'Herstel mislukt'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6" data-testid="backup-restore-page">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Backup & Herstel</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Maak een volledige export van uw vastgoed-data (appartementen, huurders, contracten, betalingen, etc.)
          en herstel deze later wanneer nodig. Wij raden aan minimaal maandelijks een backup te downloaden.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3" data-testid="backup-error">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {summary && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200" data-testid="backup-summary">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <p className="font-bold text-emerald-900">Herstel voltooid</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-1 text-xs text-emerald-700">
            {Object.entries(summary.collections || {}).map(([k, v]) => (
              <p key={k}>
                <span className="font-bold">{k}:</span>{' '}
                {v.inserted ? `+${v.inserted} nieuw` : ''}{' '}
                {v.upserted ? `${v.upserted} bijgewerkt` : ''}{' '}
                {v.deleted ? `(${v.deleted} verwijderd)` : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Download card */}
        <div className="bg-white rounded-2xl border-2 border-emerald-100 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900">Backup downloaden</h3>
                <p className="text-xs text-slate-500 mt-0.5">JSON export van alle bedrijfsdata</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-slate-600 leading-relaxed">
              Inclusief: appartementen, huurders, contracten, betalingen, facturen, kasgeld, medewerkers, locaties en onderhoud.
              Bewaar het bestand veilig — het bevat persoonlijke gegevens van uw huurders.
            </p>
            <button onClick={downloadBackup} disabled={downloading}
              data-testid="backup-download-btn"
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Bezig met exporteren…' : 'Download backup nu'}
            </button>
          </div>
        </div>

        {/* Restore card */}
        <div className="bg-white rounded-2xl border-2 border-orange-100 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900">Backup herstellen</h3>
                <p className="text-xs text-slate-500 mt-0.5">Upload een eerder gemaakte JSON</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Modus</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMode('merge')}
                  data-testid="backup-mode-merge"
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-bold transition-colors ${
                    mode === 'merge' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-orange-300'
                  }`}>
                  <Database className="w-3.5 h-3.5 inline mr-1" />
                  Samenvoegen
                </button>
                <button onClick={() => setMode('replace')}
                  data-testid="backup-mode-replace"
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-bold transition-colors ${
                    mode === 'replace' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:border-red-300'
                  }`}>
                  <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
                  Vervangen
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                <strong>Samenvoegen</strong>: bestaande records worden bijgewerkt, nieuwe records toegevoegd.
                Records die niet in de backup zitten blijven behouden.<br/>
                <strong>Vervangen</strong>: ALLE huidige data wordt gewist en vervangen door de backup (destructief).
              </p>
            </div>
            <input type="file" accept="application/json,.json" ref={fileRef}
              onChange={(e) => uploadBackup(e.target.files?.[0])}
              data-testid="backup-file-input"
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:font-bold file:text-sm file:bg-orange-500 file:text-white hover:file:bg-orange-600 file:cursor-pointer" />
            {uploading && (
              <p className="text-sm text-orange-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Bezig met herstellen…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
