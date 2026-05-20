import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, Trash2, Sparkles } from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const SESSION_KEY = 'ai-default-session';

export default function AIChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(SESSION_KEY);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get(`/ai/sessions/${sessionId}`).then((r) => setMessages(r.data?.messages || [])).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', text: msg, at: new Date().toISOString() }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ai/chat', { message: msg, session_id: sessionId });
      setMessages(data.history || []);
    } catch (e) {
      setError(formatError(e, 'AI service onbereikbaar'));
    } finally { setLoading(false); }
  };

  const clearChat = async () => {
    if (!window.confirm('Volledige conversatie wissen?')) return;
    await api.delete(`/ai/sessions/${sessionId}`);
    setMessages([]);
  };

  const suggestions = [
    'Welke huurders hebben openstaande huur?',
    'Geef een overzicht van de bezettingsgraad',
    'Wat zijn de totale inkomsten deze maand?',
    'Welke appartementen zijn vacant?',
  ];

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-[#FF5C00]" /> AI Assistent
          </h1>
          <p className="text-sm text-slate-500 mt-1">Stel vragen over uw portefeuille in het Nederlands</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} data-testid="ai-clear"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold">
            <Trash2 className="w-4 h-4" /> Wis chat
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 230px)', minHeight: '500px' }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center mb-4 shadow-xl">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-1">Hoe kan ik helpen?</h3>
              <p className="text-sm text-slate-500 mb-6">Powered by Claude Sonnet 4.5 — antwoorden in het Nederlands</p>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => setInput(s)} data-testid={`ai-suggestion-${s.slice(0, 10)}`}
                    className="text-left p-3 rounded-xl border-2 border-slate-100 hover:border-[#FF5C00] hover:bg-orange-50 text-sm text-slate-700 transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} data-testid={`ai-msg-${i}`}
                className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  m.role === 'user' ? 'bg-slate-100 text-slate-600' : 'bg-gradient-to-br from-[#FF8A3D] to-[#C74600] text-white'
                }`}>
                  {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  m.role === 'user' ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-900'
                }`}>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</div>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-slate-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#FF5C00]" />
                <span className="text-sm text-slate-500">Denkt na...</span>
              </div>
            </div>
          )}
        </div>

        {error && <div className="px-5 py-2 bg-red-50 border-t border-red-200 text-red-600 text-xs">{error}</div>}

        <div className="border-t border-orange-100 p-3 sm:p-4 flex items-end gap-2 bg-slate-50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Stel een vraag..."
            data-testid="ai-input"
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none resize-none bg-white text-sm"
            style={{ minHeight: '48px', maxHeight: '120px' }} />
          <button onClick={send} disabled={!input.trim() || loading} data-testid="ai-send"
            className="h-12 w-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white flex items-center justify-center disabled:opacity-50 active:scale-95">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
