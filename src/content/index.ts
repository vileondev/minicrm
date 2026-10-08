import { mountApp } from '../components/App';
import { mountPanel } from '../components/Sidebar';
import { mountQuickReplyPopup, mountSuggestionToast } from '../components/QuickReplyPopup';
import { h, toast } from '../components/h';
import { icon } from '../components/icons';
import { scheduleAutoAnalysis } from './ai';
import { checkStale, initAutomation, onDataChanged, onIncomingMessage } from './automation';
import { checkTaskAlerts } from './notify';
import { refreshBadges } from './chatList';
import { readConversations, trackStatus } from './conversations';
import { loadFonts } from './fonts';
import { mountShadowRoot } from './injector';
import { startObserver } from './observer';
import { reloadState, setChat, state, watchState } from './state';

async function init() {
  await Promise.all([reloadState(), loadFonts()]);
  await onDataChanged(); // primeiro snapshot: não dispara fluxos para o que já existia
  const root = mountShadowRoot();
  const app = mountApp(root);
  const panel = mountPanel(root);
  mountQuickReplyPopup(root);
  const suggest = mountSuggestionToast(root);
  initAutomation({ suggest, notify: (msg) => toast(root, msg) });

  // com o WhatsApp original à mostra: botão para voltar ao CRM e painel do contato
  const dock = h('div', { class: 'dock' },
    h('button', { class: 'dock-main', title: 'Voltar ao CRM (Alt+K)', 'aria-label': 'Voltar ao CRM', on: { click: () => app.open() } }, icon('chats', 20)),
    h('button', { title: 'Contato (Alt+P)', 'aria-label': 'Abrir painel do contato', on: { click: () => panel.toggle() } }, icon('panel', 20)));
  root.append(dock);
  const syncDock = () => dock.classList.toggle('hidden', app.isOpen());
  const open = () => { app.open(); syncDock(); };

  watchState(async () => {
    await onDataChanged(); // fluxos "entra na etapa" e "tag adicionada"
    refreshBadges();
    panel.refresh();
    app.refresh();
    void checkStale();
  });

  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key.toLowerCase() === 'k') { e.preventDefault(); app.toggle(); syncDock(); }
    if (e.key.toLowerCase() === 'p') { e.preventDefault(); panel.toggle(); }
  }, true);
  document.addEventListener('wacrm-show-whatsapp', () => syncDock());
  new MutationObserver(syncDock).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // avisos de tarefa (vence hoje, atrasada) e o clique no aviso, que chega do service worker
  const alerts = () => void checkTaskAlerts().catch((err) => console.warn('[WA CRM] avisos de tarefa', err));
  window.setTimeout(alerts, 15000);
  window.setInterval(alerts, 5 * 60_000);
  chrome.runtime.onMessage.addListener((msg: { type?: string; key?: string }) => {
    if (msg?.type === 'wacrm-open-tasks') { app.show('tasks'); syncDock(); }
    if (msg?.type === 'wacrm-open-lead') {
      const lead = state.contacts.find((c) => c.phone === msg.key);
      app.show('inbox', lead);
      syncDock();
    }
  });

  // abre o CRM assim que o WhatsApp terminar de carregar (sem login, a tela do QR code continua visível)
  if (state.view.autoOpen) {
    const started = Date.now();
    const wait = window.setInterval(() => {
      if (document.getElementById('pane-side')) { window.clearInterval(wait); open(); }
      else if (Date.now() - started > 120000) window.clearInterval(wait);
    }, 500);
  }
  syncDock();

  let tracking = false;
  startObserver({
    onChatChange: (ctx) => { setChat(ctx); panel.refresh(); app.tick(); },
    onTick: () => {
      refreshBadges();
      app.tick();
      if (!tracking) {
        tracking = true;
        void trackStatus(readConversations()).finally(() => { tracking = false; });
      }
    },
    onIncoming: (text, raw) => {
      const chat = state.chat?.name === raw.name ? state.chat : raw; // usa o número vinculado, se houver
      if (state.contacts.some((c) => c.phone === chat.key && c.internal)) return; // interno: sem fluxos nem IA
      void onIncomingMessage(text, chat);
      // IA opcional: analisa sozinha só se o usuário ligou; o rascunho é apenas sugerido
      scheduleAutoAnalysis(chat, (r) => {
        if (r.analysis.draft) suggest({ title: 'Rascunho da IA', text: r.analysis.draft }, chat.key);
      });
    },
  });
}

void init();
