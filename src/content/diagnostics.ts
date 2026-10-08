import { conversationRoot } from './observer';
import { MESSAGE_ID_PATTERN, OUTGOING_MARKERS, queryAll, queryFirst } from '../utils/domSelectors';
import { readMessages } from './messages';
import { getComposer } from '../utils/domHelpers';
import { state } from './state';

/** Resumo do que a extensão enxerga no DOM - ajuda a ajustar domSelectors.ts quando o WhatsApp muda. */
export function collectDiagnostics(): string {
  const root = conversationRoot();
  const ids = Array.from(document.querySelectorAll('[data-id]'))
    .map((n) => n.getAttribute('data-id') ?? '')
    .filter((id) => MESSAGE_ID_PATTERN.test(id));
  const mask = (s: string) => s.replace(/\d(?=\d{4})/g, '•');
  const rows = queryAll('chatListRows');
  return JSON.stringify({
    url: location.href,
    composerFound: !!getComposer(),
    conversationRootTag: root?.tagName ?? null,
    hasMainId: !!document.getElementById('main'),
    hasPaneSide: !!document.getElementById('pane-side'),
    headerTitle: root?.querySelector('header')?.innerText.split('\n').slice(0, 3) ?? null,
    dataIdTotal: document.querySelectorAll('[data-id]').length,
    dataIdRawSamples: Array.from(document.querySelectorAll('[data-id]')).slice(0, 3).map((n) => mask(n.getAttribute('data-id') ?? '').slice(0, 30)),
    prePlainTextSample: mask(document.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') ?? '').slice(0, 40),
    headerTitleAttrs: Array.from(root?.querySelectorAll('header [title]') ?? []).slice(0, 4).map((e) => e.getAttribute('title')),
    messageIdsFound: ids.length,
    messageIdSamples: ids.slice(0, 3).map((i) => mask(i).slice(0, 40)),
    chatContext: state.chat ? { ...state.chat, key: mask(state.chat.key), number: state.chat.number ? mask(state.chat.number) : null } : null,
    // sinais usados para saber quem enviou cada mensagem (ver isOutgoing em messages.ts)
    direction: {
      textBubbles: root?.querySelectorAll('[data-pre-plain-text]').length ?? 0,
      messageInClass: root?.querySelectorAll('[class*="message-in"]').length ?? 0,
      messageOutClass: root?.querySelectorAll('[class*="message-out"]').length ?? 0,
      deliveryIcons: root?.querySelectorAll(OUTGOING_MARKERS).length ?? 0,
      readAsMine: state.chat ? readMessages(state.chat.name).filter((m) => m.out).length : 0,
    },
    searchBoxTag: queryFirst('searchBox')?.tagName ?? null,
    chatListRows: rows.length,
    contacts: state.contacts.length,
  }, null, 2);
}
