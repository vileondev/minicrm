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
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  model: string;
}

type Data = Record<string, any>;

function request(s: Settings, req: AiRequest, signal: AbortSignal): Promise<Response> {
  const maxTokens = req.maxTokens ?? 900;
  const post = (url: string, headers: Record<string, string>, body: unknown) =>
    fetch(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  switch (s.provider) {
    case 'anthropic':
      return post('https://api.anthropic.com/v1/messages', { 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01' },
        { model: s.model, max_tokens: maxTokens, system: req.system, messages: [{ role: 'user', content: req.user }] });
    case 'openai':
      // max_completion_tokens: os modelos novos (gpt-5, o-series) recusam o antigo max_tokens
      return post('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${s.apiKey}` },
        { model: s.model, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }] });
    case 'gemini':
      // os modelos 2.5+ "pensam" antes de responder e esse raciocínio consome o limite de saída: folga de 2048 tokens
      return post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent`, { 'x-goog-api-key': s.apiKey }, {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: { maxOutputTokens: maxTokens + 2048 },
      });
  }
}

function extractText(provider: Settings['provider'], data: Data): unknown {
  switch (provider) {
    case 'anthropic': return data.content?.[0]?.text;
    case 'openai': return data.choices?.[0]?.message?.content;
    case 'gemini': return (data.candidates?.[0]?.content?.parts as { text?: string; thought?: boolean }[] | undefined)
      ?.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  }
}

async function callAi(req: AiRequest): Promise<string> {
  const s = (await chrome.storage.local.get('AI_SETTINGS')).AI_SETTINGS as Settings | undefined;
  if (!s?.enabled || !s.apiKey) throw new Error('A IA está desativada ou sem chave de API.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await request(s, req, ctrl.signal);
    const data = (await res.json().catch(() => ({}))) as Data;
    if (!res.ok) throw new Error(data?.error?.message ?? `Erro HTTP ${res.status}`);
    const text = extractText(s.provider, data);
    if (typeof text !== 'string' || !text.trim()) {
      const blocked = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason;
      throw new Error(blocked && blocked !== 'STOP' ? `A IA não respondeu (${blocked}).` : 'A IA respondeu vazio.');
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

interface NotifyRequest {
  type: 'wacrm-notify';
  id: string; // "lead|<chave>|<tarefa>" ou "tasks"
  title: string;
  message: string;
}

/**
 * Avisos de tarefa. O id do aviso guarda a aba de origem e o que abrir no clique, porque o service worker
 * pode ser reiniciado entre o aviso e o clique.
 */
function notify(req: NotifyRequest, tabId: number): void {
  chrome.notifications.create(`${tabId}|${req.id}|${Date.now()}`, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title: req.title, message: req.message, priority: 1,
  });
}

chrome.notifications.onClicked.addListener(async (notifId) => {
  const [tab, kind, key] = notifId.split('|');
  const tabId = Number(tab);
  chrome.notifications.clear(notifId);
  try {
    const t = await chrome.tabs.update(tabId, { active: true });
    if (t?.windowId !== undefined) await chrome.windows.update(t.windowId, { focused: true });
    await chrome.tabs.sendMessage(tabId, kind === 'lead' ? { type: 'wacrm-open-lead', key: decodeURIComponent(key ?? '') } : { type: 'wacrm-open-tasks' });
  } catch {
    // a aba do WhatsApp foi fechada: abre uma nova
    await chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
  }
});

chrome.runtime.onMessage.addListener((msg: AiRequest | NotifyRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg?.type === 'wacrm-notify') {
    if (sender.tab?.id !== undefined) notify(msg, sender.tab.id);
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type !== 'wacrm-ai') return false;
  callAi(msg).then(
    (text) => sendResponse({ ok: true, text }),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true; // resposta assíncrona
});
