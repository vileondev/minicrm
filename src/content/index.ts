import { mountKanban } from '../components/Kanban';
import { mountPanel } from '../components/Sidebar';
import { mountQuickReplyPopup, mountSuggestionToast } from '../components/QuickReplyPopup';
import { h, toast } from '../components/h';
import { icon } from '../components/icons';
import { todayStr } from '../utils/format';
import { scheduleAutoAnalysis } from './ai';
import { checkStale, initAutomation, onDataChanged, onIncomingMessage } from './automation';
import { refreshBadges } from './chatList';
import { loadFonts } from './fonts';
import { mountShadowRoot } from './injector';
import { startObserver } from './observer';
import { reloadState, state, watchState } from './state';

async function init() {
  await Promise.all([reloadState(), loadFonts()]);
  await onDataChanged(); // primeiro snapshot: não dispara fluxos para o que já existia
  const root = mountShadowRoot();
  const kanban = mountKanban(root);
  const panel = mountPanel(root);
  mountQuickReplyPopup(root);
  const suggest = mountSuggestionToast(root);
  initAutomation({ suggest, notify: (msg) => toast(root, msg) });

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

  watchState(async () => {
    await onDataChanged(); // fluxos "entra na etapa" e "tag adicionada"
    refreshBadges();
    updateBadge();
    panel.refresh();
    kanban.refresh();
    void checkStale();
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
    onIncoming: (text, chat) => {
      void onIncomingMessage(text, chat);
      // IA opcional: analisa sozinha só se o usuário ligou; o rascunho é apenas sugerido
      scheduleAutoAnalysis(chat, (r) => {
        if (r.analysis.draft) suggest({ title: 'Rascunho da IA', text: r.analysis.draft }, chat.key);
      });
    },
  });
}

void init();
