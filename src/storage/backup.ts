import type { Contact, QuickReply, Rule, Stage } from '../types';
import { getQuickReplies, getRules, getStages, saveQuickReplies, saveRules, saveStages } from './chromeStore';
import { getAllContacts, replaceAllContacts } from './db';

interface Backup {
  version: 1;
  exportedAt: string;
  stages: Stage[];
  quickReplies: QuickReply[];
  rules: Rule[];
  contacts: Contact[];
}

export async function exportBackup(): Promise<string> {
  const data: Backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stages: await getStages(),
    quickReplies: await getQuickReplies(),
    rules: await getRules(),
    contacts: await getAllContacts(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importBackup(json: string): Promise<number> {
  const data = JSON.parse(json) as Partial<Backup>;
  if (data.version !== 1 || !Array.isArray(data.contacts)) throw new Error('Arquivo de backup inválido');
  await saveStages(data.stages ?? []);
  await saveQuickReplies(data.quickReplies ?? []);
  await saveRules(data.rules ?? []);
  await replaceAllContacts(data.contacts);
  return data.contacts.length;
}
