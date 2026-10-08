import type { Contact } from '../types';
import { getQuickReplies, saveQuickReplies } from '../storage/chromeStore';
import { blankContact, deleteContact, putContact, rekeyContact } from '../storage/db';
import { readNumberFromProfile } from '../content/profile';
import { exportBackup, importBackup } from '../storage/backup';
import { collectDiagnostics } from '../content/diagnostics';
import { state } from '../content/state';
import { replaceTokenWithText, sanitizePhone } from '../utils/domHelpers';
import { applyVars, avatarColor, initials, tagHue, todayStr } from '../utils/format';
import { aiView } from './AiPanel';
import { flowsView } from './Flows';
import { icon } from './icons';
import { h, toast, uid } from './h';

type Tab = 'contact' | 'ai' | 'flows' | 'replies' | 'data';

export interface Panel {
  toggle(): void;
  refresh(): void;
}

export function mountPanel(root: ShadowRoot): Panel {
  let tab: Tab = 'contact';
  const body = h('div', { class: 'body' });
  const head = h('div', { class: 'phead' });
  const tabsEl = h('div', { class: 'tabs' });
  const panel = h('div', { class: 'panel hidden' }, head, tabsEl, body);
  root.append(panel);

  const isOpen = () => !panel.classList.contains('hidden');

  function refresh() {
    if (!isOpen()) return;
    const chat = state.chat;
    head.replaceChildren(
      h('div', { class: 'avatar', style: `background:${avatarColor(chat?.name ?? '?')}` }, initials(chat?.name ?? '?')),
      h('div', { class: 'grow' },
        h('b', {}, chat?.name || 'Nenhuma conversa'),
        h('span', { class: 'muted' }, !chat ? 'Abra uma conversa' : chat.isGroup ? 'Grupo' : chat.number ? '+' + chat.number : chat.byName ? 'Identificado pelo nome' : 'Número oculto pelo WhatsApp')),
      h('button', { class: 'x', title: 'Fechar', on: { click: () => api.toggle() } }, icon('x', 12)));
    tabsEl.replaceChildren(
      ...([['contact', 'Contato'], ['ai', 'IA'], ['flows', 'Fluxos'], ['replies', 'Respostas'], ['data', 'Dados']] as const).map(([id, label]) =>
        h('button', { class: 'tab' + (tab === id ? ' active' : ''), on: { click: () => { tab = id; refresh(); } } }, label)));
    void renderBody();
  }

  async function renderBody() {
    try {
      const content = tab === 'contact' ? contactView() : tab === 'ai' ? aiView(root, refresh) : tab === 'flows' ? flowsView(root, refresh) : tab === 'replies' ? await repliesView() : dataView();
      body.replaceChildren(...content);
    } catch (err) {
      console.error('[WA CRM] erro ao renderizar painel', err);
      body.replaceChildren(h('p', { class: 'muted' }, 'Erro ao renderizar: ' + String(err)));
    }
  }

  function contactView(): Node[] {
    const chat = state.chat;
    if (!chat) return [h('p', { class: 'muted' }, 'Abra uma conversa para ver e editar o contato.')];

    // lead importado só pelo nome e agora identificado pelo número: reaproveita o registro
    const legacy = !state.contacts.some((c) => c.phone === chat.key) && !chat.byName
      ? state.contacts.find((c) => c.phone.startsWith('name_') && c.name === chat.name) : undefined;
    const existing = state.contacts.find((c) => c.phone === chat.key) ?? legacy;
    const contact: Contact = existing ? { ...existing } : blankContact(chat.key, chat.name);
    contact.phone = chat.key;
    contact.name = chat.name || contact.name;

    const save = async () => {
      await putContact(contact);
      if (legacy) await deleteContact(legacy.phone);
    };

    const stageBtns = h('div', { class: 'stages' },
      h('button', { class: 'pill' + (!contact.stageId ? ' on' : ''), 'aria-pressed': String(!contact.stageId), on: { click: () => { contact.stageId = null; void save(); } } }, 'Sem etapa'),
      ...state.stages.map((s) => h('button', { class: 'pill' + (contact.stageId === s.id ? ' on' : ''), 'aria-pressed': String(contact.stageId === s.id), on: { click: () => { contact.stageId = s.id; void save(); } } },
        h('span', { class: 'dot', style: `background:${s.color}` }), s.name)));

    const value = h('input', { type: 'number', min: '0', step: '10', placeholder: '0', 'aria-label': 'Valor do negócio em reais', value: contact.value ? String(contact.value) : '', on: { change: (e) => { contact.value = Math.max(0, Number((e.target as HTMLInputElement).value) || 0); void save(); } } });

    const knownTags = [...new Set(state.contacts.flatMap((c) => c.tags))].filter((t) => !contact.tags.includes(t));
    const tagIn = h('input', { placeholder: 'Nova tag + Enter', list: 'wacrm-tags' });
    const addTag = () => { const v = tagIn.value.trim().replace(/,$/, ''); if (v) { contact.tags = [...new Set([...contact.tags, v])]; void save(); } };
    tagIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } });
    const datalist = h('datalist', { id: 'wacrm-tags' }, ...knownTags.map((t) => h('option', { value: t })));

    const taskIn = h('input', { placeholder: 'Nova tarefa (ex.: ligar, enviar proposta)' });
    const dueIn = h('input', { type: 'date', value: '' });
    const addTask = () => { const v = taskIn.value.trim(); if (v) { contact.tasks = [...contact.tasks, { id: uid(), text: v, done: false, createdAt: Date.now(), due: dueIn.value || undefined }]; void save(); } };
    taskIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });

    const noteIn = h('textarea', { placeholder: 'Nova nota…' });

    /* número: o WhatsApp não mostra mais nas mensagens; vincular deixa o lead estável e permite abrir a conversa pelo número */
    const link = async (raw: string) => {
      const digits = sanitizePhone(raw);
      if (!/^\d{8,15}$/.test(digits)) return toast(root, 'Número inválido. Use DDI + DDD + número, ex.: 5587999999999.');
      if (!existing) await putContact(contact, true);
      else if (legacy) await save();
      await rekeyContact(contact.phone, digits, digits);
      toast(root, `Número +${digits} vinculado a ${contact.name}.`);
    };
    const numIn = h('input', { type: 'tel', placeholder: '5587999999999', 'aria-label': 'Telefone com DDI e DDD', value: contact.number ?? '' });
    numIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') void link(numIn.value); });
    const readBtn = h('button', { class: 'btn ghost', title: 'Abre os dados do contato no WhatsApp, lê o número e fecha', on: { click: async () => {
      readBtn.setAttribute('disabled', '');
      const n = await readNumberFromProfile();
      readBtn.removeAttribute('disabled');
      if (n) await link(n);
      else toast(root, 'Não achei o número nos dados do contato. Digite manualmente.');
    } } }, icon('phone', 14), 'Ler do perfil');
    const known = contact.number ?? (/^\d{8,}$/.test(contact.phone) ? contact.phone : null);
    const numberSec = chat.isGroup ? null : h('div', { class: 'sec' }, h('h4', {}, 'Telefone'),
      known
        ? h('p', { class: 'muted' }, '+' + known)
        : h('p', { class: 'muted' }, 'Sem número vinculado. Leads identificados só pelo nome se perdem quando o nome muda e são mais difíceis de abrir pelo Kanban.'),
      known ? null : h('div', { class: 'inline' }, numIn, h('button', { class: 'btn', on: { click: () => void link(numIn.value) } }, 'Vincular')),
      known ? null : readBtn);

    const internalSec = h('div', { class: 'sec' },
      h('label', { class: 'check', for: 'ct-internal' },
        h('input', { id: 'ct-internal', type: 'checkbox', checked: !!contact.internal, on: { change: (e) => { contact.internal = (e.target as HTMLInputElement).checked || undefined; void save(); } } }),
        chat.isGroup ? 'Grupo interno (fora do funil, das métricas e dos fluxos)' : 'Contato interno (fora do funil, das métricas e dos fluxos)'));

    const removeBtn = existing
      ? h('button', { class: 'btn ghost', on: { click: () => { if (confirm('Remover este lead do CRM?')) void deleteContact(existing.phone); } } }, 'Remover do CRM')
      : h('span');

    return [
      numberSec,
      h('div', { class: 'sec' }, h('h4', {}, 'Etapa do funil'), stageBtns),
      h('div', { class: 'sec' }, h('h4', {}, 'Valor do negócio (R$)'), value),
      h('div', { class: 'sec' }, h('h4', {}, 'Tags'),
        ...contact.tags.map((t) => h('span', { class: 'chip', style: `--h:${tagHue(t)}` }, t, h('button', { class: 'x', on: { click: () => { contact.tags = contact.tags.filter((x) => x !== t); void save(); } } }, icon('x', 12)))),
        tagIn, datalist),
      h('div', { class: 'sec' }, h('h4', {}, 'Tarefas'),
        ...contact.tasks.map((t) => h('div', { class: 'row' + (t.done ? ' done' : '') + (!t.done && t.due && t.due < todayStr() ? ' late' : '') },
          h('label', {}, h('input', { type: 'checkbox', checked: t.done, on: { change: () => { t.done = !t.done; void save(); } } }), h('span', { class: 't' }, t.text)),
          h('span', { class: 'due muted' }, t.due ? new Date(t.due + 'T00:00').toLocaleDateString('pt-BR') : ''),
          h('button', { class: 'x', on: { click: () => { contact.tasks = contact.tasks.filter((x) => x.id !== t.id); void save(); } } }, icon('x', 12)))),
        h('div', { style: 'margin-top:8px' }, taskIn, h('div', { class: 'inline' }, dueIn, h('button', { class: 'btn', style: 'white-space:nowrap', on: { click: addTask } }, 'Adicionar')))),
      h('div', { class: 'sec' }, h('h4', {}, 'Notas'), noteIn,
        h('button', { class: 'btn', on: { click: () => { const v = noteIn.value.trim(); if (v) { contact.notes = [{ id: uid(), text: v, createdAt: Date.now() }, ...contact.notes]; void save(); } } } }, 'Adicionar nota'),
        h('div', { style: 'margin-top:8px' }, ...contact.notes.map((n) => h('div', { class: 'note' }, n.text,
          h('div', { class: 'muted' }, new Date(n.createdAt).toLocaleString('pt-BR'), ' ', h('button', { class: 'x', on: { click: () => { contact.notes = contact.notes.filter((x) => x.id !== n.id); void save(); } } }, 'remover')))))),
      internalSec,
      removeBtn,
    ].filter((n): n is HTMLElement => !!n);
  }

  async function repliesView(): Promise<Node[]> {
    const replies = await getQuickReplies();
    const sc = h('input', { id: 'qr-sc', placeholder: 'preco' });
    const ti = h('input', { id: 'qr-ti', placeholder: 'Preços' });
    const tx = h('textarea', { id: 'qr-tx', placeholder: 'Olá {primeiro_nome}, segue a tabela de valores.' });
    const lab = (id: string, text: string) => h('label', { class: 'field', for: id }, text);

    return [
      h('div', { class: 'sec' }, h('h4', {}, 'Clique para inserir no chat'),
        ...replies.map((r) => h('div', { class: 'qr', on: { click: () => void replaceTokenWithText(0, applyVars(r.text, state.chat)) } },
          h('div', { class: 'row', style: 'border:0;padding:0' }, h('b', {}, '/' + r.shortcut + ' ' + r.title),
            h('button', { class: 'x', on: { click: (e) => { e.stopPropagation(); void saveQuickReplies(replies.filter((x) => x.id !== r.id)).then(refresh); } } }, icon('x', 12))),
          h('small', {}, r.text)))),
      h('div', { class: 'sec' }, h('h4', {}, 'Nova resposta rápida'),
        lab('qr-sc', 'Atalho (digite / e o atalho no chat)'), sc, lab('qr-ti', 'Título'), ti,
        lab('qr-tx', 'Texto. Variáveis: {nome} {primeiro_nome} {saudacao} {data}'), tx,
        h('button', { class: 'btn', on: { click: async () => {
          const s = sc.value.trim().replace(/^\//, '').replace(/\s+/g, '');
          if (!s || !tx.value.trim()) return toast(root, 'Informe atalho e texto.');
          await saveQuickReplies([...replies, { id: uid(), shortcut: s, title: ti.value.trim() || s, text: tx.value }]);
          refresh();
        } } }, 'Salvar resposta')),
    ];
  }

  function dataView(): Node[] {
    const file = h('input', { type: 'file', accept: 'application/json', class: 'hidden', on: { change: async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try { toast(root, `${await importBackup(await f.text())} contatos importados.`); } catch (err) { toast(root, String(err)); }
    } } });
    return [
      h('div', { class: 'sec' }, h('h4', {}, 'Backup (tudo fica só neste navegador)'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn', on: { click: async () => {
            const url = URL.createObjectURL(new Blob([await exportBackup()], { type: 'application/json' }));
            h('a', { href: url, download: `wa-crm-backup-${todayStr()}.json` }).click();
            URL.revokeObjectURL(url);
          } } }, 'Exportar JSON'),
          h('button', { class: 'btn ghost', on: { click: () => file.click() } }, 'Importar JSON'), file),
        h('p', { class: 'muted' }, 'Importar substitui os dados atuais.')),
      h('div', { class: 'sec' }, h('h4', {}, 'Diagnóstico'),
        h('p', { class: 'muted' }, 'Se o contato não for detectado ou algo parar de funcionar após uma atualização do WhatsApp, copie o diagnóstico (números mascarados).'),
        h('button', { class: 'btn ghost', on: { click: async () => { await navigator.clipboard.writeText(collectDiagnostics()); toast(root, 'Diagnóstico copiado.'); } } }, 'Copiar diagnóstico')),
      h('div', { class: 'sec' }, h('h4', {}, 'Atalhos'),
        h('p', { class: 'muted' }, 'Alt+K abre o Kanban. Alt+P abre este painel. Digite / no chat para usar respostas rápidas.')),
    ];
  }

  const api: Panel = {
    toggle() { panel.classList.toggle('hidden'); refresh(); },
    refresh,
  };
  return api;
}
