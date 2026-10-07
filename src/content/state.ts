import type { ChatContext, Contact, QuickReply, Stage } from '../types';
import { getQuickReplies, getStages } from '../storage/chromeStore';
import { getAllContacts } from '../storage/db';
import { onDataChange } from '../storage/bus';

/** Estado compartilhado em memória (cache de leitura para as views e para as badges da lista). */
export const state = {
  chat: null as ChatContext | null,
  contacts: [] as Contact[],
  stages: [] as Stage[],
  quickReplies: [] as QuickReply[],
};

export async function reloadState(): Promise<void> {
  [state.contacts, state.stages, state.quickReplies] = await Promise.all([getAllContacts(), getStages(), getQuickReplies()]);
}

export function watchState(after: () => void): void {
  let t: number | undefined;
  onDataChange(() => {
    window.clearTimeout(t);
    t = window.setTimeout(async () => {
      await reloadState();
      after();
    }, 30);
  });
}
