import type { Contact } from '../types';
import { state } from '../content/state';
import { todayStr } from '../utils/format';
import { createFunnel, type FunnelMode } from './Kanban';
import { createInbox } from './Inbox';
import { SETTINGS_MENU, settingsContent, type SettingsSection } from './Settings';
import { icon, type IconName } from './icons';
import { h } from './h';

type Section = 'inbox' | FunnelMode | 'settings';

export interface App {
  open(): void;
  /** Abre o app numa seção; com `lead`, abre a conversa dele na caixa de entrada. */
  show(section: 'inbox' | 'tasks', lead?: Contact): void;
  hide(): void;
  toggle(): void;
  isOpen(): boolean;
  refresh(): void;
  tick(): void;
}

const NAV: [Section, string, IconName][] = [
  ['inbox', 'Conversas', 'chats'],
  ['board', 'Funil', 'kanban'],
  ['tasks', 'Tarefas', 'tasks'],
  ['report', 'Relatório', 'chart'],
  ['settings', 'Ajustes', 'gear'],
];

/**
 * O CRM em tela cheia por cima do WhatsApp Web. O WhatsApp continua carregado por baixo: é dele que vêm as
 * conversas e é por ele que as mensagens saem. "WhatsApp" na barra lateral esconde o app para usar o original.
 */
export function mountApp(root: ShadowRoot): App {
  let section: Section = 'inbox';
  let settingsSection: SettingsSection = 'tags';
  let visible = false;

  const isVisible = () => visible;
  const inbox = createInbox(root, { isVisible: () => visible && section === 'inbox', showWhatsApp: () => api.hide() });
  const funnel = createFunnel(root, {
    isVisible: () => visible && (section === 'board' || section === 'tasks' || section === 'report'),
    openConversation: (c: Contact) => { go('inbox'); inbox.openLead(c); },
  });

  const lateBadge = h('span', { class: 'rail-badge hidden' });
  const railNav = h('nav', { class: 'rail-nav', 'aria-label': 'Seções do CRM' });
  const rail = h('div', { class: 'rail' },
    h('div', { class: 'rail-mark', title: 'WA Local CRM', 'aria-hidden': 'true' }, icon('chats', 20)),
    railNav,
    h('span', { class: 'kb-spacer' }),
    h('button', { class: 'rail-btn', title: 'Usar o WhatsApp original (Alt+K volta)', 'aria-label': 'Usar o WhatsApp original', on: { click: () => api.hide() } }, icon('whatsapp', 22)));

  const settingsMenu = h('nav', { class: 'set-menu', 'aria-label': 'Ajustes' });
  const settingsBody = h('div', { class: 'set-body' });
  const settingsEl = h('div', { class: 'settings' }, h('div', { class: 'set-side' }, h('h2', {}, 'Ajustes'), settingsMenu), settingsBody);

  const main = h('main', { class: 'app-main' });
  const shell = h('div', { class: 'app hidden', role: 'application', 'aria-label': 'WA Local CRM' }, rail, main);
  root.append(shell);

  // teclas digitadas no app não podem chegar ao WhatsApp (ele joga o foco no próprio campo de mensagem)
  for (const type of ['keydown', 'keypress', 'keyup', 'paste'] as const) shell.addEventListener(type, (e) => e.stopPropagation());

  function renderRail() {
    const late = state.contacts.reduce((a, c) => a + c.tasks.filter((t) => !t.done && t.due && t.due < todayStr()).length, 0);
    lateBadge.textContent = String(late);
    lateBadge.classList.toggle('hidden', late === 0);
    railNav.replaceChildren(...NAV.map(([id, label, ic]) => h('button', { class: 'rail-btn' + (section === id ? ' on' : ''), title: label, 'aria-label': label, 'aria-current': section === id ? 'page' : 'false',
      on: { click: () => go(id) } }, icon(ic, 22), id === 'tasks' ? lateBadge : null)));
  }

  async function renderSettings() {
    settingsMenu.replaceChildren(...SETTINGS_MENU.map(([id, label, ic]) => h('button', { class: 'set-item' + (settingsSection === id ? ' on' : ''), 'aria-current': settingsSection === id ? 'page' : 'false',
      on: { click: () => { settingsSection = id; void renderSettings(); } } }, icon(ic, 16), label)));
    // não apaga um formulário que está sendo preenchido
    if (settingsBody.contains(root.activeElement) && settingsBody.dataset.section === settingsSection) return;
    settingsBody.dataset.section = settingsSection;
    const title = SETTINGS_MENU.find(([id]) => id === settingsSection)?.[1] ?? '';
    try {
      settingsBody.replaceChildren(h('h2', {}, title), ...(await settingsContent(root, settingsSection, () => void renderSettings())));
    } catch (err) {
      settingsBody.replaceChildren(h('div', { class: 'empty err' }, icon('warning'), 'Erro ao abrir esta seção.', String(err)));
    }
  }

  function render() {
    if (!visible) return;
    renderRail();
    if (section === 'inbox') {
      if (main.firstChild !== inbox.el) main.replaceChildren(inbox.el);
      inbox.refresh();
    } else if (section === 'settings') {
      if (main.firstChild !== settingsEl) main.replaceChildren(settingsEl);
      void renderSettings();
    } else {
      if (main.firstChild !== funnel.el) main.replaceChildren(funnel.el);
      funnel.setMode(section);
    }
  }

  function go(s: Section) {
    section = s;
    render();
  }

  const api: App = {
    open() {
      visible = true;
      shell.classList.remove('hidden');
      document.documentElement.classList.add('wacrm-app-open');
      render();
    },
    hide() {
      visible = false;
      shell.classList.add('hidden');
      document.documentElement.classList.remove('wacrm-app-open');
    },
    toggle() { if (visible) api.hide(); else api.open(); },
    show(s, lead) {
      api.open();
      go(s);
      if (lead && s === 'inbox') inbox.openLead(lead);
    },
    isOpen: isVisible,
    refresh() {
      if (!visible) return;
      renderRail();
      if (section === 'inbox') inbox.refresh();
      else if (section === 'settings') void renderSettings();
      else funnel.refresh();
    },
    tick() {
      if (!visible) return;
      if (section === 'inbox') inbox.tick();
      else if (section === 'board') funnel.refreshChat();
    },
  };
  document.addEventListener('wacrm-show-whatsapp', () => api.hide());
  return api;
}
