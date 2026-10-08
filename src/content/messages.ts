import { MEDIA_MARKERS, OUTGOING_MARKERS, queryAll } from '../utils/domSelectors';
import { sleep } from '../utils/domHelpers';
import { looseName, normalizeName } from '../utils/format';
import { conversationRoot } from './observer';
import { state } from './state';

/** Mídias que podem ter legenda: o texto vem precedido do marcador. */
const VISUAL_MEDIA = new Set(['foto', 'vídeo', 'documento']);

/** Bloco da mensagem citada ("Responder") dentro de um balão. */
const QUOTE_BLOCK = '[aria-label^="Mensagem citada"], [aria-label^="Quoted message"], [data-testid="quoted-message"], [class*="quoted"]';

/**
 * Separa o texto NOVO do balão do texto citado. Um balão de resposta contém a citação (que também tem
 * span.selectable-text) antes do texto novo: pegar o primeiro span mostraria a mensagem citada como se fosse reenviada.
 */
export function splitReply(bubble: HTMLElement): { text: string; quote?: string } {
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

/**
 * Decide se o balão foi enviado por você. O WhatsApp tirou o "true_/false_" do data-id e nem sempre tem as classes
 * message-in/out, então a ordem é: classe, ícone de entrega (só mensagens suas têm), lado do balão na tela e,
 * por último, o autor. Comparar o autor com o nome do chat marcava como sua toda mensagem de outra pessoa em grupo.
 */
export function isOutgoing(el: HTMLElement, root: HTMLElement, author: string, chatName: string, isGroup: boolean): boolean {
  if (el.closest('[class*="message-out"]')) return true;
  if (el.closest('[class*="message-in"]')) return false;
  if ((el.closest('[data-id]') ?? el.parentElement)?.querySelector(OUTGOING_MARKERS)) return true;
  const r = el.getBoundingClientRect();
  const p = root.getBoundingClientRect();
  if (r.width && p.width) {
    const left = r.left - p.left;
    const right = p.right - r.right;
    if (Math.abs(left - right) > 40) return left > right; // balões seus ficam à direita
  }
  if (!author) return false; // mídia sem autor e sem outro sinal: assume recebida
  if (isGroup) return /^(voc[eê]|you)$/i.test(author);
  return normalizeName(author) !== normalizeName(chatName);
}

export interface Msg {
  out: boolean;
  text: string;
  quote?: string;
  time: string;
  author: string;
  media?: string; // "áudio", "foto"… quando o balão é (ou tem) mídia
  img?: string; // foto: blob: do próprio WhatsApp (mesma página, dá para exibir na nossa tela)
  link?: string; // localização: link do mapa
  at?: number; // horário completo, quando o WhatsApp informa a data (balões de texto)
}

/** "[12:38, 06/10/2026]" -> timestamp local. Formato do WhatsApp em português (dia/mês/ano). */
function parseStamp(raw: string): number | undefined {
  const m = raw.match(/(\d{1,2}):(\d{2}),?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  const [, hh, mm, d, mo, y] = m.map(Number) as number[];
  const t = new Date(y!, mo! - 1, d!, hh, mm).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** Link do mapa de uma mensagem de localização (só endereços de mapa conhecidos). */
const mapLinkOf = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href]')).map((a) => a.href)
    .find((u) => /^https:\/\/(maps\.google\.|www\.google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/.test(u));

const photoOf = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLImageElement>('img[src^="blob:"]')).find((i) => i.getBoundingClientRect().width >= 80)?.src;

/** Primeiro tipo de mídia encontrado no balão, com o elemento que o denunciou (usado para saber o lado da tela). */
function detectMedia(row: HTMLElement): { label: string; el: HTMLElement } | null {
  for (const [label, sel] of MEDIA_MARKERS) {
    const el = Array.from(row.querySelectorAll<HTMLElement>(sel)).find((e) => label !== 'foto' || e.getBoundingClientRect().width >= 80);
    if (el) return { label, el };
  }
  return null;
}

const timeOf = (row: HTMLElement) =>
  Array.from(row.querySelectorAll('span')).map((s) => s.textContent?.trim() ?? '').filter((t) => /^\d{1,2}:\d{2}$/.test(t)).pop() ?? '';

/**
 * Lê as mensagens da conversa aberta. Texto: cada balão tem data-pre-plain-text="[22:03, 06/10/2026] Autor: ".
 * Mídia sem legenda não tem esse atributo: é reconhecida pelos ícones (áudio, figurinha, documento…) dentro da
 * linha [data-id] e vira um marcador como "[áudio]". Mídia com legenda vira "[foto] legenda".
 */
export function readMessages(chatName: string, limit = 40): Msg[] {
  const root = conversationRoot();
  if (!root) return [];
  const isGroup = !!state.chat?.isGroup;
  const units: { node: HTMLElement; msg: Msg }[] = [];

  root.querySelectorAll<HTMLElement>('[data-pre-plain-text]').forEach((el) => {
    const m = (el.getAttribute('data-pre-plain-text') ?? '').match(/^\[(.+?)\]\s*(.*?):\s*$/);
    if (!m) return;
    const { text, quote } = splitReply(el);
    if (!text) return;
    const author = m[2] ?? '';
    const media = detectMedia(el.closest<HTMLElement>('[data-id]') ?? el);
    const label = media && VISUAL_MEDIA.has(media.label) ? media.label : undefined;
    const img = label === 'foto' ? photoOf(el.closest<HTMLElement>('[data-id]') ?? el) : undefined;
    units.push({ node: el, msg: { out: isOutgoing(el, root, author, chatName, isGroup), text: label ? `[${label}] ${text}` : text, quote, time: (m[1] ?? '').split(',')[0] ?? '', author, media: label, img, at: parseStamp(m[1] ?? '') } });
  });

  // linhas de mensagem sem texto (só a mais externa de cada [data-id])
  root.querySelectorAll<HTMLElement>('[data-id]').forEach((row) => {
    if (row.parentElement?.closest('[data-id]') || row.querySelector('[data-pre-plain-text]')) return;
    const media = detectMedia(row);
    if (!media) return;
    const img = media.label === 'foto' ? photoOf(row) : undefined;
    const link = media.label === 'localização' ? mapLinkOf(row) : undefined;
    units.push({ node: row, msg: { out: isOutgoing(media.el, root, '', chatName, isGroup), text: `[${media.label}]`, time: timeOf(row), author: '', media: media.label, img, link } });
  });

  units.sort((a, b) => (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return units.map((u) => u.msg).slice(-limit);
}

/** Espera o WhatsApp mostrar a conversa pedida (o observer atualiza state.chat). */
export async function waitForChat(name: string, key?: string, timeoutMs = 4000): Promise<boolean> {
  const target = looseName(name);
  for (let t = 0; t < timeoutMs; t += 150) {
    if (state.chat && (state.chat.key === key || looseName(state.chat.name) === target)) {
      await sleep(250); // deixa as mensagens renderizarem
      return true;
    }
    await sleep(150);
  }
  return false;
}

/** Contêiner com rolagem da conversa aberta (o ancestral rolável das mensagens). */
function messagePane(): HTMLElement | null {
  const first = conversationRoot()?.querySelector<HTMLElement>('[data-pre-plain-text], [data-id]');
  for (let el = first?.parentElement ?? null; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

/** Rola a conversa do WhatsApp para cima: ele carrega mensagens anteriores, que aparecem na nossa tela. */
export function loadOlderMessages(): boolean {
  const pane = messagePane();
  if (!pane) return false;
  pane.scrollTop = 0;
  return true;
}
