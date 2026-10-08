import { state } from '../content/state';
import { avatarColor, initials } from '../utils/format';
import { contactPanel } from './ContactPanel';
import { settingsContent, type SettingsSection } from './Settings';
import { icon } from './icons';
import { h } from './h';

type Tab = 'contact' | SettingsSection;

export interface Panel {
  toggle(): void;
  refresh(): void;
}

/**
 * Painel lateral sobre o WhatsApp original (Alt+P). Com o app aberto, os mesmos conteúdos ficam na caixa de
 * entrada (dados do contato) e em Ajustes; este painel é para quando você está usando o WhatsApp em si.
 */
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
        h('span', { class: 'muted' }, !chat ? 'Abra uma conversa' : chat.isGroup ? 'Grupo' : chat.number ? '+' + chat.number : 'Sem número vinculado')),
      h('button', { class: 'x', title: 'Fechar', 'aria-label': 'Fechar painel', on: { click: () => api.toggle() } }, icon('x', 12)));
    tabsEl.replaceChildren(
      ...([['contact', 'Contato'], ['ai', 'IA'], ['flows', 'Fluxos'], ['replies', 'Respostas'], ['data', 'Dados']] as const).map(([id, label]) =>
        h('button', { class: 'tab' + (tab === id ? ' active' : ''), on: { click: () => { tab = id; refresh(); } } }, label)));
    void renderBody();
  }

  async function renderBody() {
    try {
      body.replaceChildren(...(tab === 'contact' ? contactPanel(root, state.chat).slice(1) : await settingsContent(root, tab, refresh)));
    } catch (err) {
      console.error('[WA CRM] erro ao renderizar painel', err);
      body.replaceChildren(h('p', { class: 'muted' }, 'Erro ao renderizar: ' + String(err)));
    }
  }

  const api: Panel = {
    toggle() { panel.classList.toggle('hidden'); refresh(); },
    refresh,
  };
  return api;
}
