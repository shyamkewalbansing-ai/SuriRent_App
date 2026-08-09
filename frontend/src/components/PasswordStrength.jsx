// =====================================================================
// PasswordStrength — visuele wachtwoord sterkte meter met 5 segmenten
// en label. Score 0..4 (zwak..sterk). Gebruikt in RegisterModal en
// MobileRegisterWizard.
// =====================================================================
import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

// Score wachtwoord op basis van simpele regels — geen zxcvbn (te zwaar
// als dep). Geeft 0..4 terug.
export function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  const lengthGood = pw.length >= 8;
  const lengthStrong = pw.length >= 12;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  if (lengthGood) score += 1;
  if (lengthStrong) score += 1;
  if ((hasLower && hasUpper) || (hasDigit && (hasLower || hasUpper))) score += 1;
  if (hasSymbol) score += 1;
  // Cap tussen 0 en 4
  if (pw.length < 6) return 0;
  if (score > 4) score = 4;
  return score;
}

const LEVELS = [
  { label: 'Zeer zwak', color: 'bg-red-500', text: 'text-red-500' },
  { label: 'Zwak', color: 'bg-orange-500', text: 'text-orange-500' },
  { label: 'Redelijk', color: 'bg-yellow-500', text: 'text-yellow-600' },
  { label: 'Sterk', color: 'bg-emerald-500', text: 'text-emerald-600' },
  { label: 'Zeer sterk', color: 'bg-emerald-600', text: 'text-emerald-700' },
];

export default function PasswordStrength({ password, variant = 'light' }) {
  const score = useMemo(() => scorePassword(password), [password]);
  const level = LEVELS[score];

  const checks = [
    { ok: password.length >= 8, label: 'Min. 8 tekens' },
    { ok: /[A-Z]/.test(password) && /[a-z]/.test(password), label: 'Hoofd- + kleine letter' },
    { ok: /\d/.test(password), label: 'Cijfer' },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'Speciaal teken' },
  ];

  if (!password) return null;

  const barBg = variant === 'dark' ? 'bg-white/20' : 'bg-slate-200';
  const checkOk = variant === 'dark' ? 'text-emerald-300' : 'text-emerald-600';
  const checkOff = variant === 'dark' ? 'text-white/50' : 'text-slate-400';
  const checkTextOk = variant === 'dark' ? 'text-white' : 'text-slate-700';
  const checkTextOff = variant === 'dark' ? 'text-white/60' : 'text-slate-500';

  return (
    <div className="mt-2" data-testid="password-strength">
      <div className="flex items-center gap-1.5 mb-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}
            data-testid={`pw-strength-bar-${i}`}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= score ? level.color : barBg
            }`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[10px] font-black uppercase tracking-widest ${variant === 'dark' ? 'text-white/90' : level.text}`}
          data-testid="pw-strength-label">
          {level.label}
        </p>
      </div>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-1">
            {c.ok
              ? <Check className={`w-3 h-3 ${checkOk}`} strokeWidth={3} />
              : <X className={`w-3 h-3 ${checkOff}`} strokeWidth={3} />}
            <span className={`text-[10px] font-semibold ${c.ok ? checkTextOk : checkTextOff}`}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
