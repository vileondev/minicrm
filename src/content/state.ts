import type { AiSettings, Automation, ChatContext, Contact, QuickReply, Stage } from '../types';
import { DEFAULT_AI, getAiSettings, getAutomations, getQuickReplies, getStages } from '../storage/chromeStore';
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
};

export async function reloadState(): Promise<void> {
  [state.contacts, state.stages, state.quickReplies, state.automations, state.ai] = await Promise.all([
    getAllContacts(), getStages(), getQuickReplies(), getAutomations(), getAiSettings(),
  ]);
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
