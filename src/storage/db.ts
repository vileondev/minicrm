import type { ChatContext, Contact } from '../types';
import { emitDataChange } from './bus';
import { CONTACTS_STORE, DB_NAME, DB_VERSION } from './keys';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CONTACTS_STORE)) {
        req.result.createObjectStore(CONTACTS_STORE, { keyPath: 'phone' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const store = async (mode: IDBTransactionMode) => (await openDb()).transaction(CONTACTS_STORE, mode).objectStore(CONTACTS_STORE);

/** Registros antigos podem não ter os campos novos. */
function normalize(c: Contact): Contact {
  c.tags ??= [];
  c.notes ??= [];
  c.tasks ??= [];
  c.value ??= 0;
  c.createdAt ??= c.updatedAt ?? Date.now();
  c.stageId ??= null;
  c.stageHistory ??= [{ stageId: c.stageId, at: c.stageChangedAt ?? c.createdAt }];
  return c;
}

export const getContact = async (key: string) => {
  const c = await wrap<Contact | undefined>((await store('readonly')).get(key));
  return c ? normalize(c) : undefined;
};

export const getAllContacts = async (): Promise<Contact[]> =>
  (await wrap<Contact[]>((await store('readonly')).getAll())).map(normalize);

/** Toda gravação passa aqui: se a etapa mudou desde a última entrada do histórico, registra a mudança. */
function trackStage(c: Contact, now: number): void {
  const hist = (c.stageHistory ??= []);
  if (hist.length && hist[hist.length - 1]!.stageId === c.stageId) return;
  hist.push({ stageId: c.stageId, at: now });
  if (hist.length > 1) c.stageChangedAt = now;
}

export async function putContact(contact: Contact, silent = false): Promise<void> {
  contact.updatedAt = Date.now();
  trackStage(contact, contact.updatedAt);
  await wrap((await store('readwrite')).put(contact));
  if (!silent) emitDataChange();
}

export async function deleteContact(key: string): Promise<void> {
  await wrap((await store('readwrite')).delete(key));
  emitDataChange();
}

/**
 * Troca a chave de um lead (ex.: "name_lucas" -> "5587999999999") quando o número é descoberto.
 * Se já existir um lead com a chave nova, junta os dois: tags, tarefas, notas e histórico somados.
 */
export async function rekeyContact(oldKey: string, newKey: string, number?: string): Promise<Contact | undefined> {
  const old = await getContact(oldKey);
  if (!old) return undefined;
  const target = oldKey === newKey ? undefined : await getContact(newKey);
  const merged: Contact = target
    ? { ...target,
        stageId: target.stageId ?? old.stageId,
        tags: [...new Set([...target.tags, ...old.tags])],
        tasks: [...target.tasks, ...old.tasks.filter((t) => !target.tasks.some((x) => x.id === t.id))],
        notes: [...target.notes, ...old.notes.filter((n) => !target.notes.some((x) => x.id === n.id))].sort((a, b) => b.createdAt - a.createdAt),
        value: target.value || old.value,
        stageHistory: [...(old.stageHistory ?? []), ...(target.stageHistory ?? [])].sort((a, b) => a.at - b.at),
        createdAt: Math.min(target.createdAt, old.createdAt) }
    : { ...old, phone: newKey };
  if (number) merged.number = number;
  if (oldKey !== newKey) await wrap((await store('readwrite')).delete(oldKey));
  await putContact(merged);
  return merged;
}

export async function replaceAllContacts(contacts: Contact[]): Promise<void> {
  const s = await store('readwrite');
  await wrap(s.clear());
  for (const c of contacts) await wrap((await store('readwrite')).put(c));
  emitDataChange();
}

export function blankContact(key: string, name: string): Contact {
  const now = Date.now();
  return { phone: key, name, stageId: null, tags: [], notes: [], tasks: [], value: 0, createdAt: now, updatedAt: now };
}

export async function getOrCreateContact(ctx: ChatContext): Promise<Contact> {
  const existing = await getContact(ctx.key);
  if (existing) {
    const rename = !!ctx.name && existing.name !== ctx.name;
    const group = ctx.isGroup && !existing.isGroup;
    if (rename || group) {
      if (rename) existing.name = ctx.name;
      if (group) existing.isGroup = true;
      await putContact(existing);
    }
    return existing;
  }
  // lead importado só pelo nome (name_…) agora identificado de verdade: migra o registro
  if (!ctx.byName) {
    const legacy = (await getAllContacts()).find((c) => c.phone.startsWith('name_') && c.name === ctx.name);
    if (legacy) {
      await deleteContact(legacy.phone);
      legacy.phone = ctx.key;
      await putContact(legacy);
      return legacy;
    }
  }
  const created = blankContact(ctx.key, ctx.name);
  if (ctx.isGroup) created.isGroup = true;
  if (ctx.number) created.number = ctx.number;
  await putContact(created);
  return created;
}
