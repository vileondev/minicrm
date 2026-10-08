/**
 * Service worker: único ponto que fala com a API de IA. O content script roda na página do WhatsApp, cujo CSP
 * bloquearia a chamada. Só age quando o usuário ativou a IA e informou a própria chave; nada é enviado antes disso.
 */
interface AiRequest {
  type: 'wacrm-ai';
  system: string;
  user: string;
  maxTokens?: number;
}

interface Settings {
  enabled: boolean;
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
}

async function callAi(req: AiRequest): Promise<string> {
  const s = (await chrome.storage.local.get('AI_SETTINGS')).AI_SETTINGS as Settings | undefined;
  if (!s?.enabled || !s.apiKey) throw new Error('A IA está desativada ou sem chave de API.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const maxTokens = req.maxTokens ?? 900;
    const res =
      s.provider === 'anthropic'
        ? await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: s.model, max_tokens: maxTokens, system: req.system, messages: [{ role: 'user', content: req.user }] }),
          })
        : await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` },
            body: JSON.stringify({ model: s.model, max_tokens: maxTokens, messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }] }),
          });

    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) throw new Error(data?.error?.message ?? `Erro HTTP ${res.status}`);
    const text = s.provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('A IA respondeu vazio.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg: AiRequest, sender, sendResponse) => {
  if (msg?.type !== 'wacrm-ai' || sender.id !== chrome.runtime.id) return false;
  callAi(msg).then(
    (text) => sendResponse({ ok: true, text }),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true; // resposta assíncrona
});
