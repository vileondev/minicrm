import type { Action, Automation, ChatContext, Contact, QuickReply, Trigger } from '../types';
import { emitDataChange } from '../storage/bus';
import { getAutomationLog, getRules, saveAutomationLog, saveAutomations, saveRules } from '../storage/chromeStore';
import { getOrCreateContact, putContact } from '../storage/db';
import { addDays, applyVars, normalizeName } from '../utils/format';
import { uid } from '../components/h';
import { state } from './state';

/**
 * Motor de fluxos (100% local). Gatilhos: mensagem recebida, lead entra na etapa, tag adicionada, parado na etapa.
 * Ações mexem no CRM ou mostram sugestões. Nenhuma ação envia mensagem: respostas são só sugeridas e o usuário aprova.
 */
export interface AutomationUi {
  suggest(item: { title: string; text: string }, forKey?: string): void;
  notify(message: string): void;
}

let ui: AutomationUi = { suggest: () => undefined, notify: () => undefined };
const snapshot = new Map<string, string>(); // chave do contato -> [etapa, tags], para detectar mudanças
let primed = false;

const sig = (c: Contact) => JSON.stringify([c.stageId, c.tags]);
const stageName = (id: string) => state.stages.find((s) => s.id === id)?.name ?? 'etapa removida';

export function describeTrigger(t: Trigger): string {
  switch (t.type) {
    case 'message': return t.keywords.trim() ? `Mensagem recebida contém "${t.keywords}"` : 'Qualquer mensagem recebida';
    case 'stage': return `Lead entra em "${stageName(t.stageId)}"`;
    case 'tag': return `Tag "${t.tag}" é adicionada`;
    case 'stale': return `Lead parado em "${stageName(t.stageId)}" por ${t.days} dia(s)`;
  }
}

export function describeAction(a: Action): string {
  switch (a.type) {
    case 'suggest': return `Sugerir resposta "${state.quickReplies.find((q) => q.id === a.replyId)?.title ?? 'removida'}"`;
    case 'stage': return `Mover para "${stageName(a.stageId)}"`;
    case 'addTag': return `Adicionar tag "${a.tag}"`;
    case 'removeTag': return `Remover tag "${a.tag}"`;
    case 'task': return `Criar tarefa "${a.text}" para daqui a ${a.dueDays} dia(s)`;
    case 'note': return `Adicionar nota "${a.text}"`;
    case 'notify': return `Mostrar aviso "${a.text}"`;
  }
}

async function runActions(contact: Contact, actions: Action[]): Promise<void> {
  const now = Date.now();
  const chat: ChatContext = { key: contact.phone, number: null, name: contact.name, isGroup: false, byName: false };
  const fill = (t: string) => applyVars(t, chat);

  for (const a of actions) {
    switch (a.type) {
      case 'stage':
        if (contact.stageId !== a.stageId) { contact.stageId = a.stageId; contact.stageChangedAt = now; }
        break;
      case 'addTag':
        if (a.tag && !contact.tags.includes(a.tag)) contact.tags = [...contact.tags, a.tag];
        break;
      case 'removeTag':
        contact.tags = contact.tags.filter((t) => t !== a.tag);
        break;
      case 'task': {
        const text = fill(a.text);
        if (text && !contact.tasks.some((t) => !t.done && t.text === text)) {
          contact.tasks = [...contact.tasks, { id: uid(), text, done: false, createdAt: now, due: addDays(a.dueDays) }];
        }
        break;
      }
      case 'note':
        contact.notes = [{ id: uid(), text: fill(a.text), createdAt: now }, ...contact.notes];
        break;
      case 'suggest': {
        const qr = state.quickReplies.find((q) => q.id === a.replyId);
        if (qr) ui.suggest({ title: qr.title, text: qr.text }, contact.phone);
        break;
      }
      case 'notify':
        ui.notify(`${contact.name}: ${fill(a.text)}`);
        break;
    }
  }
  // grava e atualiza o snapshot ANTES de avisar as views, para as próprias ações não dispararem outros fluxos
  await putContact(contact, true);
  snapshot.set(contact.phone, sig(contact));
  emitDataChange();
}

const match = (a: Automation, type: Trigger['type']) => a.enabled && a.trigger.type === type;

export async function onIncomingMessage(text: string, chat: ChatContext): Promise<void> {
  const flows = state.automations.filter((a) => match(a, 'message'));
  if (!flows.length) return;
  const norm = normalizeName(text);
  for (const a of flows) {
    const t = a.trigger as Extract<Trigger, { type: 'message' }>;
    const words = t.keywords.split(/[,|]/).map(normalizeName).filter(Boolean);
    if (words.length && !words.some((w) => norm.includes(w))) continue;
    const contact = state.contacts.find((c) => c.phone === chat.key) ?? (await getOrCreateContact(chat));
    await runActions(contact, a.actions);
  }
}

/** Compara o estado novo com o snapshot e dispara "entra na etapa" e "tag adicionada". Chamar após cada reloadState. */
export async function onDataChanged(): Promise<void> {
  const events: { c: Contact; stageChanged: boolean; newTags: string[] }[] = [];
  for (const c of state.contacts) {
    const old = snapshot.get(c.phone);
    if (primed && old !== undefined) {
      const [oStage, oTags] = JSON.parse(old) as [string | null, string[]];
      const stageChanged = oStage !== c.stageId;
      const newTags = c.tags.filter((t) => !oTags.includes(t));
      if (stageChanged || newTags.length) events.push({ c, stageChanged, newTags });
    }
    snapshot.set(c.phone, sig(c));
  }
  primed = true;

  for (const { c, stageChanged, newTags } of events) {
    if (stageChanged) {
      c.stageChangedAt = Date.now();
      await putContact(c, true);
      snapshot.set(c.phone, sig(c));
    }
    for (const a of state.automations) {
      if (stageChanged && match(a, 'stage') && c.stageId && (a.trigger as { stageId: string }).stageId === c.stageId) await runActions(c, a.actions);
      if (match(a, 'tag') && newTags.includes((a.trigger as { tag: string }).tag)) await runActions(c, a.actions);
    }
  }
}

/** "Parado na etapa": roda a cada 5 min e no início. O log evita repetir o follow-up para a mesma permanência. */
export async function checkStale(): Promise<void> {
  const flows = state.automations.filter((a) => match(a, 'stale'));
  if (!flows.length) return;
  const log = await getAutomationLog();
  let dirty = false;
  for (const a of flows) {
    const t = a.trigger as Extract<Trigger, { type: 'stale' }>;
    for (const c of state.contacts.filter((x) => x.stageId === t.stageId)) {
      const since = c.stageChangedAt ?? c.createdAt;
      const key = `${a.id}|${c.phone}`;
      if (Date.now() - since < t.days * 86400000 || log[key] === since) continue;
      log[key] = since;
      dirty = true;
      await runActions(c, a.actions);
    }
  }
  if (dirty) await saveAutomationLog(log);
}

/** Converte as regras antigas (palavra-chave -> sugestão) em fluxos, uma única vez. */
async function migrateRules(): Promise<void> {
  const rules = await getRules();
  if (!rules.length) return;
  const migrated: Automation[] = rules.map((r) => ({
    id: uid(),
    name: `Sugerir resposta para "${r.keyword}"`,
    enabled: r.enabled,
    trigger: { type: 'message', keywords: r.keyword },
    actions: [{ type: 'suggest', replyId: r.quickReplyId }],
  }));
  await saveAutomations([...state.automations, ...migrated]);
  await saveRules([]);
}

export function initAutomation(handlers: AutomationUi): void {
  ui = handlers;
  void migrateRules();
  window.setInterval(() => void checkStale(), 5 * 60_000);
  window.setTimeout(() => void checkStale(), 8000);
}

/** Modelos prontos, montados com as etapas e respostas do usuário. */
export function presets(): { name: string; build: () => Automation }[] {
  const stages = state.stages;
  const mid = stages[1] ?? stages[0];
  const last = stages[stages.length - 1];
  const priceReply: QuickReply | undefined = state.quickReplies.find((q) => /pre[cç]o|valor/i.test(q.shortcut + q.title));
  const out: { name: string; build: () => Automation }[] = [];
  if (mid) out.push({ name: `Follow-up: lead parado 3 dias em "${mid.name}"`, build: () => ({ id: uid(), name: 'Follow-up após 3 dias', enabled: true,
    trigger: { type: 'stale', stageId: mid.id, days: 3 }, actions: [{ type: 'task', text: 'Fazer follow-up com {nome}', dueDays: 0 }, { type: 'addTag', tag: 'follow-up' }] }) });
  if (mid) out.push({ name: 'Cliente perguntou preço: mover e sugerir resposta', build: () => ({ id: uid(), name: 'Pediu preço', enabled: true,
    trigger: { type: 'message', keywords: 'preço, valor, quanto custa, orçamento' },
    actions: [{ type: 'addTag', tag: 'interessado' }, { type: 'stage', stageId: mid.id }, ...(priceReply ? [{ type: 'suggest' as const, replyId: priceReply.id }] : [])] }) });
  if (last) out.push({ name: `Venda fechada: pedir indicação em 7 dias`, build: () => ({ id: uid(), name: 'Pós-venda', enabled: true,
    trigger: { type: 'stage', stageId: last.id }, actions: [{ type: 'note', text: 'Venda fechada em {data}.' }, { type: 'task', text: 'Pedir indicação para {nome}', dueDays: 7 }] }) });
  return out;
}
