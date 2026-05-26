// Eenvoudige canvas-based handtekening capture. Werkt met muis + touch.
// Output: PNG data URL via getDataUrl() (alleen als de handtekening niet leeg is).
import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function SignaturePad({ onChange, height = 180 }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Maak canvas pixel-density correct voor scherp tekenen op retina.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A'; // slate-900
    ctx.lineWidth = 2.4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const point = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = point(e);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (isEmpty) setIsEmpty(false);
  };
  const end = () => {
    drawingRef.current = false;
    notifyChange();
  };

  const notifyChange = () => {
    if (!onChange) return;
    const url = isEmpty ? '' : canvasRef.current.toDataURL('image/png');
    onChange(url, !isEmpty);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setIsEmpty(true);
    if (onChange) onChange('', false);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl border border-slate-200 bg-white overflow-hidden"
        style={{ height: `${height}px` }}>
        <canvas
          ref={canvasRef}
          data-testid="signature-canvas"
          className="w-full h-full touch-none cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 text-sm font-semibold">
            Teken hier uw handtekening
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">
          {isEmpty ? 'Vereist om goed te keuren' : 'Handtekening gezet'}
        </span>
        <button type="button" onClick={clear} data-testid="signature-clear"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-red-500 font-semibold">
          <Trash2 className="w-3.5 h-3.5" /> Wissen
        </button>
      </div>
    </div>
  );
}
