import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Check, Loader2, FileText, Users as UsersIcon, Trash2, Pencil, Receipt } from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function EmployeeForm({ initial, onCancel, onSaved }) {
  const [data, setData] = useState(initial || {
    name: '', role: '', phone: '', email: '', monthly_salary: 0, currency: 'SRD', active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setLoading(true); setError('');
    try {
      const payload = { ...data, monthly_salary: parseFloat(data.monthly_salary) || 0 };
      if (initial?.id) {
        const { data: r } = await api.put(`/employees/${initial.id}`, payload);
        onSaved(r);
      } else {
        const { data: r } = await api.post('/employees', payload);
        onSaved(r);
      }
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" data-testid="employee-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">{initial ? 'Werknemer bewerken' : 'Nieuwe werknemer'}</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Naam *</label>
            <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} data-testid="emp-name" required
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Functie</label>
            <input value={data.role} onChange={(e) => setData({ ...data, role: e.target.value })} data-testid="emp-role"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Telefoon</label>
              <input value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} data-testid="emp-phone"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">E-mail</label>
              <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} data-testid="emp-email"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Maandsalaris</label>
              <input type="number" step="0.01" value={data.monthly_salary} onChange={(e) => setData({ ...data, monthly_salary: e.target.value })}
                data-testid="emp-salary"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })} data-testid="emp-currency"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={data.active} onChange={(e) => setData({ ...data, active: e.target.checked })} className="w-4 h-4 accent-[#FF5C00]" />
            Actief in dienst
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.name} data-testid="emp-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

function SalaryForm({ employees, onCancel, onSaved }) {
  const today = new Date();
  const [data, setData] = useState({
    employee_id: '', gross: 0, advance: 0, deductions: 0, currency: 'SRD',
    period_month: today.getMonth() + 1, period_year: today.getFullYear(), note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill salary from employee record
  useEffect(() => {
    if (data.employee_id) {
      const e = employees.find((x) => x.id === data.employee_id);
      if (e && data.gross === 0) setData((d) => ({ ...d, gross: e.monthly_salary, currency: e.currency }));
    }
  }, [data.employee_id, data.gross, employees]);

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const net = (parseFloat(data.gross) || 0) - (parseFloat(data.advance) || 0) - (parseFloat(data.deductions) || 0);

  const save = async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/salaries', {
        ...data,
        gross: parseFloat(data.gross) || 0,
        advance: parseFloat(data.advance) || 0,
        deductions: parseFloat(data.deductions) || 0,
        period_month: parseInt(data.period_month),
        period_year: parseInt(data.period_year),
      });
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" data-testid="salary-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuwe loonstrook</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Werknemer *</label>
            <select value={data.employee_id} onChange={(e) => setData({ ...data, employee_id: e.target.value, gross: 0 })}
              data-testid="sal-employee" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies werknemer —</option>
              {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Maand</label>
              <select value={data.period_month} onChange={(e) => setData({ ...data, period_month: e.target.value })}
                data-testid="sal-month"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                {MONTHS_NL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Jaar</label>
              <input type="number" value={data.period_year} onChange={(e) => setData({ ...data, period_year: e.target.value })}
                data-testid="sal-year"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bruto</label>
              <input type="number" step="0.01" value={data.gross} onChange={(e) => setData({ ...data, gross: e.target.value })}
                data-testid="sal-gross"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Voorschot</label>
              <input type="number" step="0.01" value={data.advance} onChange={(e) => setData({ ...data, advance: e.target.value })}
                data-testid="sal-advance"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Inhouding</label>
              <input type="number" step="0.01" value={data.deductions} onChange={(e) => setData({ ...data, deductions: e.target.value })}
                data-testid="sal-deductions"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
          <div className="bg-gradient-to-r from-[#FFF4EC] to-[#FFE6D3] border border-[#FF5C00]/30 rounded-xl p-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-[#C74600]">Netto uitbetaling</span>
            <span className="text-2xl font-black text-slate-900 tracking-tight">{fmtMoney(net, data.currency)}</span>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Notitie</label>
            <input value={data.note} onChange={(e) => setData({ ...data, note: e.target.value })} data-testid="sal-note"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.employee_id} data-testid="sal-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Loonstrook opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [view, setView] = useState('employees'); // employees | salaries
  const [editing, setEditing] = useState(null);
  const [creatingEmp, setCreatingEmp] = useState(false);
  const [creatingSal, setCreatingSal] = useState(false);

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([api.get('/employees'), api.get('/salaries')]);
    setEmployees(e.data); setSalaries(s.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const delEmp = async (id) => {
    if (!window.confirm('Werknemer verwijderen?')) return;
    await api.delete(`/employees/${id}`); load();
  };
  const delSal = async (id) => {
    if (!window.confirm('Loonstrook verwijderen?')) return;
    await api.delete(`/salaries/${id}`); load();
  };
  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  return (
    <div>
      <PageHeader title="Werknemers" subtitle={`${employees.filter((e) => e.active).length} actief, ${salaries.length} loonstroken`}
        action={
          view === 'employees' ? (
            <button onClick={() => setCreatingEmp(true)} data-testid="emp-new-btn"
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
              <Plus className="w-4 h-4" /> Nieuwe werknemer
            </button>
          ) : (
            <button onClick={() => setCreatingSal(true)} data-testid="sal-new-btn"
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
              <Plus className="w-4 h-4" /> Nieuwe loonstrook
            </button>
          )
        }
      />
      <div className="flex gap-2 mb-4">
        <button onClick={() => setView('employees')} data-testid="view-employees"
          className={`px-4 py-2 rounded-xl font-bold text-sm ${view === 'employees' ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          <UsersIcon className="w-4 h-4 inline mr-1.5" /> Personeel
        </button>
        <button onClick={() => setView('salaries')} data-testid="view-salaries"
          className={`px-4 py-2 rounded-xl font-bold text-sm ${view === 'salaries' ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          <Receipt className="w-4 h-4 inline mr-1.5" /> Loonstroken
        </button>
      </div>

      {view === 'employees' ? (
        <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
          {employees.length === 0 ? (
            <div className="p-10 text-center"><UsersIcon className="w-10 h-10 text-orange-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">Geen werknemers.</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-orange-50/50 text-left">
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <th className="px-5 py-3">Naam</th>
                  <th className="px-5 py-3 hidden md:table-cell">Functie</th>
                  <th className="px-5 py-3 hidden md:table-cell">Contact</th>
                  <th className="px-5 py-3 text-right">Salaris</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} data-testid={`emp-row-${e.id}`} className="border-t border-orange-50 hover:bg-orange-50/30">
                    <td className="px-5 py-3 font-bold text-slate-900">{e.name}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-600">{e.role || '—'}</td>
                    <td className="px-5 py-3 hidden md:table-cell text-slate-500 text-xs">
                      <p>{e.phone || '—'}</p><p>{e.email}</p>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{fmtMoney(e.monthly_salary, e.currency)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${e.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {e.active ? 'Actief' : 'Inactief'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-1">
                      <button onClick={() => setEditing(e)} data-testid={`emp-edit-${e.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => delEmp(e.id)} data-testid={`emp-delete-${e.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
          {salaries.length === 0 ? (
            <div className="p-10 text-center"><Receipt className="w-10 h-10 text-orange-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">Geen loonstroken.</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-orange-50/50 text-left">
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <th className="px-5 py-3">Werknemer</th>
                  <th className="px-5 py-3">Periode</th>
                  <th className="px-5 py-3 text-right hidden md:table-cell">Bruto</th>
                  <th className="px-5 py-3 text-right hidden md:table-cell">Aftrek</th>
                  <th className="px-5 py-3 text-right">Netto</th>
                  <th className="px-5 py-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => (
                  <tr key={s.id} data-testid={`sal-row-${s.id}`} className="border-t border-orange-50 hover:bg-orange-50/30">
                    <td className="px-5 py-3 font-bold text-slate-900">{s.employee_name}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs capitalize">{MONTHS_NL[s.period_month - 1]} {s.period_year}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell text-slate-700">{fmtMoney(s.gross, s.currency)}</td>
                    <td className="px-5 py-3 text-right hidden md:table-cell text-slate-500">{fmtMoney(s.advance + s.deductions, s.currency)}</td>
                    <td className="px-5 py-3 text-right font-black text-slate-900">{fmtMoney(s.net, s.currency)}</td>
                    <td className="px-5 py-3 text-right space-x-1">
                      <a href={`${apiBase}/salaries/${s.id}/pdf`} target="_blank" rel="noreferrer"
                        data-testid={`sal-pdf-${s.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="PDF">
                        <FileText className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => delSal(s.id)} data-testid={`sal-delete-${s.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(editing || creatingEmp) && <EmployeeForm initial={editing}
        onCancel={() => { setEditing(null); setCreatingEmp(false); }}
        onSaved={() => { setEditing(null); setCreatingEmp(false); load(); }} />}
      {creatingSal && <SalaryForm employees={employees}
        onCancel={() => setCreatingSal(false)}
        onSaved={() => { setCreatingSal(false); load(); }} />}
    </div>
  );
}
