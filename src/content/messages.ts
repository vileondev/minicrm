import { queryAll } from '../utils/domSelectors';
import { sleep } from '../utils/domHelpers';
import { normalizeName } from '../utils/format';
import { conversationRoot } from './observer';
import { state } from './state';

/** Bloco da mensagem citada ("Responder") dentro de um balão. */
const QUOTE_BLOCK = '[aria-label^="Mensagem citada"], [aria-label^="Quoted message"], [data-testid="quoted-message"], [class*="quoted"]';

/**
 * Separa o texto NOVO do balão do texto citado. Um balão de resposta contém a citação (que também tem
 * span.selectable-text) antes do texto novo: pegar o primeiro span mostraria a mensagem citada como se fosse reenviada.
 */
function splitReply(bubble: HTMLElement): { text: string; quote?: string } {
  const spans = queryAll('messageText', bubble).filter((s) => !s.parentElement?.closest('span.selectable-text'));
  let own = spans.filter((s) => !s.closest(QUOTE_BLOCK));
  let quoted = spans.filter((s) => s.closest(QUOTE_BLOCK));
  if (!quoted.length && spans.length > 1) {
    // seletor da citação não bateu: o texto novo é o último, os anteriores são a citação
    own = spans.slice(-1);
    quoted = spans.slice(0, -1);
  }
  const text = own.map((s) => s.innerText.trim()).filter(Boolean).join('\n');
  const quote = quoted.map((s) => s.innerText.trim()).filter(Boolean).join(' ');
  return { text: text || (spans.length ? '' : bubble.innerText.trim()), quote: quote || undefined };
}

export interface Msg {
  out: boolean;
  text: string;
  quote?: string;
  time: string;
  author: string;
}

/**
 * Lê as mensagens de TEXTO da conversa aberta. Cada balão de texto tem data-pre-plain-text="[22:03, 06/10/2026] Autor: ".
 * Mídia sem legenda (foto, áudio, figurinha) não aparece. Direção: classe message-in/out quando existir,
 * senão compara o autor com o nome do chat.
 */
export function readMessages(chatName: string, limit = 40): Msg[] {
  const root = conversationRoot();
  if (!root) return [];
  const isGroup = !!state.chat?.isGroup;
  const out: Msg[] = [];
  root.querySelectorAll<HTMLElement>('[data-pre-plain-text]').forEach((el) => {
    const m = (el.getAttribute('data-pre-plain-text') ?? '').match(/^\[(.+?)\]\s*(.*?):\s*$/);
    if (!m) return;
    const { text, quote } = splitReply(el);
    if (!text) return;
    const author = m[2] ?? '';
    let isOut: boolean;
    if (el.closest('[class*="message-out"]')) isOut = true;
    else if (el.closest('[class*="message-in"]')) isOut = false;
    else if (isGroup) isOut = /^(voc[eê]|you)$/i.test(author);
    else isOut = normalizeName(author) !== normalizeName(chatName);
    out.push({ out: isOut, text, quote, time: (m[1] ?? '').split(',')[0] ?? '', author });
  });
  return out.slice(-limit);
}

/** Espera o WhatsApp mostrar a conversa pedida (o observer atualiza state.chat). */
export async function waitForChat(name: string, timeoutMs = 4000): Promise<boolean> {
  const target = normalizeName(name);
  for (let t = 0; t < timeoutMs; t += 150) {
    if (state.chat && normalizeName(state.chat.name) === target) {
      await sleep(250); // deixa as mensagens renderizarem
      return true;
    }
    await sleep(150);
  }
  return false;
}
