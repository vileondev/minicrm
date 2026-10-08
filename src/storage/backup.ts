import type { Automation, Contact, FieldDef, Product, QuickReply, Rule, Stage, Template } from '../types';
import { getAutomations, getFields, getQuickReplies, getRules, getProducts, getStages, getTagColors, getTemplates, saveAutomations, saveFields, saveProducts, saveQuickReplies, saveRules, saveStages, saveTagColors, saveTemplates } from './chromeStore';
import { getAllContacts, replaceAllContacts } from './db';

interface Backup {
  version: 1;
  exportedAt: string;
  stages: Stage[];
  quickReplies: QuickReply[];
  rules: Rule[];
  automations?: Automation[]; // a chave de API da IA NÃO entra no backup
  fields?: FieldDef[];
  products?: Product[];
  templates?: Template[];
  tagColors?: Record<string, number>;
  contacts: Contact[];
}

export async function exportBackup(): Promise<string> {
  const data: Backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stages: await getStages(),
    quickReplies: await getQuickReplies(),
    rules: await getRules(),
    automations: await getAutomations(),
    fields: await getFields(),
    products: await getProducts(),
    templates: await getTemplates(),
    tagColors: await getTagColors(),
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
  await saveAutomations(data.automations ?? []);
  await saveFields(data.fields ?? []);
  await saveProducts(data.products ?? []);
  if (data.templates) await saveTemplates(data.templates);
  await saveTagColors(data.tagColors ?? {});
  await replaceAllContacts(data.contacts);
  return data.contacts.length;
}
