import type { AiSettings, Automation, FieldDef, Product, QuickReply, Rule, Stage, Template, ViewPrefs } from '../types';
import { emitDataChange } from './bus';
import { AI_SETTINGS_KEY, AUTOMATIONS_KEY, AUTOMATION_LOG_KEY, CRM_STAGES_KEY, QUICK_REPLIES_KEY, RULES_KEY, VIEW_PREFS_KEY, CUSTOM_FIELDS_KEY, TAG_COLORS_KEY, PRODUCTS_KEY, TEMPLATES_KEY, NOTIFIED_KEY } from './keys';

export const DEFAULT_STAGES: Stage[] = [
  { id: 'lead', name: 'Lead', color: '#3b82f6', order: 0, probability: 10 },
  { id: 'negotiation', name: 'Em negociação', color: '#f59e0b', order: 1, probability: 50 },
  { id: 'closed', name: 'Fechado', color: '#10b981', order: 2, probability: 100 },
];

const DEFAULT_REPLIES: QuickReply[] = [
  { id: 'qr-oi', shortcut: 'oi', title: 'Saudação', text: '{saudacao}, {primeiro_nome}! Tudo bem? Como posso te ajudar?' },
  { id: 'qr-preco', shortcut: 'preco', title: 'Preços', text: 'Olá {primeiro_nome}! Vou te passar os valores agora mesmo.' },
];

export const DEFAULT_AI: AiSettings = {
  enabled: false,
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-haiku-4-5-20251001',
  context: '',
  autoAnalyze: false,
  autoStage: true,
};

async function get<T>(key: string, fallback: T): Promise<T> {
  const res = await chrome.storage.local.get(key);
  return (res[key] as T | undefined) ?? fallback;
}

async function set<T>(key: string, value: T, emit = true): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
  if (emit) emitDataChange();
}

export const getStages = async () => (await get<Stage[]>(CRM_STAGES_KEY, DEFAULT_STAGES)).slice().sort((a, b) => a.order - b.order);
export const saveStages = (v: Stage[]) => set(CRM_STAGES_KEY, v);
export const getQuickReplies = () => get<QuickReply[]>(QUICK_REPLIES_KEY, DEFAULT_REPLIES);
export const saveQuickReplies = (v: QuickReply[]) => set(QUICK_REPLIES_KEY, v);
export const getRules = () => get<Rule[]>(RULES_KEY, []);
export const saveRules = (v: Rule[]) => set(RULES_KEY, v);
export const getAutomations = () => get<Automation[]>(AUTOMATIONS_KEY, []);
export const saveAutomations = (v: Automation[]) => set(AUTOMATIONS_KEY, v);
/** Registro de disparos "parado na etapa" (evita repetir o mesmo follow-up). */
export const getAutomationLog = () => get<Record<string, number>>(AUTOMATION_LOG_KEY, {});
export const saveAutomationLog = (v: Record<string, number>) => set(AUTOMATION_LOG_KEY, v, false);
export const getAiSettings = async (): Promise<AiSettings> => ({ ...DEFAULT_AI, ...(await get<Partial<AiSettings>>(AI_SETTINGS_KEY, {})) });
export const saveAiSettings = (v: AiSettings) => set(AI_SETTINGS_KEY, v);
export const DEFAULT_VIEW: ViewPrefs = { hideGroups: true, showInternal: false, statusFilter: 'all', autoOpen: true, notifyTasks: true };
export const getViewPrefs = async (): Promise<ViewPrefs> => ({ ...DEFAULT_VIEW, ...(await get<Partial<ViewPrefs>>(VIEW_PREFS_KEY, {})) });
export const saveViewPrefs = (v: ViewPrefs) => set(VIEW_PREFS_KEY, v);
export const getFields = () => get<FieldDef[]>(CUSTOM_FIELDS_KEY, []);
export const saveFields = (v: FieldDef[]) => set(CUSTOM_FIELDS_KEY, v);
/** Matiz (0-360) escolhido pelo usuário para cada etiqueta; sem entrada, a cor sai do nome. */
export const getTagColors = () => get<Record<string, number>>(TAG_COLORS_KEY, {});
export const saveTagColors = (v: Record<string, number>) => set(TAG_COLORS_KEY, v);
export const getProducts = () => get<Product[]>(PRODUCTS_KEY, []);
export const saveProducts = (v: Product[]) => set(PRODUCTS_KEY, v);
const DEFAULT_TEMPLATES: Template[] = [
  { id: 'tpl-proposta', title: 'Envio de proposta', category: 'Vendas', text: '{saudacao}, {primeiro_nome}! Segue a proposta que combinamos. Qualquer dúvida, é só me chamar por aqui.' },
  { id: 'tpl-followup', title: 'Retomar contato', category: 'Follow-up', text: 'Oi, {primeiro_nome}! Passando para saber se conseguiu ver a proposta. Posso ajudar em algo?' },
  { id: 'tpl-posvenda', title: 'Pós-venda', category: 'Pós-venda', text: 'Oi, {primeiro_nome}! Tudo certo com o seu pedido? Se puder, me conta o que achou.' },
];
export const getTemplates = () => get<Template[]>(TEMPLATES_KEY, DEFAULT_TEMPLATES);
export const saveTemplates = (v: Template[]) => set(TEMPLATES_KEY, v);
/** Avisos de tarefa já mostrados: id da tarefa -> "YYYY-MM-DD|tipo" (um aviso por tarefa por situação). */
export const getNotified = () => get<Record<string, string>>(NOTIFIED_KEY, {});
export const saveNotified = (v: Record<string, string>) => set(NOTIFIED_KEY, v, false);
