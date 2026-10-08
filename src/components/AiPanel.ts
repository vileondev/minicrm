import type { AiSettings } from '../types';
import { DEFAULT_AI, saveAiSettings } from '../storage/chromeStore';
import { analyzeChat, lastResult, meetingIcs, testConnection } from '../content/ai';
import { state } from '../content/state';
import { replaceTokenWithText } from '../utils/domHelpers';
import { h, toast } from './h';
import { icon } from './icons';

const DEFAULT_MODEL = { anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash' } as const;
const KEY_HINT = { anthropic: 'sk-ant-…', openai: 'sk-…', gemini: 'AIza…' } as const;
const HEAT_LABEL = { quente: 'Quente', morno: 'Morno', frio: 'Frio' } as const;

let cfg: AiSettings | null = null; // rascunho das configurações (sobrevive às re-renderizações)
let busy = false;
let error: string | null = null;

const field = (id: string, label: string) => h('label', { class: 'field', for: id }, label);

export function aiView(root: ShadowRoot, refresh: () => void): Node[] {
  cfg ??= { ...state.ai };
  const c = cfg;
  const ready = state.ai.enabled && !!state.ai.apiKey;
  const chat = state.chat;
  const result = chat ? lastResult.get(chat.key) : undefined;
  const nodes: Node[] = [];

  /* ---- ação principal ---- */
  const analyzeBtn = h('button', { class: 'btn', on: { click: async () => {
    if (!chat) return;
    busy = true;
    error = null;
    refresh();
    try {
      const r = await analyzeChat(chat);
      toast(root, `Lead ${r.analysis.heat} (${r.analysis.score}). CRM atualizado.`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
      refresh();
    }
  } } }, icon('sparkle'), busy ? 'Analisando…' : 'Analisar conversa');
  if (!ready || !chat || busy) analyzeBtn.setAttribute('disabled', '');

  nodes.push(h('div', { class: 'sec' },
    h('p', { class: 'muted' }, ready
      ? 'A IA lê as últimas mensagens de texto desta conversa e atualiza temperatura, resumo, tarefas, reunião e etapa no CRM. Ela só sugere a resposta: você revisa e envia.'
      : 'O assistente está desligado. Configure abaixo para ativar. Enquanto estiver desligado, nada é enviado para fora do navegador.'),
    analyzeBtn,
    error ? h('div', { class: 'state err' }, icon('warning'), error) : null));

  /* ---- resultado ---- */
  if (result && chat) {
    const a = result.analysis;
    const draftBox = h('textarea', { id: 'ai-draft', rows: 4 });
    draftBox.value = a.draft;
    nodes.push(h('div', { class: 'sec ai-result' },
      h('div', { class: 'row', style: 'padding-top:0' },
        h('span', { class: 'heat ' + a.heat }, `${HEAT_LABEL[a.heat]} ${a.score}`),
        h('span', { class: 'muted' }, 'Analisado às ' + new Date(result.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))),
      a.summary ? h('p', {}, a.summary) : null,
      a.nextStep ? h('p', {}, h('b', {}, 'Próximo passo: '), a.nextStep) : null,
      a.meeting?.date ? h('button', { class: 'btn ghost sm', on: { click: () => {
        const url = URL.createObjectURL(new Blob([meetingIcs(a.meeting!.title, a.meeting!.date!)], { type: 'text/calendar' }));
        h('a', { href: url, download: 'reuniao.ics' }).click();
        URL.revokeObjectURL(url);
      } } }, icon('calendar', 14), 'Baixar .ics da reunião') : null,
      h('h4', { style: 'margin-top:12px' }, 'Atualizado no CRM'),
      ...result.applied.map((t) => h('div', { class: 'row' }, h('span', {}, t), icon('check', 14))),
      a.draft ? h('div', { style: 'margin-top:12px' },
        field('ai-draft', 'Rascunho de resposta (edite antes de usar)'), draftBox,
        h('button', { class: 'btn', on: { click: () => void replaceTokenWithText(0, draftBox.value) } }, icon('send'), 'Inserir no chat'),
        h('p', { class: 'muted' }, 'Só preenche o campo de mensagem. O envio é sempre seu.')) : null));
  }

  /* ---- configurações ---- */
  const save = async () => { await saveAiSettings(c); cfg = null; toast(root, 'Configurações salvas.'); };
  const toggle = (id: string, label: string, key: 'enabled' | 'autoAnalyze' | 'autoStage') =>
    h('label', { class: 'check', for: id }, h('input', { id, type: 'checkbox', checked: c[key], on: { change: (e) => { c[key] = (e.target as HTMLInputElement).checked; } } }), label);

  const details = h('details', { class: 'sec', open: !ready },
    h('summary', {}, 'Configurações do assistente'),
    h('div', { style: 'margin-top:10px' },
      toggle('ai-on', 'Ativar assistente de IA', 'enabled'),
      h('p', { class: 'muted' }, 'Ao analisar, o nome do contato e até 30 mensagens de texto da conversa são enviados à API escolhida, usando a sua chave. Nada é enviado com o assistente desligado.'),
      field('ai-pv', 'Provedor'),
      h('select', { id: 'ai-pv', on: { change: (e) => { c.provider = (e.target as HTMLSelectElement).value as AiSettings['provider']; c.model = DEFAULT_MODEL[c.provider]; refresh(); } } },
        h('option', { value: 'anthropic', selected: c.provider === 'anthropic' }, 'Anthropic (Claude)'),
        h('option', { value: 'openai', selected: c.provider === 'openai' }, 'OpenAI'),
        h('option', { value: 'gemini', selected: c.provider === 'gemini' }, 'Google (Gemini)')),
      field('ai-key', 'Chave de API (fica só neste navegador)'),
      h('input', { id: 'ai-key', type: 'password', autocomplete: 'off', value: c.apiKey, placeholder: KEY_HINT[c.provider], on: { input: (e) => { c.apiKey = (e.target as HTMLInputElement).value.trim(); } } }),
      field('ai-md', 'Modelo'),
      h('input', { id: 'ai-md', value: c.model || DEFAULT_AI.model, on: { input: (e) => { c.model = (e.target as HTMLInputElement).value.trim(); } } }),
      field('ai-cx', 'Sobre o seu negócio, produtos e tom de voz'),
      h('textarea', { id: 'ai-cx', rows: 4, placeholder: 'Ex.: Vendemos planos de manutenção de ar-condicionado. Tom informal e direto. Nunca informar preço sem avaliar o local.', on: { input: (e) => { c.context = (e.target as HTMLTextAreaElement).value; } } }, c.context),
      toggle('ai-auto', 'Analisar mensagens recebidas automaticamente', 'autoAnalyze'),
      toggle('ai-stage', 'Deixar a IA mover o lead de etapa', 'autoStage'),
      h('div', { class: 'inline', style: 'margin-top:10px' },
        h('button', { class: 'btn', on: { click: () => void save() } }, 'Salvar'),
        h('button', { class: 'btn ghost', on: { click: async () => {
          await saveAiSettings(c);
          try { await testConnection(); toast(root, 'Conexão OK.'); } catch (err) { toast(root, err instanceof Error ? err.message : String(err)); }
        } } }, 'Testar conexão'))));
  nodes.push(details);
  return nodes;
}
