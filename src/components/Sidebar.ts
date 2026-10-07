import type { Contact, QuickReply, Rule } from '../types';
import { getQuickReplies, getRules, saveQuickReplies, saveRules } from '../storage/chromeStore';
import { blankContact, deleteContact, putContact } from '../storage/db';
import { exportBackup, importBackup } from '../storage/backup';
import { collectDiagnostics } from '../content/diagnostics';
import { state } from '../content/state';
import { replaceTokenWithText } from '../utils/domHelpers';
import { applyVars, avatarColor, initials, tagColor, todayStr } from '../utils/format';
import { h, toast, uid } from './h';

type Tab = 'contact' | 'replies' | 'data';

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
      h('button', { class: 'x', title: 'Fechar', on: { click: () => api.toggle() } }, '✕'));
    tabsEl.replaceChildren(
      ...([['contact', 'Contato'], ['replies', 'Respostas'], ['data', 'Dados']] as const).map(([id, label]) =>
        h('button', { class: 'tab' + (tab === id ? ' active' : ''), on: { click: () => { tab = id; refresh(); } } }, label)));
    void renderBody();
  }

  async function renderBody() {
    try {
      const content = tab === 'contact' ? contactView() : tab === 'replies' ? await repliesView() : dataView();
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
      h('button', { class: 'pill' + (!contact.stageId ? ' on' : ''), style: !contact.stageId ? 'background:#8696a0' : '', on: { click: () => { contact.stageId = null; void save(); } } }, 'Sem etapa'),
      ...state.stages.map((s) => h('button', { class: 'pill' + (contact.stageId === s.id ? ' on' : ''), style: contact.stageId === s.id ? `background:${s.color}` : '', on: { click: () => { contact.stageId = s.id; void save(); } } },
        h('span', { class: 'dot', style: `background:${s.color}` }), s.name)));

    const value = h('input', { type: 'number', min: '0', step: '10', placeholder: '0', value: contact.value ? String(contact.value) : '', on: { change: (e) => { contact.value = Math.max(0, Number((e.target as HTMLInputElement).value) || 0); void save(); } } });

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

    const removeBtn = existing
      ? h('button', { class: 'btn ghost', on: { click: () => { if (confirm('Remover este lead do CRM?')) void deleteContact(existing.phone); } } }, 'Remover do CRM')
      : h('span');

    return [
      h('div', { class: 'sec' }, h('h4', {}, 'Etapa do funil'), stageBtns),
      h('div', { class: 'sec' }, h('h4', {}, 'Valor do negócio (R$)'), value),
      h('div', { class: 'sec' }, h('h4', {}, 'Tags'),
        ...contact.tags.map((t) => h('span', { class: 'chip', style: `background:${tagColor(t)}` }, t, h('button', { class: 'x', on: { click: () => { contact.tags = contact.tags.filter((x) => x !== t); void save(); } } }, '✕'))),
        tagIn, datalist),
      h('div', { class: 'sec' }, h('h4', {}, 'Tarefas'),
        ...contact.tasks.map((t) => h('div', { class: 'row' + (t.done ? ' done' : '') + (!t.done && t.due && t.due < todayStr() ? ' late' : '') },
          h('label', {}, h('input', { type: 'checkbox', checked: t.done, on: { change: () => { t.done = !t.done; void save(); } } }), h('span', { class: 't' }, t.text)),
          h('span', { class: 'due muted' }, t.due ? new Date(t.due + 'T00:00').toLocaleDateString('pt-BR') : ''),
          h('button', { class: 'x', on: { click: () => { contact.tasks = contact.tasks.filter((x) => x.id !== t.id); void save(); } } }, '✕'))),
        h('div', { style: 'margin-top:8px' }, taskIn, h('div', { class: 'inline' }, dueIn, h('button', { class: 'btn', style: 'white-space:nowrap', on: { click: addTask } }, 'Adicionar')))),
      h('div', { class: 'sec' }, h('h4', {}, 'Notas'), noteIn,
        h('button', { class: 'btn', on: { click: () => { const v = noteIn.value.trim(); if (v) { contact.notes = [{ id: uid(), text: v, createdAt: Date.now() }, ...contact.notes]; void save(); } } } }, 'Adicionar nota'),
        h('div', { style: 'margin-top:8px' }, ...contact.notes.map((n) => h('div', { class: 'note' }, n.text,
          h('div', { class: 'muted' }, new Date(n.createdAt).toLocaleString('pt-BR'), ' ', h('button', { class: 'x', on: { click: () => { contact.notes = contact.notes.filter((x) => x.id !== n.id); void save(); } } }, 'remover')))))),
      removeBtn,
    ];
  }

  async function repliesView(): Promise<Node[]> {
    const [replies, rules] = await Promise.all([getQuickReplies(), getRules()]);
    const sc = h('input', { placeholder: 'Atalho (ex.: preco → digite /preco)' });
    const ti = h('input', { placeholder: 'Título' });
    const tx = h('textarea', { placeholder: 'Texto. Variáveis: {nome} {primeiro_nome} {saudacao} {data}' });
    const kw = h('input', { placeholder: 'Palavra-chave na mensagem recebida' });
    const qrSel = h('select', {}, ...replies.map((r: QuickReply) => h('option', { value: r.id }, r.title)));

    return [
      h('div', { class: 'sec' }, h('h4', {}, 'Clique para inserir no chat'),
        ...replies.map((r) => h('div', { class: 'qr', on: { click: () => void replaceTokenWithText(0, applyVars(r.text, state.chat)) } },
          h('div', { class: 'row', style: 'border:0;padding:0' }, h('b', {}, '/' + r.shortcut + ' · ' + r.title),
            h('button', { class: 'x', on: { click: (e) => { e.stopPropagation(); void saveQuickReplies(replies.filter((x) => x.id !== r.id)).then(refresh); } } }, '✕')),
          h('small', {}, r.text)))),
      h('div', { class: 'sec' }, h('h4', {}, 'Nova resposta rápida'), sc, ti, tx,
        h('button', { class: 'btn', on: { click: async () => {
          const s = sc.value.trim().replace(/^\//, '').replace(/\s+/g, '');
          if (!s || !tx.value.trim()) return toast(root, 'Informe atalho e texto.');
          await saveQuickReplies([...replies, { id: uid(), shortcut: s, title: ti.value.trim() || s, text: tx.value }]);
          refresh();
        } } }, 'Salvar resposta')),
      h('div', { class: 'sec' }, h('h4', {}, 'Regras: se a mensagem contém → sugerir'),
        ...rules.map((r: Rule) => h('div', { class: 'row' }, h('span', {}, `"${r.keyword}" → ${replies.find((q) => q.id === r.quickReplyId)?.title ?? '?'}`),
          h('button', { class: 'x', on: { click: () => void saveRules(rules.filter((x) => x.id !== r.id)).then(refresh) } }, '✕'))),
        h('div', { style: 'margin-top:8px' }, kw, qrSel,
          h('button', { class: 'btn', on: { click: async () => {
            const k = kw.value.trim();
            if (!k || !qrSel.value) return toast(root, 'Informe a palavra-chave e a resposta.');
            await saveRules([...rules, { id: uid(), keyword: k, quickReplyId: qrSel.value, enabled: true }]);
            refresh();
          } } }, 'Adicionar regra'))),
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
        h('p', { class: 'muted' }, 'Alt+K abre o Kanban · Alt+P abre este painel · digite / no chat para respostas rápidas.')),
    ];
  }

  const api: Panel = {
    toggle() { panel.classList.toggle('hidden'); refresh(); },
    refresh,
  };
  return api;
}
