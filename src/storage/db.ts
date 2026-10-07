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
  return c;
}

export const getContact = async (key: string) => {
  const c = await wrap<Contact | undefined>((await store('readonly')).get(key));
  return c ? normalize(c) : undefined;
};

export const getAllContacts = async (): Promise<Contact[]> =>
  (await wrap<Contact[]>((await store('readonly')).getAll())).map(normalize);

export async function putContact(contact: Contact, silent = false): Promise<void> {
  contact.updatedAt = Date.now();
  await wrap((await store('readwrite')).put(contact));
  if (!silent) emitDataChange();
}

export async function deleteContact(key: string): Promise<void> {
  await wrap((await store('readwrite')).delete(key));
  emitDataChange();
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
    if (ctx.name && existing.name !== ctx.name) {
      existing.name = ctx.name;
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
  await putContact(created);
  return created;
}
