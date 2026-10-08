import { mountKanban } from '../components/Kanban';
import { mountPanel } from '../components/Sidebar';
import { mountQuickReplyPopup, mountSuggestionToast } from '../components/QuickReplyPopup';
import { h } from '../components/h';
import { icon } from '../components/icons';
import { loadFonts } from './fonts';
import { getQuickReplies, getRules } from '../storage/chromeStore';
import { todayStr } from '../utils/format';
import { refreshBadges } from './chatList';
import { mountShadowRoot } from './injector';
import { startObserver } from './observer';
import { reloadState, state, watchState } from './state';

async function init() {
  await Promise.all([reloadState(), loadFonts()]);
  const root = mountShadowRoot();
  const kanban = mountKanban(root);
  const panel = mountPanel(root);
  mountQuickReplyPopup(root);
  const suggest = mountSuggestionToast(root);

  // dock: botões na lateral esquerda do WhatsApp
  const badge = h('span', { class: 'badge hidden' });
  const kbBtn = h('button', { title: 'Kanban (Alt+K)', 'aria-label': 'Abrir Kanban', on: { click: () => kanban.toggle() } }, icon('kanban', 20), badge);
  root.append(h('div', { class: 'dock' }, kbBtn,
    h('button', { title: 'Contato (Alt+P)', 'aria-label': 'Abrir painel do contato', on: { click: () => panel.toggle() } }, icon('panel', 20))));

  const updateBadge = () => {
    const late = state.contacts.reduce((a, c) => a + c.tasks.filter((t) => !t.done && t.due && t.due < todayStr()).length, 0);
    badge.textContent = String(late);
    badge.classList.toggle('hidden', late === 0);
  };

  watchState(() => {
    refreshBadges();
    updateBadge();
    panel.refresh();
    kanban.refresh();
  });

  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key.toLowerCase() === 'k') { e.preventDefault(); kanban.toggle(); }
    if (e.key.toLowerCase() === 'p') { e.preventDefault(); panel.toggle(); }
  }, true);

  updateBadge();
  startObserver({
    onChatChange: (ctx) => { state.chat = ctx; panel.refresh(); kanban.refresh(); },
    onTick: () => { refreshBadges(); kanban.refreshChat(); },
    onIncoming: async (text) => {
      const lower = text.toLowerCase();
      const [rules, replies] = await Promise.all([getRules(), getQuickReplies()]);
      const rule = rules.find((r) => r.enabled && lower.includes(r.keyword.toLowerCase()));
      const qr = rule && replies.find((q) => q.id === rule.quickReplyId);
      if (qr) suggest(qr); // só sugere; o usuário decide inserir
    },
  });
}

void init();
