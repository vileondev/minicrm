import type { Contact, QuickReply } from '../types';
import { getOrCreateContact } from '../storage/db';
import { analyzeChat } from '../content/ai';
import { openChat, rowNames } from '../content/chatList';
import { findLead, isAwaiting, loadMoreConversations, readConversations, setStatus, type ConvRow } from '../content/conversations';
import { loadOlderMessages, readMessages, waitForChat, type Msg } from '../content/messages';
import { state } from '../content/state';
import { clearComposer, clearSearch, replaceTokenWithText, sendComposer, sendFiles, sleep, typeInSearch } from '../utils/domHelpers';
import { queryAll } from '../utils/domSelectors';
import { applyVars, avatarColor, fullDate, hashHue, initials, looseName, normalizeName, relTime, tagHue } from '../utils/format';
import { contactPanel, fieldVars, leadFor } from './ContactPanel';
import { icon } from './icons';
import { h, toast } from './h';

type Tab = 'all' | 'awaiting' | 'leads' | 'resolved';

export interface Inbox {
  el: HTMLElement;
  /** Dados do CRM mudaram (contatos, etapas, campos…). */
  refresh(): void;
  /** Varredura do observer: a lista ou a conversa do WhatsApp mudou. */
  tick(): void;
  /** Abre a conversa de um lead (vindo do funil ou das tarefas). */
  openLead(c: Contact): void;
}

const avatarEl = (name: string, src?: string, size = 40) =>
  src
    ? h('img', { class: 'av', src, alt: '', width: size, height: size, style: `width:${size}px;height:${size}px` })
    : h('div', { class: 'av', style: `width:${size}px;height:${size}px;background:${avatarColor(name)}` }, initials(name));

/** Destaca as ocorrências de `q` no texto sem usar innerHTML. */
function highlight(text: string, q: string): (Node | string)[] {
  if (!q) return [text];
  const norm = normalizeName(text);
  const nq = normalizeName(q);
  const out: (Node | string)[] = [];
  let i = 0;
  for (let at = norm.indexOf(nq); at >= 0 && nq; at = norm.indexOf(nq, i)) {
    out.push(text.slice(i, at), h('mark', {}, text.slice(at, at + nq.length)));
    i = at + nq.length;
  }
  out.push(text.slice(i));
  return out;
}

export function createInbox(root: ShadowRoot, opts: { isVisible(): boolean; showWhatsApp(): void }): Inbox {
  let tab: Tab = 'all';
  let query = '';
  let pending: string | null = null; // conversa pedida e ainda não aberta
  let openError: string | null = null;
  let searchOn = false;
  let chatQuery = '';
  let panelDirty = false;
  const drafts = new Map<string, string>();

  /* ---------- coluna 1: lista ---------- */
  const tabsEl = h('div', { class: 'ib-tabs', role: 'tablist' });
  const search = h('input', { type: 'search', placeholder: 'Buscar conversa', 'aria-label': 'Buscar conversa' });
  const listEl = h('div', { class: 'ib-list', role: 'listbox', 'aria-label': 'Conversas' });
  let searchTimer: number | undefined;
  search.addEventListener('input', () => {
    query = search.value;
    renderList();
    window.clearTimeout(searchTimer);
    // a pesquisa do WhatsApp traz conversas que ainda não apareceram na lista
    searchTimer = window.setTimeout(() => void (query.trim() ? typeInSearch(query.trim()) : clearSearch()), 450);
  });
  listEl.addEventListener('scroll', () => {
    if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 120) loadMoreConversations();
  });
  const listCol = h('section', { class: 'ib-col ib-convs', 'aria-label': 'Lista de conversas' },
    h('div', { class: 'ib-head' }, h('h3', {}, 'Conversas'), h('span', { class: 'kb-spacer' }),
      h('button', { class: 'x', title: 'Atualizar lista', 'aria-label': 'Atualizar lista', on: { click: () => { renderList(true); } } }, icon('refresh'))),
    tabsEl,
    h('div', { class: 'search ib-search' }, icon('search'), search),
    listEl);

  /* ---------- coluna 2: conversa ---------- */
  const chatHead = h('header', { class: 'ib-chat-head' });
  const banner = h('div', { class: 'ib-banner hidden' });
  const chatSearchIn = h('input', { type: 'search', placeholder: 'Buscar nesta conversa', 'aria-label': 'Buscar nesta conversa' });
  const chatSearchInfo = h('span', { class: 'muted num' });
  const chatSearch = h('div', { class: 'ib-chat-search hidden' }, icon('search'), chatSearchIn, chatSearchInfo,
    h('button', { class: 'x', title: 'Fechar busca', 'aria-label': 'Fechar busca', on: { click: () => toggleChatSearch(false) } }, icon('x', 12)));
  chatSearchIn.addEventListener('input', () => { chatQuery = chatSearchIn.value.trim(); renderMessages(true); });
  const msgsEl = h('div', { class: 'ib-msgs', role: 'log', 'aria-live': 'polite' });

  const ta = h('textarea', { rows: 2, placeholder: 'Escreva uma mensagem. Enter envia, Shift+Enter quebra a linha, / abre as respostas rápidas.', 'aria-label': 'Mensagem' });
  const qrPop = h('div', { class: 'ib-qr hidden', role: 'listbox', 'aria-label': 'Respostas rápidas' });
  let qrItems: QuickReply[] = [];
  let qrSel = 0;
  const sendBtn = h('button', { class: 'btn', on: { click: () => void send() } }, icon('send'), 'Enviar');

  /* fotos: escolhidas pelo botão, coladas (Ctrl+V) ou arrastadas para a conversa */
  const MAX_FILES = 10;
  const MAX_BYTES = 16 * 1024 * 1024; // limite do WhatsApp para fotos
  let files: { file: File; url: string }[] = [];
  let sending = false;
  const tray = h('div', { class: 'ib-attach hidden', 'aria-label': 'Fotos para enviar' });
  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden', 'aria-hidden': 'true', tabindex: '-1' });
  picker.addEventListener('change', () => { addFiles([...(picker.files ?? [])]); picker.value = ''; });
  /* modelos de mensagem: lista por categoria, com busca */
  const tplSearch = h('input', { type: 'search', placeholder: 'Buscar modelo', 'aria-label': 'Buscar modelo' });
  const tplList = h('div', { class: 'tpl-list' });
  const tplPop = h('div', { class: 'ib-tpl hidden', role: 'dialog', 'aria-label': 'Modelos de mensagem' }, tplSearch, tplList);
  const tplBtn = h('button', { class: 'x', title: 'Modelos de mensagem', 'aria-label': 'Modelos de mensagem', 'aria-expanded': 'false', on: { click: () => toggleTemplates() } }, icon('template'));
  tplSearch.addEventListener('input', () => renderTemplates());
  tplSearch.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleTemplates(false); });

  function toggleTemplates(on = tplPop.classList.contains('hidden')) {
    tplPop.classList.toggle('hidden', !on);
    tplBtn.setAttribute('aria-expanded', String(on));
    if (on) { closeQuickReplies(); tplSearch.value = ''; renderTemplates(); tplSearch.focus(); }
  }

  function renderTemplates() {
    const q = normalizeName(tplSearch.value);
    const list = state.templates.filter((t) => !q || normalizeName(`${t.title} ${t.category} ${t.text}`).includes(q));
    const cats = [...new Set(list.map((t) => t.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const chat = state.chat;
    const vars = fieldVars(chat ? leadFor(chat).existing : undefined);
    tplList.replaceChildren(...(list.length
      ? cats.map((cat) => h('div', { class: 'tpl-cat' }, h('h5', {}, cat), ...list.filter((t) => t.category === cat).map((t) =>
          h('button', { class: 'item', on: { click: () => {
            const text = applyVars(t.text, chat, vars);
            ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, '\n') + text : text;
            if (chat) drafts.set(chat.key, ta.value);
            toggleTemplates(false);
            ta.focus();
          } } }, h('b', {}, t.title), h('small', {}, applyVars(t.text, chat, vars))))))
      : [h('div', { class: 'hint' }, state.templates.length ? 'Nenhum modelo com esse termo.' : 'Nenhum modelo. Crie em Ajustes, Modelos de mensagem.')]));
  }

  const photoBtn = h('button', { class: 'x', title: 'Enviar foto (você também pode colar ou arrastar)', 'aria-label': 'Escolher foto para enviar', on: { click: () => picker.click() } }, icon('image'));
  const aiBtn = h('button', { class: 'x', title: 'Analisar com IA e sugerir resposta', 'aria-label': 'Analisar com IA', on: { click: () => void analyze() } }, icon('sparkle'));
  const composer = h('div', { class: 'ib-composer' }, qrPop, tplPop, tray, ta, picker,
    h('div', { class: 'ib-tools' },
      photoBtn,
      tplBtn,
      h('button', { class: 'x', title: 'Respostas rápidas', 'aria-label': 'Respostas rápidas', on: { click: () => openQuickReplies('') } }, icon('lightning')),
      aiBtn,
      h('button', { class: 'x', title: 'Áudio, documentos e figurinhas: use o WhatsApp original', 'aria-label': 'Abrir o WhatsApp original', on: { click: () => opts.showWhatsApp() } }, icon('whatsapp')),
      h('span', { class: 'kb-spacer' }),
      sendBtn));
  const chatCol = h('section', { class: 'ib-col ib-chat', 'aria-label': 'Conversa' }, chatHead, banner, chatSearch, msgsEl, composer);
  chatCol.addEventListener('dragover', (e) => {
    if (!state.chat || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    chatCol.classList.add('dropping');
  });
  chatCol.addEventListener('dragleave', (e) => { if (!chatCol.contains(e.relatedTarget as Node)) chatCol.classList.remove('dropping'); });
  chatCol.addEventListener('drop', (e) => {
    chatCol.classList.remove('dropping');
    if (!state.chat || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    addFiles([...e.dataTransfer.files]);
  });

  function addFiles(list: File[]) {
    const images = list.filter((f) => f.type.startsWith('image/'));
    if (images.length < list.length) toast(root, 'Por aqui só vão fotos. Áudio e documentos, pelo WhatsApp original.');
    const big = images.filter((f) => f.size > MAX_BYTES);
    if (big.length) toast(root, `${big.length} foto(s) acima de 16 MB ficaram de fora.`);
    const ok = images.filter((f) => f.size <= MAX_BYTES).slice(0, Math.max(0, MAX_FILES - files.length));
    if (images.length - big.length > ok.length) toast(root, `Envie até ${MAX_FILES} fotos por vez.`);
    files = [...files, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))];
    renderTray();
    ta.focus();
  }

  function clearFiles() {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    files = [];
    renderTray();
  }

  function renderTray() {
    tray.classList.toggle('hidden', files.length === 0);
    tray.replaceChildren(...files.map((f, i) => h('div', { class: 'thumb' },
      h('img', { src: f.url, alt: f.file.name }),
      h('button', { class: 'x', title: 'Tirar esta foto', 'aria-label': 'Tirar ' + f.file.name, on: { click: () => {
        URL.revokeObjectURL(f.url);
        files = files.filter((_, j) => j !== i);
        renderTray();
      } } }, icon('x', 12)))));
    ta.placeholder = files.length
      ? `Legenda (opcional). Enter envia ${files.length === 1 ? 'a foto' : `as ${files.length} fotos`}.`
      : 'Escreva uma mensagem. Enter envia, Shift+Enter quebra a linha, / abre as respostas rápidas.';
    sendBtn.replaceChildren(icon('send'), sending ? 'Enviando…' : files.length ? (files.length === 1 ? 'Enviar foto' : `Enviar ${files.length} fotos`) : 'Enviar');
    sendBtn.toggleAttribute('disabled', sending || !state.chat);
  }

  /* ---------- coluna 3: contato ---------- */
  const panelEl = h('div', { class: 'ib-panel' });
  const panelCol = h('aside', { class: 'ib-col ib-contact', 'aria-label': 'Dados do contato' },
    h('div', { class: 'ib-head' }, h('h3', {}, 'Dados do contato')), panelEl);
  panelEl.addEventListener('focusout', () => { window.setTimeout(() => { if (panelDirty && !panelEl.contains(root.activeElement)) renderPanel(); }, 0); });

  const el = h('div', { class: 'inbox' }, listCol, chatCol, panelCol);
  el.addEventListener('mousedown', (e) => {
    if (tplPop.classList.contains('hidden')) return;
    const path = e.composedPath();
    if (!path.includes(tplPop) && !path.includes(tplBtn)) toggleTemplates(false);
  });

  /* ---------- lista ---------- */

  function rowsForTab(rows: ConvRow[]): ConvRow[] {
    const q = looseName(query);
    let list = rows;
    if (tab === 'leads' || tab === 'resolved') {
      // leads que não estão carregados na lista do WhatsApp também aparecem
      const names = new Set(rows.map((r) => looseName(r.name)));
      const extra = state.contacts.filter((c) => !names.has(looseName(c.name)))
        .sort((a, b) => (b.lastMsgAt ?? b.updatedAt) - (a.lastMsgAt ?? a.updatedAt))
        .map((c, i): ConvRow => ({ name: c.name, preview: c.notes[0]?.text ?? '', time: '', unread: 0, order: 1e9 + i }));
      list = [...rows, ...extra];
    }
    return list.filter((r) => {
      const lead = findLead(r.name);
      if (tab === 'awaiting' && !(r.unread || isAwaiting(lead))) return false;
      if (tab === 'leads' && !lead) return false;
      if (tab === 'resolved' && lead?.status !== 'resolved') return false;
      return !q || looseName(r.name + ' ' + r.preview).includes(q);
    });
  }

  let listSig = '';
  function renderList(force = false) {
    const rows = readConversations();
    const counts = {
      all: rows.length,
      awaiting: rows.filter((r) => r.unread || isAwaiting(findLead(r.name))).length + state.contacts.filter((c) => isAwaiting(c) && !rows.some((r) => looseName(r.name) === looseName(c.name))).length,
      leads: state.contacts.length,
      resolved: state.contacts.filter((c) => c.status === 'resolved').length,
    };
    const tabDefs: [Tab, string][] = [['all', 'Todas'], ['awaiting', 'Aguardando'], ['leads', 'Leads'], ['resolved', 'Resolvidas']];
    tabsEl.replaceChildren(...tabDefs.map(([id, label]) => h('button', { class: 'ib-tab' + (tab === id ? ' on' : ''), role: 'tab', 'aria-selected': String(tab === id),
      on: { click: () => { tab = id; renderList(true); } } }, label, id === 'awaiting' && counts[id] ? h('span', { class: 'count' }, counts[id]) : null)));

    const list = rowsForTab(rows);
    const current = state.chat ? looseName(state.chat.name) : '';
    const sig = JSON.stringify([tab, query, current, pending, list, state.contacts.map((c) => [c.name, c.stageId, c.tags, c.status, c.awaitingSince])]);
    if (!force && sig === listSig) return;
    listSig = sig;
    const stages = new Map(state.stages.map((s) => [s.id, s]));

    if (!list.length) {
      const loggedOut = !document.getElementById('pane-side');
      listEl.replaceChildren(h('div', { class: 'empty' }, icon(loggedOut ? 'whatsapp' : 'tray'),
        loggedOut ? 'O WhatsApp ainda não carregou.' : query ? 'Nenhuma conversa encontrada.' : tab === 'awaiting' ? 'Ninguém esperando resposta.' : 'Nada por aqui.',
        loggedOut ? h('button', { class: 'btn sm', on: { click: () => opts.showWhatsApp() } }, 'Abrir o WhatsApp para entrar') : null));
      return;
    }
    const scroll = listEl.scrollTop;
    listEl.replaceChildren(...list.map((r) => {
      const lead = findLead(r.name);
      const stage = lead?.stageId ? stages.get(lead.stageId) : undefined;
      const selected = looseName(r.name) === current || pending === r.name;
      const waiting = r.unread > 0 || isAwaiting(lead);
      return h('button', { class: 'ib-row' + (selected ? ' on' : '') + (lead?.status === 'resolved' ? ' resolved' : ''), role: 'option', 'aria-selected': String(selected),
        on: { click: () => void select(r.name, lead) } },
        avatarEl(r.name, r.avatar),
        h('div', { class: 'ib-row-main' },
          h('div', { class: 'ib-row-top' }, h('b', {}, r.name), h('span', { class: 'ib-time' + (r.unread ? ' fresh' : '') }, r.time || (lead?.lastMsgAt ? relTime(lead.lastMsgAt) : ''))),
          h('div', { class: 'ib-row-mid' }, h('span', { class: 'ib-preview' }, r.preview || ' '),
            r.unread ? h('span', { class: 'ib-unread', 'aria-label': `${r.unread} não lidas` }, r.unread) : waiting ? h('span', { class: 'ib-wait', title: 'Aguardando resposta' }, icon('chat', 12)) : null),
          stage || lead?.tags.length ? h('div', { class: 'ib-row-tags' },
            stage ? h('span', { class: 'ib-stage' }, h('span', { class: 'dot', style: `background:${stage.color}` }), stage.name) : null,
            ...(lead?.tags.slice(0, 2) ?? []).map((t) => h('span', { class: 'chip', style: `--h:${tagHue(t)}` }, t)),
            (lead?.tags.length ?? 0) > 2 ? h('span', { class: 'muted' }, '+' + ((lead?.tags.length ?? 0) - 2)) : null) : null));
    }));
    listEl.scrollTop = scroll;
  }

  async function select(name: string, lead?: Contact) {
    if (state.chat && looseName(state.chat.name) === looseName(name)) return;
    pending = name;
    openError = null;
    renderList(true);
    renderChat(true);
    const found = await openChat(name, lead ? lead.number ?? lead.phone : undefined);
    const ok = found === 'opened' && (await waitForChat(name, lead?.phone));
    pending = null;
    if (!ok) openError = name;
    renderAll();
  }

  /* ---------- conversa ---------- */

  function toggleChatSearch(on: boolean) {
    searchOn = on;
    chatSearch.classList.toggle('hidden', !on);
    if (!on) { chatQuery = ''; chatSearchIn.value = ''; }
    renderMessages(true);
    if (on) chatSearchIn.focus();
  }

  function renderChat(force = false) {
    const chat = state.chat;
    if (pending || !chat) {
      chatHead.replaceChildren(pending ? h('div', { class: 'ib-chat-id' }, avatarEl(pending, undefined, 36), h('div', { class: 'grow' }, h('b', {}, pending), h('span', { class: 'muted' }, 'Abrindo conversa'))) : h('span'));
      banner.classList.add('hidden');
      composer.classList.toggle('disabled', true);
      ta.disabled = true;
      sendBtn.setAttribute('disabled', '');
      photoBtn.setAttribute('disabled', '');
      renderMessages(force);
      return;
    }
    const lead = leadFor(chat).existing;
    const resolved = lead?.status === 'resolved';
    const sub = chat.isGroup ? 'Grupo' : isAwaiting(lead) ? `Aguardando resposta ${relTime(lead!.awaitingSince!)}` : chat.number ? '+' + chat.number : lead ? 'Lead no CRM' : 'Ainda não é lead';
    const avatar = queryAll('chatListRows').find((r) => rowNames(r).some((n) => looseName(n) === looseName(chat.name)))
      ?.querySelector('img')?.getAttribute('src') ?? undefined;
    chatHead.replaceChildren(
      h('div', { class: 'ib-chat-id' }, avatarEl(chat.name, avatar?.startsWith('http') ? avatar : undefined, 36),
        h('div', { class: 'grow' }, h('b', {}, chat.name), h('span', { class: 'muted' + (isAwaiting(lead) ? ' warn-text' : '') }, sub))),
      h('div', { class: 'ib-actions' },
        h('button', { class: 'x' + (searchOn ? ' on' : ''), title: 'Buscar nesta conversa', 'aria-label': 'Buscar nesta conversa', 'aria-pressed': String(searchOn), on: { click: () => toggleChatSearch(!searchOn) } }, icon('search')),
        lead ? null : h('button', { class: 'btn ghost sm', title: 'Cria um lead com esta conversa', on: { click: async () => { await getOrCreateContact(chat); toast(root, `${chat.name} entrou no funil.`); } } }, icon('plus', 14), 'Adicionar ao funil'),
        h('button', { class: 'btn sm' + (resolved ? ' ghost' : ''), on: { click: async () => {
          const c = lead ?? (await getOrCreateContact(chat));
          await setStatus(c, resolved ? 'open' : 'resolved');
          toast(root, resolved ? 'Conversa reaberta.' : 'Conversa resolvida.');
        } } }, icon('check', 14), resolved ? 'Reabrir' : 'Resolver')));
    banner.textContent = resolved ? 'Conversa resolvida. Se o cliente escrever de novo, ela volta a ficar aberta.' : '';
    banner.classList.toggle('hidden', !resolved);
    composer.classList.toggle('disabled', false);
    ta.disabled = false;
    if (!sending) sendBtn.removeAttribute('disabled');
    photoBtn.removeAttribute('disabled');
    aiBtn.classList.toggle('hidden', !state.ai.enabled);
    const draft = drafts.get(chat.key) ?? '';
    if (ta.dataset.for !== chat.key) { ta.dataset.for = chat.key; ta.value = draft; clearFiles(); }
    renderMessages(force);
  }

  let msgSig = '';
  function bubble(m: Msg, group: boolean): HTMLElement {
    const mediaOnly = !!m.media && m.text === `[${m.media}]`;
    return h('div', { class: 'bubble ' + (m.out ? 'out' : 'in') + (mediaOnly ? ' media' : '') },
      group && !m.out && m.author ? h('div', { class: 'author', style: `--h:${hashHue(m.author)}` }, m.author) : null,
      m.quote ? h('div', { class: 'quote' }, m.quote) : null,
      m.img ? h('img', { class: 'photo', src: m.img, alt: 'Foto enviada na conversa' }) : null,
      m.img && mediaOnly ? null : h('span', {}, ...highlight(m.text, chatQuery)),
      m.link ? h('a', { class: 'maplink', href: m.link, target: '_blank', rel: 'noopener noreferrer' }, icon('map', 14), 'Abrir no mapa') : null,
      h('span', { class: 'time', title: m.at ? fullDate(m.at) : '' }, m.time));
  }

  function renderMessages(force = false) {
    const chat = state.chat;
    if (pending) {
      msgSig = 'pending';
      msgsEl.replaceChildren(...[62, 78, 54, 70].map((w, i) => h('div', { class: 'skel', style: `width:${w}%;${i % 2 ? 'align-self:flex-end' : ''}` })));
      return;
    }
    if (openError) {
      msgSig = 'error';
      msgsEl.replaceChildren(h('div', { class: 'empty err' }, icon('warning'), `Não consegui abrir "${openError}".`,
        'Ela pode estar arquivada ou com outro nome no WhatsApp.',
        h('div', { class: 'inline' },
          h('button', { class: 'btn sm', on: { click: () => { const n = openError!; openError = null; void select(n, findLead(n)); } } }, 'Tentar de novo'),
          h('button', { class: 'btn ghost sm', on: { click: () => opts.showWhatsApp() } }, 'Abrir no WhatsApp'))));
      return;
    }
    if (!chat) {
      msgSig = 'none';
      msgsEl.replaceChildren(h('div', { class: 'empty' }, icon('chats'), 'Escolha uma conversa na lista.', 'As mensagens aparecem aqui e você responde sem sair do CRM.'));
      return;
    }
    const msgs = readMessages(chat.name, 300);
    const sig = JSON.stringify([chat.key, msgs, chatQuery]);
    if (!force && sig === msgSig) return;
    const atBottom = msgsEl.scrollTop + msgsEl.clientHeight >= msgsEl.scrollHeight - 40;
    const sameChat = msgSig.startsWith(JSON.stringify([chat.key]).slice(0, -1));
    msgSig = sig;
    const hits = chatQuery ? msgs.filter((m) => normalizeName(m.text).includes(normalizeName(chatQuery))).length : 0;
    chatSearchInfo.textContent = chatQuery ? (hits ? `${hits} resultado${hits > 1 ? 's' : ''}` : 'Nada encontrado') : '';
    const older = h('button', { class: 'btn ghost sm ib-older', on: { click: () => { if (!loadOlderMessages()) toast(root, 'Não há mensagens anteriores carregáveis.'); } } }, icon('arrow-up', 14), 'Carregar mensagens anteriores');
    msgsEl.replaceChildren(older, ...(msgs.length
      ? msgs.map((m) => bubble(m, chat.isGroup))
      : [h('div', { class: 'empty' }, 'Nenhuma mensagem carregada.', 'Mensagens antigas aparecem ao clicar em "Carregar mensagens anteriores".')]));
    if (chatQuery) msgsEl.querySelector('mark')?.scrollIntoView({ block: 'center' });
    else if (atBottom || !sameChat) msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async function send() {
    const chat = state.chat;
    const text = ta.value.trim();
    if (!chat || sending) return;
    if (files.length) return sendPhotos(chat.key, text);
    if (!text) return;
    ta.value = '';
    drafts.delete(chat.key);
    closeQuickReplies();
    await clearComposer();
    await replaceTokenWithText(0, text);
    await sendComposer(false);
    window.setTimeout(() => renderMessages(), 700);
  }

  async function sendPhotos(key: string, caption: string) {
    sending = true;
    renderTray();
    const { status: result, captionOk } = await sendFiles(files.map((f) => f.file), caption);
    // a legenda não entrou no editor do WhatsApp: o texto vai logo depois, como mensagem, para não se perder
    const textApart = result === 'sent' && !!caption && !captionOk;
    if (textApart) {
      await sleep(400);
      await clearComposer();
      await replaceTokenWithText(0, caption);
      await sendComposer(false);
    }
    sending = false;
    if (result === 'sent' || result === 'not-confirmed') {
      clearFiles();
      ta.value = '';
      drafts.delete(key);
      window.setTimeout(() => renderMessages(), 700);
    } else renderTray();
    if (result === 'sent') toast(root, textApart ? 'Foto enviada. O texto foi logo em seguida, como mensagem.' : 'Foto enviada.');
    else if (result === 'not-confirmed') { toast(root, 'Confira no WhatsApp original se a foto saiu.'); opts.showWhatsApp(); }
    else if (result === 'no-editor') { toast(root, 'O WhatsApp não abriu o editor de foto. Abri o WhatsApp original para você enviar por lá.'); opts.showWhatsApp(); }
    else toast(root, 'Abra uma conversa antes de enviar a foto.');
  }

  async function analyze() {
    const chat = state.chat;
    if (!chat) return;
    toast(root, 'Analisando a conversa…');
    try {
      const r = await analyzeChat(chat);
      if (r.analysis.draft && !ta.value.trim()) { ta.value = r.analysis.draft; drafts.set(chat.key, ta.value); }
      toast(root, `Lead ${r.analysis.heat} (${r.analysis.score}). CRM atualizado.`);
    } catch (err) {
      toast(root, err instanceof Error ? err.message : String(err));
    }
  }

  /* ---------- respostas rápidas no campo de mensagem ---------- */

  const TOKEN = /(?:^|\s)\/([^\s/]*)$/;
  function openQuickReplies(q: string) {
    const nq = q.toLowerCase();
    qrItems = state.quickReplies.filter((r) => !nq || r.shortcut.toLowerCase().startsWith(nq) || r.title.toLowerCase().includes(nq));
    qrSel = 0;
    renderQuickReplies();
  }
  function closeQuickReplies() { qrItems = []; qrPop.classList.add('hidden'); }
  function renderQuickReplies() {
    const chat = state.chat;
    const vars = fieldVars(chat ? leadFor(chat).existing : undefined);
    qrPop.replaceChildren(...(qrItems.length
      ? qrItems.map((r, i) => h('button', { class: 'item' + (i === qrSel ? ' sel' : ''), role: 'option', 'aria-selected': String(i === qrSel),
          on: { mousedown: (e) => { e.preventDefault(); chooseQuickReply(r); } } },
          h('b', {}, '/' + r.shortcut + ' ' + r.title), h('small', {}, applyVars(r.text, chat, vars))))
      : [h('div', { class: 'hint' }, 'Nenhuma resposta rápida. Crie em Ajustes.')]));
    qrPop.classList.remove('hidden');
  }
  function chooseQuickReply(r: QuickReply) {
    const chat = state.chat;
    const text = applyVars(r.text, chat, fieldVars(chat ? leadFor(chat).existing : undefined));
    ta.value = TOKEN.test(ta.value) ? ta.value.replace(TOKEN, (m) => (m.startsWith(' ') ? ' ' : '') + text) : (ta.value ? ta.value + ' ' : '') + text;
    if (chat) drafts.set(chat.key, ta.value);
    closeQuickReplies();
    ta.focus();
  }

  ta.addEventListener('input', () => {
    if (state.chat) drafts.set(state.chat.key, ta.value);
    const m = ta.value.match(TOKEN);
    if (m) openQuickReplies(m[1] ?? ''); else closeQuickReplies();
  });
  ta.addEventListener('keydown', (e) => {
    if (!qrPop.classList.contains('hidden') && qrItems.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); qrSel = (qrSel + (e.key === 'ArrowDown' ? 1 : qrItems.length - 1)) % qrItems.length; renderQuickReplies(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseQuickReply(qrItems[qrSel]!); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeQuickReplies(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  });
  ta.addEventListener('blur', () => window.setTimeout(closeQuickReplies, 150));
  ta.addEventListener('paste', (e) => {
    const pasted = [...(e.clipboardData?.files ?? [])];
    if (!pasted.length || !state.chat) return;
    e.preventDefault();
    addFiles(pasted);
  });

  /* ---------- painel ---------- */

  let panelSig = '';
  function renderPanel() {
    if (panelEl.contains(root.activeElement)) { panelDirty = true; return; } // não apaga o que você está digitando
    panelDirty = false;
    const chat = pending ? null : state.chat;
    const lead = chat ? leadFor(chat).existing : undefined;
    const sig = JSON.stringify([chat, lead, state.fields, state.stages]);
    if (sig === panelSig) return;
    panelSig = sig;
    panelEl.replaceChildren(...contactPanel(root, chat));
  }

  function renderAll() {
    if (!opts.isVisible()) return;
    renderList();
    renderChat();
    renderPanel();
  }

  return {
    el,
    refresh() { if (!opts.isVisible()) return; renderList(true); renderChat(true); panelSig = ''; renderPanel(); },
    tick() {
      if (!opts.isVisible()) return;
      if (pending === null && openError && state.chat && looseName(state.chat.name) === looseName(openError)) openError = null;
      renderAll();
    },
    openLead(c) { void select(c.name, c); },
  };
}
