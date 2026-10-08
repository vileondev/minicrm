import type { AiSettings, Automation, ChatContext, Contact, QuickReply, Stage, ViewPrefs } from '../types';
import { DEFAULT_AI, DEFAULT_VIEW, getAiSettings, getAutomations, getQuickReplies, getStages, getViewPrefs } from '../storage/chromeStore';
import { normalizeName } from '../utils/format';
import { getAllContacts } from '../storage/db';
import { onDataChange } from '../storage/bus';

/** Estado compartilhado em memória (cache de leitura para as views, as badges da lista e o motor de automação). */
export const state = {
  chat: null as ChatContext | null,
  contacts: [] as Contact[],
  stages: [] as Stage[],
  quickReplies: [] as QuickReply[],
  automations: [] as Automation[],
  ai: DEFAULT_AI as AiSettings,
  view: DEFAULT_VIEW as ViewPrefs,
};

let rawChat: ChatContext | null = null; // como o observer leu, antes de aplicar números vinculados

/**
 * O WhatsApp só identifica muitas conversas pelo nome. Se o lead com esse nome já tem número vinculado,
 * a conversa passa a usar a chave do lead: assim card, painel e fluxos falam do mesmo registro.
 */
export function resolveChat(ctx: ChatContext | null): ChatContext | null {
  if (!ctx || !ctx.byName || ctx.isGroup) return ctx;
  const name = normalizeName(ctx.name);
  const linked = state.contacts.find((c) => c.number && !c.isGroup && normalizeName(c.name) === name);
  return linked ? { ...ctx, key: linked.phone, number: linked.number ?? null, byName: false } : ctx;
}

export function setChat(ctx: ChatContext | null): void {
  rawChat = ctx;
  state.chat = resolveChat(ctx);
}

export async function reloadState(): Promise<void> {
  [state.contacts, state.stages, state.quickReplies, state.automations, state.ai, state.view] = await Promise.all([
    getAllContacts(), getStages(), getQuickReplies(), getAutomations(), getAiSettings(), getViewPrefs(),
  ]);
  state.chat = resolveChat(rawChat);
}

export function watchState(after: () => void | Promise<void>): void {
  let t: number | undefined;
  onDataChange(() => {
    window.clearTimeout(t);
    t = window.setTimeout(async () => {
      await reloadState();
      await after();
    }, 30);
  });
}
