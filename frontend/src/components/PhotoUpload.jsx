import { useState, useRef, useCallback } from 'react';
import { Loader2, X, Upload, Image as ImageIcon } from 'lucide-react';
import { api, formatError } from '../lib/api';

/**
 * PhotoUpload — herbruikbare drop-zone met click + drag&drop upload.
 * Hergebruikt het bestaande branding-upload endpoint.
 *
 * Props:
 *  • value: huidige photo_url (string)
 *  • onChange: (newUrl) => void
 *  • label: optionele tekst boven de zone (default: "Foto")
 *  • height: tailwind hoogte-class (default: "h-40")
 *  • showUrlField: toon "of plak een URL" details (default: true)
 *  • testId: prefix voor data-testid
 */
export default function PhotoUpload({
  value,
  onChange,
  label = 'Foto',
  height = 'h-40',
  showUrlField = true,
  testId = 'photo',
  hint = 'JPG / PNG · max 5 MB',
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Bestand is te groot (max 5 MB).');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Alleen afbeeldingen toegestaan.');
      return;
    }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: r } = await api.post('/companies/me/branding/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const apiBase = process.env.REACT_APP_BACKEND_URL || '';
      const absolute = r.url?.startsWith('http') ? r.url : `${apiBase}${r.url}`;
      onChange?.(absolute);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDrag(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div data-testid={`${testId}-wrapper`}>
      {label && (
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">{label}</label>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        data-testid={`${testId}-file`}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          data-testid={`${testId}-preview`}
          className={`relative w-full ${height} rounded-xl bg-slate-100 overflow-hidden group cursor-pointer ${
            drag ? 'ring-4 ring-[#FF5C00] ring-offset-2' : ''
          }`}
        >
          <img
            src={value && value.includes('/api/landing/asset/') ? `${value}${value.includes('?') ? '&' : '?'}thumb=1` : value}
            alt="preview"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-slate-900 rounded-lg font-bold text-sm">
              <Upload className="w-4 h-4" /> Wijzig foto
            </span>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#FF5C00]" />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange?.(''); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center hover:bg-red-50 text-slate-600 hover:text-red-600"
            aria-label="Foto verwijderen"
            data-testid={`${testId}-remove`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          data-testid={`${testId}-empty`}
          className={`w-full ${height} rounded-xl border-2 border-dashed transition flex flex-col items-center justify-center gap-2 cursor-pointer ${
            drag
              ? 'bg-orange-50 border-[#FF5C00] text-[#FF5C00] ring-4 ring-orange-200'
              : 'bg-slate-50 border-slate-300 hover:border-[#FF5C00] hover:bg-orange-50/40 text-slate-500 hover:text-[#FF5C00]'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-7 h-7 animate-spin" />
              <span className="text-xs font-bold">Uploaden…</span>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold">
                {drag ? 'Laat hier los om te uploaden' : 'Klik of sleep een foto hierheen'}
              </span>
              <span className="text-[10px] text-slate-400">{hint}</span>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="mt-1.5 text-[11px] text-red-600 font-medium" data-testid={`${testId}-error`}>{error}</p>
      )}
      {showUrlField && (
        <details className="mt-2">
          <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600 select-none">
            of plak een externe URL
          </summary>
          <input
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="https://…"
            data-testid={`${testId}-url`}
            className="mt-1.5 w-full h-9 px-3 rounded-xl border border-slate-200 focus:border-[#FF5C00] outline-none font-mono text-xs"
          />
        </details>
      )}
    </div>
  );
}
