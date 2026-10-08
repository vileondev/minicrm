import type { QuickReply } from '../types';
import { getQuickReplies } from '../storage/chromeStore';
import { getComposer, getComposerText, replaceTokenWithText } from '../utils/domHelpers';
import { applyVars } from '../utils/format';
import { state } from '../content/state';
import { h } from './h';
import { icon } from './icons';

const TOKEN = /(?:^|\s)(\/[^\s/]*)$/; // "/atalho" no fim do texto, no começo ou após espaço

/** Digitar "/" no composer abre a lista; Enter/Tab/clique substitui o "/atalho" pelo texto (sem enviar). */
export function mountQuickReplyPopup(root: ShadowRoot): void {
  const popup = h('div', { class: 'popup hidden' });
  root.append(popup);
  let items: QuickReply[] = [];
  let sel = 0;
  let version = 0; // descarta respostas assíncronas antigas

  const close = () => {
    version++;
    popup.classList.add('hidden');
    items = [];
  };

  const currentToken = (): string | null => getComposerText().match(TOKEN)?.[1] ?? null;

  const choose = (qr: QuickReply) => {
    const token = currentToken() ?? '';
    close();
    void replaceTokenWithText(token.length, applyVars(qr.text, state.chat));
  };

  const render = () => {
    popup.replaceChildren(
      ...items.map((qr, i) =>
        h('div', { class: 'item' + (i === sel ? ' sel' : ''), on: { mousedown: (e) => { e.preventDefault(); choose(qr); } } },
          h('b', {}, '/' + qr.shortcut + '  ' + qr.title), h('small', {}, applyVars(qr.text, state.chat)))),
      h('div', { class: 'hint' }, 'Setas navegam, Enter insere, Esc fecha'),
    );
    const box = getComposer()?.getBoundingClientRect();
    if (box) {
      popup.style.left = box.left + 'px';
      popup.style.width = Math.min(Math.max(box.width, 320), 560) + 'px';
      popup.style.bottom = window.innerHeight - box.top + 10 + 'px';
    }
    popup.classList.toggle('hidden', items.length === 0);
  };

  const update = async () => {
    const token = currentToken();
    if (token === null) return close();
    const my = ++version;
    const q = token.slice(1).toLowerCase();
    const all = await getQuickReplies();
    if (my !== version) return;
    items = all.filter((r) => !q || r.shortcut.toLowerCase().startsWith(q) || r.title.toLowerCase().includes(q));
    sel = 0;
    render();
  };

  const inComposer = (t: EventTarget | null) => {
    const box = getComposer();
    return !!box && t instanceof Node && box.contains(t);
  };

  document.addEventListener('input', (e) => { if (inComposer(e.target)) void update(); }, true);
  document.addEventListener('keyup', (e) => {
    if (!inComposer(e.target) || ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
    void update();
  }, true);
  document.addEventListener('click', (e) => { if (!e.composedPath().includes(popup)) close(); }, true);

  document.addEventListener('keydown', (e) => {
    if (popup.classList.contains('hidden') || !inComposer(e.target) || items.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      render();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const qr = items[sel];
      if (!qr) return;
      choose(qr);
    } else if (e.key === 'Escape') {
      close();
    } else return;
    e.preventDefault();
    e.stopImmediatePropagation(); // impede o WhatsApp de enviar a mensagem
  }, true);
}

/** Aviso de sugestão disparado por regras If/Then. */
export function mountSuggestionToast(root: ShadowRoot): (qr: QuickReply) => void {
  const el = h('div', { class: 'toast hidden' });
  root.append(el);
  let timer: number | undefined;
  return (qr) => {
    el.replaceChildren(
      h('span', {}, 'Sugestão de resposta: ' + qr.title),
      h('button', { class: 'btn', on: { click: () => { el.classList.add('hidden'); void replaceTokenWithText(0, applyVars(qr.text, state.chat)); } } }, 'Inserir'),
      h('button', { class: 'x', on: { click: () => el.classList.add('hidden') } }, icon('x', 12)),
    );
    el.classList.remove('hidden');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => el.classList.add('hidden'), 15000);
  };
}
