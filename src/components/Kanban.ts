import type { Contact, Stage } from '../types';
import { saveStages } from '../storage/chromeStore';
import { blankContact, deleteContact, getOrCreateContact, putContact } from '../storage/db';
import { emitDataChange } from '../storage/bus';
import { openChatByName, visibleChatNames } from '../content/chatList';
import { readMessages, waitForChat } from '../content/messages';
import { state } from '../content/state';
import { clearComposer, replaceTokenWithText, sendComposer } from '../utils/domHelpers';
import { applyVars, avatarColor, initials, money, normalizeName, tagHue, todayStr } from '../utils/format';
import { h, toast, uid } from './h';
import { icon } from './icons';

export interface Kanban {
  toggle(): void;
  close(): void;
  refresh(): void;
  refreshChat(): void;
}

const lateTasks = (c: Contact) => c.tasks.filter((t) => !t.done && t.due && t.due < todayStr()).length;
const openTasks = (c: Contact) => c.tasks.filter((t) => !t.done).length;

const iconBtn = (name: Parameters<typeof icon>[0], title: string, onClick: (e: Event) => void, cls = 'x') =>
  h('button', { class: cls, title, 'aria-label': title, on: { click: onClick } }, icon(name));

export function mountKanban(root: ShadowRoot): Kanban {
  const overlay = h('div', { class: 'kb hidden', role: 'dialog', 'aria-label': 'Funil de vendas' });
  root.append(overlay);
  let query = '';
  let tagFilter = '';
  let editing: string | null = null;
  let split = false;
  let ratio = 0.55; // fração da tela para o WhatsApp no modo dividido
  let savedStyle: string | null | undefined;
  let chatFor: string | null = null; // contato com o chat aberto dentro do card
  let chatError: string | null = null;
  const drafts = new Map<string, string>(); // rascunhos por contato

  const isOpen = () => !overlay.classList.contains('hidden');
  const sameChat = (c: Contact) => !!state.chat && normalizeName(state.chat.name) === normalizeName(c.name);

  function visible(list: Contact[]): Contact[] {
    const q = normalizeName(query);
    return list.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return normalizeName([c.name, c.phone, ...c.tags, ...c.notes.map((n) => n.text)].join(' ')).includes(q);
    });
  }

  async function moveTo(key: string, stageId: string | null) {
    const c = state.contacts.find((x) => x.phone === key);
    if (!c || c.stageId === stageId) return;
    c.stageId = stageId;
    await putContact(c);
  }

  async function reorder(stage: Stage, dir: -1 | 1) {
    const list = state.stages.slice().sort((a, b) => a.order - b.order);
    const i = list.findIndex((s) => s.id === stage.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    await saveStages(list.map((s, idx) => ({ ...s, order: idx })));
  }

  async function removeStage(stage: Stage) {
    if (!confirm(`Excluir a etapa "${stage.name}"? Os leads dela ficam sem etapa.`)) return;
    for (const c of state.contacts.filter((x) => x.stageId === stage.id)) { c.stageId = null; await putContact(c, true); }
    editing = null;
    await saveStages(state.stages.filter((s) => s.id !== stage.id));
  }

  /**
   * Modo dividido: o WhatsApp inteiro é encolhido para a direita (position/width/transform no #app, revertido ao sair)
   * e o Kanban ocupa a esquerda. O transform faz o #app virar o referencial dos elementos absolute/fixed internos.
   */
  function setSplit(on: boolean): boolean {
    const app = document.getElementById('app');
    if (!app) return false;
    if (on) {
      if (savedStyle === undefined) savedStyle = app.getAttribute('style');
      const w = Math.min(Math.max(640, Math.round(innerWidth * ratio)), innerWidth - 320);
      Object.assign(app.style, { position: 'fixed', top: '0', right: '0', bottom: '0', left: 'auto', width: w + 'px', height: '100%', transform: 'translateZ(0)' });
      overlay.style.right = w + 'px';
    } else {
      if (savedStyle !== undefined) {
        if (savedStyle === null) app.removeAttribute('style');
        else app.setAttribute('style', savedStyle);
        savedStyle = undefined;
      }
      overlay.style.right = '0';
    }
    split = on;
    window.dispatchEvent(new Event('resize')); // o WhatsApp recalcula o layout
    return true;
  }

  async function open(c: Contact) {
    if (!split && !setSplit(true)) overlay.classList.add('hidden');
    if (!(await openChatByName(c.name))) {
      overlay.classList.remove('hidden');
      toast(root, 'Não encontrei a conversa "' + c.name + '" na lista. Role a lista ou pesquise manualmente.');
    }
    render();
  }

  /* ---------- chat dentro do card ---------- */

  function fillMsgs(box: HTMLElement, c: Contact) {
    const msgs = sameChat(c) ? readMessages(c.name) : [];
    const sig = JSON.stringify([msgs, chatError, sameChat(c)]);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    if (msgs.length) {
      box.replaceChildren(...msgs.map((m) => h('div', { class: 'bubble ' + (m.out ? 'out' : 'in') }, m.quote ? h('div', { class: 'quote' }, m.quote) : null, m.text, h('span', { class: 'time' }, m.time))));
    } else if (chatError) {
      box.replaceChildren(h('div', { class: 'state err' }, icon('warning'), chatError));
    } else if (sameChat(c)) {
      box.replaceChildren(h('div', { class: 'state' }, 'Nenhuma mensagem de texto visível. Fotos e áudios não aparecem aqui.'));
    } else {
      box.replaceChildren(h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })); // carregando
    }
    box.scrollTop = box.scrollHeight;
  }

  /** Atualiza só as mensagens do card aberto (a cada varredura do observer; não recria o quadro). */
  function refreshChat() {
    const c = chatFor && state.contacts.find((x) => x.phone === chatFor);
    const box = overlay.querySelector<HTMLElement>('.cardchat .msgs');
    if (c && box) fillMsgs(box, c);
  }

  async function toggleChat(c: Contact) {
    if (chatFor === c.phone) { chatFor = null; chatError = null; render(); return; }
    chatFor = c.phone;
    chatError = null;
    render();
    if (!sameChat(c)) {
      const ok = (await openChatByName(c.name)) && (await waitForChat(c.name));
      if (!ok) chatError = 'Não consegui abrir esta conversa. Ela precisa aparecer na lista do WhatsApp (role a lista ou pesquise).';
    }
    refreshChat();
  }

  async function sendFromCard(c: Contact, ta: HTMLTextAreaElement) {
    const text = ta.value.trim();
    if (!text) return;
    if (!sameChat(c)) return toast(root, 'A conversa não está aberta no WhatsApp. Feche e abra o chat do card de novo.');
    ta.value = '';
    drafts.delete(c.phone);
    await clearComposer();
    await replaceTokenWithText(0, text);
    await sendComposer(false);
    window.setTimeout(refreshChat, 700);
  }

  function chatBox(c: Contact): HTMLElement {
    const msgs = h('div', { class: 'msgs' });
    const ta = h('textarea', { rows: 2, 'aria-label': 'Mensagem para ' + c.name, placeholder: 'Escreva uma mensagem. Enter envia, Shift+Enter quebra a linha.' });
    ta.value = drafts.get(c.phone) ?? '';
    ta.addEventListener('input', () => drafts.set(c.phone, ta.value));
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation(); // não deixa o Kanban/WhatsApp tratar as teclas
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendFromCard(c, ta); }
    });
    const chips = h('div', { class: 'qchips' }, ...state.quickReplies.slice(0, 6).map((r) =>
      h('button', { class: 'pill', title: r.text, on: { click: () => {
        const text = applyVars(r.text, { key: c.phone, number: null, name: c.name, isGroup: false, byName: false });
        ta.value = ta.value ? ta.value + ' ' + text : text;
        drafts.set(c.phone, ta.value);
        ta.focus();
      } } }, '/' + r.shortcut)));
    const box = h('div', { class: 'cardchat', on: { click: (e) => e.stopPropagation() } }, msgs, chips, ta,
      h('div', { class: 'inline' },
        h('button', { class: 'btn', on: { click: () => void sendFromCard(c, ta) } }, icon('send'), 'Enviar'),
        h('button', { class: 'btn ghost', title: 'Abre o WhatsApp completo ao lado', on: { click: () => void open(c) } }, icon('open-out'), 'WhatsApp')));
    queueMicrotask(() => fillMsgs(msgs, c));
    return box;
  }

  /* ---------- quadro ---------- */

  function card(c: Contact): HTMLElement {
    const late = lateTasks(c);
    const expanded = chatFor === c.phone;
    const el = h('div', { class: 'card' + (expanded ? ' open' : '') + (split && sameChat(c) ? ' sel' : ''), draggable: !expanded,
      on: {
        dragstart: (e) => { (e as DragEvent).dataTransfer?.setData('text/plain', c.phone); el.classList.add('drag'); },
        dragend: () => el.classList.remove('drag'),
        click: () => void toggleChat(c),
      } },
      h('div', { class: 'card-top' },
        h('div', { class: 'avatar', style: `background:${avatarColor(c.name)}` }, initials(c.name)),
        h('b', {}, c.name || c.phone),
        iconBtn('chat', expanded ? 'Fechar conversa' : 'Conversar', (e) => { e.stopPropagation(); void toggleChat(c); }),
        iconBtn('trash', 'Excluir lead', (e) => { e.stopPropagation(); if (confirm(`Excluir "${c.name}" do CRM?`)) void deleteContact(c.phone); }, 'x danger')),
      expanded ? chatBox(c) : null,
      c.tags.length ? h('div', { class: 'chips' }, ...c.tags.map((t) => h('span', { class: 'chip', style: `--h:${tagHue(t)}` }, t))) : null,
      c.notes[0] ? h('div', { class: 'snippet' }, c.notes[0].text) : null,
      h('div', { class: 'meta' },
        c.value ? h('span', {}, icon('coins', 14), money(c.value)) : null,
        openTasks(c) ? h('span', { class: late ? 'late' : '' }, icon(late ? 'warning' : 'check', 14), late ? `${late} atrasada${late > 1 ? 's' : ''}` : `${openTasks(c)} tarefa${openTasks(c) > 1 ? 's' : ''}`) : null,
        h('span', {}, icon('calendar', 14), new Date(c.updatedAt).toLocaleDateString('pt-BR'))));
    return el;
  }

  function column(stage: Stage | null, list: Contact[]): HTMLElement {
    const mine = list.filter((c) => (c.stageId ?? null) === (stage?.id ?? null));
    const sum = mine.reduce((a, c) => a + c.value, 0);
    const col = h('div', { class: 'col',
      on: {
        dragover: (e) => { e.preventDefault(); col.classList.add('over'); },
        dragleave: () => col.classList.remove('over'),
        drop: (e) => { e.preventDefault(); col.classList.remove('over'); const key = (e as DragEvent).dataTransfer?.getData('text/plain'); if (key) void moveTo(key, stage?.id ?? null); },
      } });

    col.append(h('div', { class: 'col-head' },
      h('div', { class: 'grow' },
        h('div', { class: 'name' }, h('span', { class: 'dot', style: `background:${stage?.color ?? 'var(--muted)'}` }), stage?.name ?? 'Sem etapa', h('span', { class: 'count' }, mine.length)),
        sum ? h('span', { class: 'sum' }, money(sum)) : null),
      stage ? iconBtn('caret-left', 'Mover etapa para a esquerda', () => void reorder(stage, -1)) : null,
      stage ? iconBtn('caret-right', 'Mover etapa para a direita', () => void reorder(stage, 1)) : null,
      stage ? iconBtn('gear', 'Editar etapa', () => { editing = editing === stage.id ? null : stage.id; render(); }) : null));

    if (stage && editing === stage.id) {
      const name = h('input', { id: 'stage-name-' + stage.id, value: stage.name });
      const color = h('input', { id: 'stage-color-' + stage.id, type: 'color', value: stage.color });
      const save = () => void saveStages(state.stages.map((s) => (s.id === stage.id ? { ...s, name: name.value.trim() || s.name, color: color.value } : s)));
      name.addEventListener('change', save);
      color.addEventListener('change', save);
      col.append(h('div', { class: 'col-edit' },
        h('label', { class: 'field', for: name.id }, 'Nome da etapa'), name,
        h('label', { class: 'field', for: color.id }, 'Cor'), color,
        h('button', { class: 'btn ghost sm', on: { click: () => void removeStage(stage) } }, icon('trash', 14), 'Excluir etapa')));
    }

    const body = h('div', { class: 'col-body' }, ...mine.sort((a, b) => b.updatedAt - a.updatedAt).map(card));
    if (!mine.length) {
      body.append(h('div', { class: 'empty' }, icon('arrows-in'), stage ? 'Nenhum lead nesta etapa.' : 'Nenhum lead sem etapa.', stage ? 'Arraste um card para cá.' : null));
    }
    col.append(body);
    return col;
  }

  function exportCsv() {
    const stages = new Map(state.stages.map((s) => [s.id, s.name]));
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Nome', 'Chave/Telefone', 'Etapa', 'Tags', 'Valor', 'Tarefas abertas', 'Última nota'].map(esc).join(';')];
    for (const c of state.contacts) rows.push([c.name, c.phone, stages.get(c.stageId ?? '') ?? '', c.tags.join(', '), c.value, openTasks(c), c.notes[0]?.text ?? ''].map(esc).join(';'));
    const url = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    h('a', { href: url, download: 'leads.csv' }).click();
    URL.revokeObjectURL(url);
  }

  async function importVisible() {
    const known = new Set(state.contacts.map((c) => normalizeName(c.name)));
    let n = 0;
    for (const name of visibleChatNames()) {
      if (known.has(normalizeName(name))) continue;
      await putContact(blankContact('name_' + normalizeName(name), name), true);
      n++;
    }
    emitDataChange();
    toast(root, n ? `${n} conversa(s) importada(s) como lead.` : 'Nenhuma conversa nova visível na lista.');
  }

  function render() {
    if (!isOpen()) return;
    const list = visible(state.contacts);
    const allTags = [...new Set(state.contacts.flatMap((c) => c.tags))].sort();
    const total = state.contacts.reduce((a, c) => a + c.value, 0);
    const late = state.contacts.reduce((a, c) => a + lateTasks(c), 0);
    const stages = state.stages.slice().sort((a, b) => a.order - b.order);

    const search = h('input', { type: 'search', 'aria-label': 'Buscar lead, tag ou nota', placeholder: 'Buscar lead, tag ou nota', value: query,
      on: { input: (e) => { query = (e.target as HTMLInputElement).value; renderBoardOnly(); } } });
    const tagSel = h('select', { 'aria-label': 'Filtrar por tag', on: { change: (e) => { tagFilter = (e.target as HTMLSelectElement).value; render(); } } },
      h('option', { value: '' }, 'Todas as tags'), ...allTags.map((t) => h('option', { value: t, selected: t === tagFilter }, t)));

    const addStage = h('button', { class: 'btn ghost', style: 'flex:none', on: { click: () => {
      const name = prompt('Nome da nova etapa:')?.trim();
      if (name) void saveStages([...state.stages, { id: uid(), name, color: '#8b5cf6', order: state.stages.length }]);
    } } }, icon('plus'), 'Etapa');

    const board = h('div', { class: 'kb-board' }, column(null, list), ...stages.map((s) => column(s, list)), addStage);

    function renderBoardOnly() {
      const prev = overlay.querySelector('.kb-board');
      if (!prev) return;
      const scroll = prev.scrollLeft;
      const l2 = visible(state.contacts);
      const next = h('div', { class: 'kb-board' }, column(null, l2), ...stages.map((s) => column(s, l2)), addStage);
      prev.replaceWith(next);
      next.scrollLeft = scroll;
    }

    overlay.replaceChildren(
      h('div', { class: 'kb-top' },
        h('h2', {}, 'Funil de vendas'),
        h('div', { class: 'kb-metrics' },
          h('div', { class: 'metric' }, h('span', {}, 'Leads'), h('b', {}, state.contacts.length)),
          h('div', { class: 'metric' }, h('span', {}, 'Valor em aberto'), h('b', {}, money(total))),
          h('div', { class: 'metric' + (late ? ' alert' : '') }, h('span', {}, 'Tarefas atrasadas'), h('b', {}, late))),
        h('span', { class: 'kb-spacer' }),
        h('div', { class: 'search' }, icon('search'), search),
        tagSel,
        h('button', { class: 'btn ghost', title: 'Adiciona o chat aberto ao funil', on: { click: async () => { if (state.chat) { await getOrCreateContact(state.chat); toast(root, 'Chat adicionado ao funil.'); } else toast(root, 'Abra uma conversa primeiro.'); } } }, icon('plus'), 'Chat atual'),
        h('button', { class: 'btn ghost', title: 'Cria leads com as conversas visíveis na lista', on: { click: () => void importVisible() } }, icon('users'), 'Importar'),
        h('button', { class: 'btn ghost', on: { click: exportCsv } }, icon('download'), 'CSV'),
        split ? h('button', { class: 'btn ghost', title: 'Alterna a largura do chat', on: { click: () => { ratio = ratio >= 0.7 ? 0.45 : ratio + 0.125; setSplit(true); render(); } } }, icon('arrows-lr'), 'Largura') : null,
        split ? h('button', { class: 'btn ghost', on: { click: () => { setSplit(false); render(); } } }, icon('fullscreen'), 'Tela cheia') : null,
        h('button', { class: 'btn', title: 'Esc', on: { click: () => api.close() } }, icon('x'), 'Fechar')),
      board);
    if (!root.activeElement) search.focus(); // não rouba o foco de outro campo (ex.: edição de etapa)
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !(e.target instanceof HTMLInputElement)) api.close();
  }, true);

  window.addEventListener('resize', (e) => { if (split && e.isTrusted) setSplit(true); });

  const api: Kanban = {
    toggle() {
      if (isOpen()) return api.close();
      overlay.classList.remove('hidden');
      render();
    },
    close() {
      setSplit(false);
      chatFor = null;
      overlay.classList.add('hidden');
    },
    refresh: render,
    refreshChat,
  };
  return api;
}
