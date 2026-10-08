import type { AiSettings, Automation, QuickReply, Rule, Stage } from '../types';
import { emitDataChange } from './bus';
import { AI_SETTINGS_KEY, AUTOMATIONS_KEY, AUTOMATION_LOG_KEY, CRM_STAGES_KEY, QUICK_REPLIES_KEY, RULES_KEY } from './keys';

export const DEFAULT_STAGES: Stage[] = [
  { id: 'lead', name: 'Lead', color: '#3b82f6', order: 0 },
  { id: 'negotiation', name: 'Em negociação', color: '#f59e0b', order: 1 },
  { id: 'closed', name: 'Fechado', color: '#10b981', order: 2 },
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
