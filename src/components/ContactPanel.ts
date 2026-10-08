import type { ChatContext, Contact, FieldDef } from '../types';
import { blankContact, deleteContact, putContact, rekeyContact } from '../storage/db';
import { readNumberFromProfile } from '../content/profile';
import { isAwaiting, setStatus } from '../content/conversations';
import { readMessages } from '../content/messages';
import { state } from '../content/state';
import { sanitizePhone } from '../utils/domHelpers';
import { fullDate, looseName, relDay, relTime, slug, tagHue, todayStr } from '../utils/format';
import { icon } from './icons';
import { h, toast, uid } from './h';

/** Lead da conversa: pela chave ou, para leads importados só pelo nome, pelo nome. */
export function leadFor(chat: ChatContext): { existing?: Contact; legacy?: Contact } {
  const byKey = state.contacts.find((c) => c.phone === chat.key);
  if (byKey) return { existing: byKey };
  const legacy = state.contacts.find((c) => c.phone.startsWith('name_') && looseName(c.name) === looseName(chat.name));
  return { existing: legacy, legacy: legacy && legacy.phone !== chat.key ? legacy : undefined };
}

/** Variáveis {slug} dos campos personalizados de um contato, para respostas rápidas e fluxos. */
export function fieldVars(c: Contact | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of state.fields) {
    const v = c?.fields?.[f.id];
    if (v) out[slug(f.name)] = f.type === 'date' ? new Date(v + 'T00:00').toLocaleDateString('pt-BR') : v;
  }
  return out;
}

export function transcript(chat: ChatContext): string {
  const msgs = readMessages(chat.name, 1000);
  const head = `Conversa com ${chat.name}${chat.number ? ' (+' + chat.number + ')' : ''}\nExportada em ${fullDate(Date.now())}\n`;
  const lines = msgs.map((m) => {
    const who = m.out ? 'Você' : m.author || chat.name;
    const when = m.at ? fullDate(m.at) : m.time;
    return `[${when}] ${who}: ${m.quote ? `(respondendo "${m.quote}") ` : ''}${m.text}`;
  });
  return head + '\n' + (lines.length ? lines.join('\n') : '(nenhuma mensagem carregada)') + '\n';
}

function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  h('a', { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

function fieldInput(f: FieldDef, value: string, onChange: (v: string) => void): HTMLElement {
  const id = 'cf-' + f.id;
  const change = (e: Event) => onChange((e.target as HTMLInputElement).value.trim());
  if (f.type === 'select') {
    return h('select', { id, on: { change } }, h('option', { value: '' }, 'Escolha'),
      ...(f.options ?? []).map((o) => h('option', { value: o, selected: o === value }, o)));
  }
  return h('input', { id, type: f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text', value, on: { change } });
}

/**
 * Painel do contato da conversa aberta: cabeçalho com status, telefone, etapa, valor, tags, campos, tarefas,
 * notas e transcrição. Usado na coluna direita da caixa de entrada e no painel lateral sobre o WhatsApp.
 */
export function contactPanel(root: ShadowRoot, chat: ChatContext | null): Node[] {
  if (!chat) {
    return [h('div', { class: 'empty' }, icon('users'), 'Nenhuma conversa aberta.', 'Escolha uma conversa para ver os dados do contato.')];
  }
  const { existing, legacy } = leadFor(chat);
  const contact: Contact = existing ? { ...existing } : blankContact(chat.key, chat.name);
  contact.phone = chat.key;
  contact.name = chat.name || contact.name;
  if (chat.isGroup) contact.isGroup = true;

  const save = async () => {
    await putContact(contact);
    if (legacy) await deleteContact(legacy.phone);
  };

  /* ---------- cabeçalho ---------- */
  const known = contact.number ?? (/^\d{8,}$/.test(contact.phone) ? contact.phone : null);
  const copyBtn = known ? h('button', { class: 'x', title: 'Copiar telefone', 'aria-label': 'Copiar telefone', on: { click: async () => {
    await navigator.clipboard.writeText('+' + known);
    toast(root, 'Telefone copiado.');
  } } }, icon('copy', 14)) : null;

  const statusSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Status da conversa' },
    ...(['open', 'resolved'] as const).map((s) => {
      const on = (contact.status ?? 'open') === s;
      return h('button', { class: 'pill' + (on ? ' on' : ''), 'aria-pressed': String(on), on: { click: async () => {
        if (!existing) await save();
        await setStatus(contact, s);
      } } }, icon(s === 'open' ? 'chat' : 'check', 14), s === 'open' ? 'Aberta' : 'Resolvida');
    }));

  const facts = h('dl', { class: 'facts' },
    h('dt', {}, 'No CRM desde'), h('dd', { title: existing ? fullDate(contact.createdAt) : '' }, existing ? relTime(contact.createdAt) : 'ainda não é lead'),
    h('dt', {}, 'Última mensagem'), h('dd', { title: contact.lastMsgAt ? fullDate(contact.lastMsgAt) : '' }, contact.lastMsgAt ? relTime(contact.lastMsgAt) : 'sem registro'),
    isAwaiting(contact) ? h('dt', {}, 'Aguardando') : null,
    isAwaiting(contact) ? h('dd', { class: 'warn-text' }, 'cliente esperando resposta ' + relTime(contact.awaitingSince!)) : null);

  const header = h('div', { class: 'sec cp-head' },
    h('div', { class: 'cp-id' },
      h('div', { class: 'grow' },
        h('b', {}, chat.name),
        h('span', { class: 'muted' }, chat.isGroup ? 'Grupo' : known ? '+' + known : 'Sem número vinculado', copyBtn))),
    statusSeg, facts);

  /* ---------- número ---------- */
  const link = async (raw: string) => {
    const digits = sanitizePhone(raw);
    if (!/^\d{8,15}$/.test(digits)) return toast(root, 'Número inválido. Use DDI + DDD + número, ex.: 5587999999999.');
    if (!existing) await putContact(contact, true);
    else if (legacy) await save();
    await rekeyContact(contact.phone, digits, digits);
    toast(root, `Número +${digits} vinculado a ${contact.name}.`);
  };
  const numIn = h('input', { id: 'cp-num', type: 'tel', placeholder: '5587999999999', value: contact.number ?? '' });
  numIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') void link(numIn.value); });
  const readBtn = h('button', { class: 'btn ghost sm', title: 'Abre os dados do contato no WhatsApp, lê o número e fecha', on: { click: async () => {
    readBtn.setAttribute('disabled', '');
    const n = await readNumberFromProfile();
    readBtn.removeAttribute('disabled');
    if (n) await link(n);
    else toast(root, 'Não achei o número nos dados do contato. Digite manualmente.');
  } } }, icon('phone', 14), 'Ler do perfil');
  const numberSec = chat.isGroup || known ? null : h('div', { class: 'sec' }, h('h4', {}, 'Vincular telefone'),
    h('p', { class: 'muted' }, 'Leads só com nome se perdem quando o nome muda. Com o número, a conversa abre sempre.'),
    h('label', { class: 'field', for: 'cp-num' }, 'Telefone com DDI e DDD'),
    h('div', { class: 'inline' }, numIn, h('button', { class: 'btn sm', on: { click: () => void link(numIn.value) } }, 'Vincular')),
    readBtn);

  /* ---------- etapa, valor, tags ---------- */
  const stageBtns = h('div', { class: 'stages' },
    h('button', { class: 'pill' + (!contact.stageId ? ' on' : ''), 'aria-pressed': String(!contact.stageId), on: { click: () => { contact.stageId = null; void save(); } } }, 'Sem etapa'),
    ...state.stages.map((s) => h('button', { class: 'pill' + (contact.stageId === s.id ? ' on' : ''), 'aria-pressed': String(contact.stageId === s.id), on: { click: () => { contact.stageId = s.id; void save(); } } },
      h('span', { class: 'dot', style: `background:${s.color}` }), s.name)));

  const value = h('input', { id: 'cp-value', type: 'number', min: '0', step: '10', placeholder: '0', value: contact.value ? String(contact.value) : '',
    on: { change: (e) => { contact.value = Math.max(0, Number((e.target as HTMLInputElement).value) || 0); void save(); } } });

  const knownTags = [...new Set(state.contacts.flatMap((c) => c.tags))].filter((t) => !contact.tags.includes(t));
  const tagIn = h('input', { id: 'cp-tag', placeholder: 'Nova tag + Enter', list: 'wacrm-tags' });
  const addTag = () => { const v = tagIn.value.trim().replace(/,$/, ''); if (v) { contact.tags = [...new Set([...contact.tags, v])]; void save(); } };
  tagIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } });

  /* ---------- campos personalizados ---------- */
  const fieldsSec = state.fields.length ? h('div', { class: 'sec' }, h('h4', {}, 'Campos'),
    ...state.fields.map((f) => h('div', {},
      h('label', { class: 'field', for: 'cf-' + f.id }, f.name),
      fieldInput(f, contact.fields?.[f.id] ?? '', (v) => {
        const next = { ...(contact.fields ?? {}) };
        if (v) next[f.id] = v; else delete next[f.id];
        contact.fields = next;
        void save();
      })))) : null;

  /* ---------- tarefas e notas ---------- */
  const taskIn = h('input', { id: 'cp-task', placeholder: 'Ex.: enviar proposta' });
  const dueIn = h('input', { type: 'date', 'aria-label': 'Prazo da tarefa', value: '' });
  const addTask = () => { const v = taskIn.value.trim(); if (v) { contact.tasks = [...contact.tasks, { id: uid(), text: v, done: false, createdAt: Date.now(), due: dueIn.value || undefined }]; void save(); } };
  taskIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
  const noteIn = h('textarea', { id: 'cp-note', placeholder: 'Escreva uma nota sobre este contato' });

  /* ---------- conversa ---------- */
  const convSec = h('div', { class: 'sec' }, h('h4', {}, 'Conversa'),
    h('p', { class: 'muted' }, 'Inclui as mensagens carregadas na tela. Role a conversa para trazer mensagens mais antigas.'),
    h('div', { class: 'inline wrap' },
      h('button', { class: 'btn ghost sm', on: { click: async () => { await navigator.clipboard.writeText(transcript(chat)); toast(root, 'Transcrição copiada.'); } } }, icon('copy', 14), 'Copiar transcrição'),
      h('button', { class: 'btn ghost sm', on: { click: () => download(`conversa-${chat.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${todayStr()}.txt`, transcript(chat)) } }, icon('download', 14), 'Baixar .txt')));

  return [
    header,
    numberSec,
    h('div', { class: 'sec' }, h('h4', {}, 'Etapa do funil'), stageBtns),
    h('div', { class: 'sec' }, h('label', { class: 'field', for: 'cp-value' }, 'Valor do negócio (R$)'), value),
    h('div', { class: 'sec' }, h('h4', {}, 'Tags'),
      h('div', { class: 'chips' }, ...contact.tags.map((t) => h('span', { class: 'chip', style: `--h:${tagHue(t)}` }, t,
        h('button', { class: 'x', title: 'Remover tag', 'aria-label': 'Remover tag ' + t, on: { click: () => { contact.tags = contact.tags.filter((x) => x !== t); void save(); } } }, icon('x', 12))))),
      tagIn, h('datalist', { id: 'wacrm-tags' }, ...knownTags.map((t) => h('option', { value: t })))),
    fieldsSec,
    h('div', { class: 'sec' }, h('h4', {}, 'Tarefas'),
      ...contact.tasks.map((t) => h('div', { class: 'row' + (t.done ? ' done' : '') + (!t.done && t.due && t.due < todayStr() ? ' late' : '') },
        h('label', {}, h('input', { type: 'checkbox', checked: t.done, on: { change: () => { t.done = !t.done; void save(); } } }), h('span', { class: 't' }, t.text)),
        h('span', { class: 'due muted', title: t.due ? new Date(t.due + 'T00:00').toLocaleDateString('pt-BR') : '' }, t.due ? relDay(t.due) : ''),
        h('button', { class: 'x', title: 'Apagar tarefa', 'aria-label': 'Apagar tarefa', on: { click: () => { contact.tasks = contact.tasks.filter((x) => x.id !== t.id); void save(); } } }, icon('x', 12)))),
      h('div', { style: 'margin-top:8px' }, h('label', { class: 'field', for: 'cp-task' }, 'Nova tarefa'), taskIn,
        h('div', { class: 'inline' }, dueIn, h('button', { class: 'btn sm', on: { click: addTask } }, 'Adicionar')))),
    h('div', { class: 'sec' }, h('h4', {}, 'Notas'), noteIn,
      h('button', { class: 'btn sm', on: { click: () => { const v = noteIn.value.trim(); if (v) { contact.notes = [{ id: uid(), text: v, createdAt: Date.now() }, ...contact.notes]; void save(); } } } }, 'Adicionar nota'),
      h('div', { style: 'margin-top:8px' }, ...contact.notes.map((n) => h('div', { class: 'note' }, n.text,
        h('div', { class: 'muted' }, h('span', { title: fullDate(n.createdAt) }, relTime(n.createdAt)), ' ',
          h('button', { class: 'x', on: { click: () => { contact.notes = contact.notes.filter((x) => x.id !== n.id); void save(); } } }, 'remover')))))),
    convSec,
    h('div', { class: 'sec' },
      h('label', { class: 'check', for: 'cp-internal' },
        h('input', { id: 'cp-internal', type: 'checkbox', checked: !!contact.internal, on: { change: (e) => { contact.internal = (e.target as HTMLInputElement).checked || undefined; void save(); } } }),
        chat.isGroup ? 'Grupo interno (fora do funil, das métricas e dos fluxos)' : 'Contato interno (fora do funil, das métricas e dos fluxos)'),
      existing ? h('button', { class: 'btn ghost sm', on: { click: () => { if (confirm('Remover este lead do CRM?')) void deleteContact(existing.phone); } } }, icon('trash', 14), 'Remover do CRM') : null),
  ].filter((n): n is HTMLDivElement => !!n);
}
