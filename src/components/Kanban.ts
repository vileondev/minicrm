import type { Contact, Stage, Task } from '../types';
import { saveStages, saveViewPrefs } from '../storage/chromeStore';
import { blankContact, deleteContact, getOrCreateContact, putContact } from '../storage/db';
import { emitDataChange } from '../storage/bus';
import { openChat, visibleChatNames } from '../content/chatList';
import { analyzeChat } from '../content/ai';
import { funnelStats, inFunnel, isGroupContact, stageProbability, weightedValue } from '../content/metrics';
import { readMessages, waitForChat } from '../content/messages';
import { state } from '../content/state';
import { clearComposer, replaceTokenWithText, sendComposer } from '../utils/domHelpers';
import { addDays, applyVars, avatarColor, initials, money, normalizeName, tagHue, todayStr } from '../utils/format';
import { h, toast, uid } from './h';
import { icon } from './icons';

export interface Kanban {
  toggle(): void;
  close(): void;
  refresh(): void;
  refreshChat(): void;
}

const HEAT_LABEL = { quente: 'Quente', morno: 'Morno', frio: 'Frio' } as const;
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
  let sortBy: 'recent' | 'score' | 'value' = 'recent';
  let mode: 'board' | 'tasks' | 'report' = 'board';
  let split = false;
  let ratio = 0.55; // fração da tela para o WhatsApp no modo dividido
  let savedStyle: string | null | undefined;
  let chatFor: string | null = null; // contato com o chat aberto dentro do card
  let chatError: string | null = null;
  const drafts = new Map<string, string>(); // rascunhos por contato

  const isOpen = () => !overlay.classList.contains('hidden');
  const sameChat = (c: Contact) => !!state.chat && (state.chat.key === c.phone || normalizeName(state.chat.name) === normalizeName(c.name));

  function visible(list: Contact[]): Contact[] {
    const q = normalizeName(query);
    return list.filter((c) => {
      if (!inFunnel(c)) return false;
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
    if (!(await openChat(c.name, c.number ?? c.phone))) {
      overlay.classList.remove('hidden');
      toast(root, 'Não encontrei a conversa "' + c.name + '" na lista. Role a lista ou pesquise manualmente.');
    }
    render();
  }

  /* ---------- chat dentro do card ---------- */

  function fillMsgs(box: HTMLElement, c: Contact) {
    const msgs = sameChat(c) && state.chat ? readMessages(state.chat.name) : [];
    const group = !!state.chat?.isGroup;
    const sig = JSON.stringify([msgs, chatError, sameChat(c)]);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    if (msgs.length) {
      box.replaceChildren(...msgs.map((m) => h('div', { class: 'bubble ' + (m.out ? 'out' : 'in') + (m.media && m.text === `[${m.media}]` ? ' media' : '') }, group && !m.out && m.author ? h('div', { class: 'author' }, m.author) : null, m.quote ? h('div', { class: 'quote' }, m.quote) : null, m.text, h('span', { class: 'time' }, m.time))));
    } else if (chatError) {
      box.replaceChildren(h('div', { class: 'state err' }, icon('warning'), h('span', {}, chatError,
        h('button', { class: 'btn ghost sm', style: 'margin-top:8px', on: { click: () => void retryChat(c) } }, 'Tentar de novo'))));
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

  async function loadChat(c: Contact) {
    chatError = null;
    if (!sameChat(c)) {
      const ok = (await openChat(c.name, c.number ?? c.phone)) && (await waitForChat(c.name, c.phone));
      if (!ok) chatError = `Não encontrei "${c.name}" na lista nem na pesquisa do WhatsApp. Confira se o nome do lead é igual ao da conversa.`;
    }
    refreshChat();
  }

  async function retryChat(c: Contact) {
    chatError = null;
    const box = overlay.querySelector<HTMLElement>('.cardchat .msgs');
    if (box) { box.dataset.sig = ''; box.replaceChildren(h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })); }
    await loadChat(c);
  }

  async function toggleChat(c: Contact) {
    if (chatFor === c.phone) { chatFor = null; chatError = null; render(); return; }
    chatFor = c.phone;
    chatError = null;
    render();
    await loadChat(c);
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

  async function analyzeFromCard(c: Contact, ta: HTMLTextAreaElement) {
    if (!state.chat || !sameChat(c)) return toast(root, 'Abra o chat deste card antes de analisar.');
    toast(root, 'Analisando a conversa…');
    try {
      const r = await analyzeChat(state.chat);
      if (r.analysis.draft && !ta.value.trim()) { ta.value = r.analysis.draft; drafts.set(c.phone, ta.value); }
      toast(root, `Lead ${r.analysis.heat} (${r.analysis.score}). CRM atualizado.`);
    } catch (err) {
      toast(root, err instanceof Error ? err.message : String(err));
    }
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
      h('div', { class: 'inline wrap' },
        h('button', { class: 'btn', on: { click: () => void sendFromCard(c, ta) } }, icon('send'), 'Enviar'),
        h('button', { class: 'btn ghost', title: 'A IA atualiza o CRM e sugere um rascunho de resposta (você envia)', on: { click: () => void analyzeFromCard(c, ta) } }, icon('sparkle'), 'Analisar'),
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
        iconBtn(c.internal ? 'eye' : 'eye-off', c.internal ? 'Voltar para o funil' : 'Marcar como interno (sai do funil e dos fluxos)', (e) => { e.stopPropagation(); void setInternal(c, !c.internal); }),
        iconBtn('trash', 'Excluir lead', (e) => { e.stopPropagation(); if (confirm(`Excluir "${c.name}" do CRM?`)) void deleteContact(c.phone); }, 'x danger')),
      expanded ? chatBox(c) : null,
      c.heat || c.tags.length || c.internal || isGroupContact(c) ? h('div', { class: 'chips' },
        isGroupContact(c) ? h('span', { class: 'heat frio' }, 'Grupo') : null,
        c.internal ? h('span', { class: 'heat frio' }, 'Interno') : null,
        c.heat ? h('span', { class: 'heat ' + c.heat }, `${HEAT_LABEL[c.heat]}${c.score !== undefined ? ' ' + c.score : ''}`) : null,
        ...c.tags.map((t) => h('span', { class: 'chip', style: `--h:${tagHue(t)}` }, t))) : null,
      c.notes[0] ? h('div', { class: 'snippet' }, c.notes[0].text) : null,
      h('div', { class: 'meta' },
        c.value ? h('span', {}, icon('coins', 14), money(c.value)) : null,
        openTasks(c) ? h('span', { class: late ? 'late' : '' }, icon(late ? 'warning' : 'check', 14), late ? `${late} atrasada${late > 1 ? 's' : ''}` : `${openTasks(c)} tarefa${openTasks(c) > 1 ? 's' : ''}`) : null,
        h('span', {}, icon('calendar', 14), new Date(c.updatedAt).toLocaleDateString('pt-BR'))));
    return el;
  }

  async function setInternal(c: Contact, on: boolean) {
    c.internal = on || undefined;
    await putContact(c);
    toast(root, on ? `"${c.name}" marcado como interno. Use "Internos" no topo para vê-lo.` : `"${c.name}" voltou para o funil.`);
  }

  function column(stage: Stage | null, list: Contact[]): HTMLElement {
    const mine = list.filter((c) => (c.stageId ?? null) === (stage?.id ?? null));
    const sum = mine.reduce((a, c) => a + c.value, 0);
    const weighted = mine.reduce((a, c) => a + weightedValue(c), 0);
    const col = h('div', { class: 'col',
      on: {
        dragover: (e) => { e.preventDefault(); col.classList.add('over'); },
        dragleave: () => col.classList.remove('over'),
        drop: (e) => { e.preventDefault(); col.classList.remove('over'); const key = (e as DragEvent).dataTransfer?.getData('text/plain'); if (key) void moveTo(key, stage?.id ?? null); },
      } });

    col.append(h('div', { class: 'col-head' },
      h('div', { class: 'grow' },
        h('div', { class: 'name' }, h('span', { class: 'dot', style: `background:${stage?.color ?? 'var(--muted)'}` }), stage?.name ?? 'Sem etapa', h('span', { class: 'count' }, mine.length)),
        stage || sum ? h('span', { class: 'sum', title: 'Valor total · valor ponderado pela chance de fechar' },
          sum ? `${money(sum)} · ${money(weighted)} pond.` : '', stage ? `${sum ? ' · ' : ''}${stageProbability(stage)}%` : '') : null),
      stage ? iconBtn('caret-left', 'Mover etapa para a esquerda', () => void reorder(stage, -1)) : null,
      stage ? iconBtn('caret-right', 'Mover etapa para a direita', () => void reorder(stage, 1)) : null,
      stage ? iconBtn('gear', 'Editar etapa', () => { editing = editing === stage.id ? null : stage.id; render(); }) : null));

    if (stage && editing === stage.id) {
      const name = h('input', { id: 'stage-name-' + stage.id, value: stage.name });
      const color = h('input', { id: 'stage-color-' + stage.id, type: 'color', value: stage.color });
      const prob = h('input', { id: 'stage-prob-' + stage.id, type: 'number', min: '0', max: '100', step: '5', value: String(stageProbability(stage)) });
      const save = () => void saveStages(state.stages.map((s) => (s.id === stage.id ? { ...s, name: name.value.trim() || s.name, color: color.value,
        probability: Math.max(0, Math.min(100, Math.round(Number(prob.value)))) || 0 } : s)));
      name.addEventListener('change', save);
      color.addEventListener('change', save);
      prob.addEventListener('change', save);
      col.append(h('div', { class: 'col-edit' },
        h('label', { class: 'field', for: name.id }, 'Nome da etapa'), name,
        h('label', { class: 'field', for: color.id }, 'Cor'), color,
        h('label', { class: 'field', for: prob.id }, 'Chance de fechar (%)'), prob,
        h('button', { class: 'btn ghost sm', on: { click: () => void removeStage(stage) } }, icon('trash', 14), 'Excluir etapa')));
    }

    const body = h('div', { class: 'col-body' }, ...mine.sort((a, b) => (sortBy === 'score' ? (b.score ?? -1) - (a.score ?? -1) : sortBy === 'value' ? b.value - a.value : 0) || b.updatedAt - a.updatedAt).map(card));
    if (!mine.length) {
      body.append(h('div', { class: 'empty' }, icon('arrows-in'), stage ? 'Nenhum lead nesta etapa.' : 'Nenhum lead sem etapa.', stage ? 'Arraste um card para cá.' : null));
    }
    col.append(body);
    return col;
  }

  function exportCsv() {
    const stages = new Map(state.stages.map((s) => [s.id, s.name]));
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Nome', 'Chave', 'Telefone', 'Etapa', 'Tags', 'Valor', 'Valor ponderado', 'Tarefas abertas', 'Interno', 'Última nota'].map(esc).join(';')];
    for (const c of state.contacts) rows.push([c.name, c.phone, c.number ?? '', stages.get(c.stageId ?? '') ?? '', c.tags.join(', '), c.value, Math.round(weightedValue(c)),
      openTasks(c), c.internal ? 'sim' : '', c.notes[0]?.text ?? ''].map(esc).join(';'));
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

  /* ---------- tarefas de todos os leads ---------- */

  async function updateTask(c: Contact, t: Task, patch: Partial<Task>) {
    Object.assign(t, patch);
    await putContact(c);
  }

  function tasksView(): HTMLElement {
    const today = todayStr();
    const week = addDays(7);
    const q = normalizeName(query);
    const items = state.contacts
      .filter((c) => state.view.showInternal || !c.internal)
      .flatMap((c) => c.tasks.filter((t) => !t.done).map((t) => ({ c, t })))
      .filter(({ c, t }) => !q || normalizeName(`${c.name} ${t.text}`).includes(q))
      .sort((a, b) => (a.t.due ?? '9999').localeCompare(b.t.due ?? '9999') || a.t.createdAt - b.t.createdAt);

    const groups: [string, (t: Task) => boolean][] = [
      ['Atrasadas', (t) => !!t.due && t.due < today],
      ['Hoje', (t) => t.due === today],
      ['Próximos 7 dias', (t) => !!t.due && t.due > today && t.due <= week],
      ['Depois', (t) => !!t.due && t.due > week],
      ['Sem prazo', (t) => !t.due],
    ];

    const row = ({ c, t }: { c: Contact; t: Task }) => {
      const late = !!t.due && t.due < today;
      return h('div', { class: 'trow' + (late ? ' late' : '') },
        h('input', { type: 'checkbox', 'aria-label': 'Concluir tarefa', on: { change: () => void updateTask(c, t, { done: true }) } }),
        h('div', { class: 'avatar', style: `background:${avatarColor(c.name)}` }, initials(c.name)),
        h('div', { class: 'grow' }, h('b', {}, t.text), h('span', { class: 'muted' }, c.name)),
        t.due ? h('span', { class: 'due' }, new Date(t.due + 'T00:00').toLocaleDateString('pt-BR')) : null,
        h('button', { class: 'btn ghost sm', title: 'Muda o prazo para amanhã', on: { click: () => void updateTask(c, t, { due: addDays(1) }) } }, 'Amanhã'),
        h('button', { class: 'btn ghost sm', title: 'Abre a conversa ao lado', on: { click: () => void open(c) } }, icon('chat', 14), 'Conversa'));
    };

    const sections = groups.map(([label, test]) => {
      const mine = items.filter(({ t }) => test(t));
      return mine.length ? h('section', { class: 'tgroup' }, h('h3', {}, label, h('span', { class: 'count' }, mine.length)), ...mine.map(row)) : null;
    });
    return h('div', { class: 'kb-page' }, ...(items.length ? sections : [h('div', { class: 'empty' }, icon('check'), 'Nenhuma tarefa aberta.')]));
  }

  /* ---------- relatório do funil ---------- */

  function reportView(): HTMLElement {
    const list = state.contacts.filter(inFunnel);
    const stats = funnelStats(list);
    const max = Math.max(1, ...stats.map((s) => s.entered));
    const days = (d: number | null) => (d === null ? '–' : d < 1 ? '< 1 dia' : `${d.toFixed(d < 10 ? 1 : 0).replace('.', ',')} dias`);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '–');
    const first = stats[0];
    const last = stats[stats.length - 1];

    return h('div', { class: 'kb-page' },
      h('table', { class: 'rep' },
        h('thead', {}, h('tr', {}, ...['Etapa', 'Passaram', 'Agora', 'Avançaram', 'Tempo médio', 'Valor', 'Ponderado'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...stats.map((s) => h('tr', {},
          h('td', {}, h('span', { class: 'dot', style: `background:${s.stage.color}` }), ' ', s.stage.name,
            h('div', { class: 'bar' }, h('span', { style: `width:${(s.entered / max) * 100}%;background:${s.stage.color}` }))),
          h('td', { class: 'num' }, s.entered),
          h('td', { class: 'num' }, s.current),
          h('td', { class: 'num', title: 'Dos que passaram por esta etapa, quantos chegaram a uma etapa seguinte' }, s === last ? '–' : `${s.advanced} (${pct(s.advanced, s.entered)})`),
          h('td', { class: 'num' }, days(s.avgDays)),
          h('td', { class: 'num' }, money(s.value)),
          h('td', { class: 'num' }, money(s.weighted)))))),
      h('p', { class: 'muted' },
        `Leads sem etapa: ${list.filter((c) => !c.stageId).length}. `,
        first && last && first !== last ? `De "${first.stage.name}" até "${last.stage.name}": ${pct(last.entered, first.entered)}. ` : '',
        'O histórico de etapas começou a ser gravado nesta versão: leads antigos contam a partir da etapa em que estavam.'));
  }

  /* ---------- topo e troca de visão ---------- */

  async function setView(patch: Partial<typeof state.view>) {
    await saveViewPrefs({ ...state.view, ...patch });
  }

  function render() {
    if (!isOpen()) return;
    const funnel = state.contacts.filter(inFunnel);
    const allTags = [...new Set(state.contacts.flatMap((c) => c.tags))].sort();
    const total = funnel.reduce((a, c) => a + c.value, 0);
    const weighted = funnel.reduce((a, c) => a + weightedValue(c), 0);
    const late = funnel.reduce((a, c) => a + lateTasks(c), 0);
    const stages = state.stages.slice().sort((a, b) => a.order - b.order);

    const search = h('input', { type: 'search', 'aria-label': 'Buscar', placeholder: mode === 'tasks' ? 'Buscar tarefa ou lead' : 'Buscar lead, tag ou nota', value: query,
      on: { input: (e) => { query = (e.target as HTMLInputElement).value; renderBodyOnly(); } } });
    const tagSel = h('select', { 'aria-label': 'Filtrar por tag', on: { change: (e) => { tagFilter = (e.target as HTMLSelectElement).value; render(); } } },
      h('option', { value: '' }, 'Todas as tags'), ...allTags.map((t) => h('option', { value: t, selected: t === tagFilter }, t)));

    const addStage = h('button', { class: 'btn ghost', style: 'flex:none', on: { click: () => {
      const name = prompt('Nome da nova etapa:')?.trim();
      if (name) void saveStages([...state.stages, { id: uid(), name, color: '#8b5cf6', order: state.stages.length }]);
    } } }, icon('plus'), 'Etapa');

    const body = (): HTMLElement => {
      if (mode === 'tasks') return tasksView();
      if (mode === 'report') return reportView();
      const list = visible(state.contacts);
      return h('div', { class: 'kb-board' }, column(null, list), ...stages.map((s) => column(s, list)), addStage);
    };

    function renderBodyOnly() {
      const prev = overlay.querySelector('.kb-board, .kb-page');
      if (!prev) return;
      const scroll = prev.scrollLeft;
      const next = body();
      prev.replaceWith(next);
      next.scrollLeft = scroll;
    }

    const modeBtn = (id: typeof mode, label: string, ic: Parameters<typeof icon>[0]) =>
      h('button', { class: 'pill' + (mode === id ? ' on' : ''), 'aria-pressed': String(mode === id), on: { click: () => { mode = id; render(); } } }, icon(ic, 14), label);
    const toggle = (on: boolean, label: string, title: string, fn: () => void) =>
      h('button', { class: 'pill' + (on ? ' on' : ''), 'aria-pressed': String(on), title, on: { click: fn } }, icon(on ? 'eye' : 'eye-off', 14), label);

    overlay.replaceChildren(
      h('div', { class: 'kb-top' },
        h('h2', {}, 'Funil de vendas'),
        h('div', { class: 'kb-metrics' },
          h('div', { class: 'metric' }, h('span', {}, 'Leads'), h('b', {}, funnel.length)),
          h('div', { class: 'metric' }, h('span', {}, 'Valor total'), h('b', {}, money(total))),
          h('div', { class: 'metric', title: 'Soma de valor × chance de fechar da etapa (sem etapa: nota da IA)' }, h('span', {}, 'Valor ponderado'), h('b', {}, money(weighted))),
          h('div', { class: 'metric' + (late ? ' alert' : '') }, h('span', {}, 'Tarefas atrasadas'), h('b', {}, late))),
        h('div', { class: 'seg' }, modeBtn('board', 'Quadro', 'kanban'), modeBtn('tasks', 'Tarefas', 'tasks'), modeBtn('report', 'Relatório', 'chart')),
        h('span', { class: 'kb-spacer' }),
        mode !== 'report' ? h('div', { class: 'search' }, icon('search'), search) : null,
        mode === 'board' ? tagSel : null,
        mode === 'board' ? h('select', { 'aria-label': 'Ordenar cards', on: { change: (e) => { sortBy = (e.target as HTMLSelectElement).value as typeof sortBy; render(); } } },
          h('option', { value: 'recent', selected: sortBy === 'recent' }, 'Mais recentes'),
          h('option', { value: 'score', selected: sortBy === 'score' }, 'Mais quentes'),
          h('option', { value: 'value', selected: sortBy === 'value' }, 'Maior valor')) : null,
        toggle(!state.view.hideGroups, 'Grupos', 'Mostrar conversas de grupo no funil', () => void setView({ hideGroups: !state.view.hideGroups })),
        toggle(state.view.showInternal, 'Internos', 'Mostrar contatos marcados como internos', () => void setView({ showInternal: !state.view.showInternal })),
        h('button', { class: 'btn ghost', title: 'Adiciona o chat aberto ao funil', on: { click: async () => { if (state.chat) { await getOrCreateContact(state.chat); toast(root, 'Chat adicionado ao funil.'); } else toast(root, 'Abra uma conversa primeiro.'); } } }, icon('plus'), 'Chat atual'),
        h('button', { class: 'btn ghost', title: 'Cria leads com as conversas visíveis na lista', on: { click: () => void importVisible() } }, icon('users'), 'Importar'),
        h('button', { class: 'btn ghost', on: { click: exportCsv } }, icon('download'), 'CSV'),
        split ? h('button', { class: 'btn ghost', title: 'Alterna a largura do chat', on: { click: () => { ratio = ratio >= 0.7 ? 0.45 : ratio + 0.125; setSplit(true); render(); } } }, icon('arrows-lr'), 'Largura') : null,
        split ? h('button', { class: 'btn ghost', on: { click: () => { setSplit(false); render(); } } }, icon('fullscreen'), 'Tela cheia') : null,
        h('button', { class: 'btn', title: 'Esc', on: { click: () => api.close() } }, icon('x'), 'Fechar')),
      body());
    if (!root.activeElement && mode !== 'report') search.focus(); // não rouba o foco de outro campo (ex.: edição de etapa)
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
