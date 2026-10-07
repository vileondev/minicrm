import type { QuickReply, Rule, Stage } from '../types';
import { emitDataChange } from './bus';
import { CRM_STAGES_KEY, QUICK_REPLIES_KEY, RULES_KEY } from './keys';

export const DEFAULT_STAGES: Stage[] = [
  { id: 'lead', name: 'Lead', color: '#3b82f6', order: 0 },
  { id: 'negotiation', name: 'Em negociação', color: '#f59e0b', order: 1 },
  { id: 'closed', name: 'Fechado', color: '#10b981', order: 2 },
];

const DEFAULT_REPLIES: QuickReply[] = [
  { id: 'qr-oi', shortcut: 'oi', title: 'Saudação', text: '{saudacao}, {primeiro_nome}! Tudo bem? Como posso te ajudar?' },
  { id: 'qr-preco', shortcut: 'preco', title: 'Preços', text: 'Olá {primeiro_nome}! Vou te passar os valores agora mesmo.' },
];

async function get<T>(key: string, fallback: T): Promise<T> {
  const res = await chrome.storage.local.get(key);
  return (res[key] as T | undefined) ?? fallback;
}

async function set<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
  emitDataChange();
}

export const getStages = async () => (await get<Stage[]>(CRM_STAGES_KEY, DEFAULT_STAGES)).slice().sort((a, b) => a.order - b.order);
export const saveStages = (v: Stage[]) => set(CRM_STAGES_KEY, v);
export const getQuickReplies = () => get<QuickReply[]>(QUICK_REPLIES_KEY, DEFAULT_REPLIES);
export const saveQuickReplies = (v: QuickReply[]) => set(QUICK_REPLIES_KEY, v);
export const getRules = () => get<Rule[]>(RULES_KEY, []);
export const saveRules = (v: Rule[]) => set(RULES_KEY, v);
