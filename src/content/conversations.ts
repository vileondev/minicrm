import type { Contact } from '../types';
import { putContact } from '../storage/db';
import { queryAll } from '../utils/domSelectors';
import { looseName } from '../utils/format';
import { readMessages } from './messages';
import { rowNames } from './chatList';
import { state } from './state';

/** Uma linha da lista de conversas do WhatsApp, como a nossa tela mostra. */
export interface ConvRow {
  name: string;
  preview: string;
  time: string; // como o WhatsApp mostra: "12:38", "ontem", "06/10/2026"
  unread: number;
  avatar?: string;
  order: number; // posição na lista do WhatsApp (mais recente primeiro)
}

const TIME_LINE = /^(\d{1,2}:\d{2}|ontem|yesterday|hoje|today|\d{1,2}\/\d{1,2}\/\d{2,4}|segunda|terça|quarta|quinta|sexta|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
const UNREAD = '[aria-label*="não lida" i], [aria-label*="não lidas" i], [aria-label*="unread" i]';

function readRow(row: HTMLElement, order: number): ConvRow | null {
  const name = rowNames(row)[0];
  if (!name) return null;
  // elementos "folha" (sem filhos): o horário é um deles, sozinho
  const leaves = Array.from(row.querySelectorAll<HTMLElement>('span, div')).filter((e) => !e.firstElementChild).map((e) => e.textContent?.trim() ?? '');
  const time = leaves.find((t) => TIME_LINE.test(t) && t.length <= 12) ?? '';
  const badge = row.querySelector(UNREAD);
  const unread = badge ? Number(badge.textContent?.replace(/\D/g, '') || 1) : 0;
  // a prévia da última mensagem tem title próprio; sem ele, a primeira linha de texto que não é nome nem horário
  const lines = row.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
  const preview = rowNames(row).find((t) => !t.includes(name) && looseName(t) !== looseName(name))
    ?? lines.find((l) => !l.includes(name) && l !== time && !/^\d+$/.test(l)) ?? '';
  const avatar = Array.from(row.querySelectorAll('img')).find((i) => i.src.startsWith('http'))?.src;
  return { name, preview, time, unread, avatar, order };
}

/**
 * A lista do WhatsApp é virtualizada: só existem no DOM as linhas visíveis. Guardamos as já vistas nesta sessão
 * para a nossa lista não "perder" conversas quando o WhatsApp rola. Linhas visíveis agora sobrescrevem as antigas.
 */
const cache = new Map<string, ConvRow>();

export function readConversations(): ConvRow[] {
  const rows = queryAll('chatListRows');
  // ordem = posição da linha dentro do conteúdo rolável (a lista é virtualizada, o índice no DOM não serve)
  const pane = document.getElementById('pane-side');
  const top = pane ? pane.getBoundingClientRect().top - pane.scrollTop : 0;
  rows.forEach((r, i) => {
    const y = r.getBoundingClientRect().top - top;
    const row = readRow(r, Number.isFinite(y) ? Math.round(y) : i);
    if (row) cache.set(looseName(row.name), row);
  });
  return [...cache.values()].sort((a, b) => a.order - b.order);
}

export const findLead = (name: string): Contact | undefined => {
  const lo = looseName(name);
  return state.contacts.find((c) => looseName(c.name) === lo);
};

/** Rola a lista do WhatsApp (escondida atrás do app) para ele carregar mais conversas. */
export function loadMoreConversations(): void {
  const pane = document.getElementById('pane-side');
  if (pane) pane.scrollTop += pane.clientHeight * 0.9;
}

export function resetConversationScroll(): void {
  const pane = document.getElementById('pane-side');
  if (pane) pane.scrollTop = 0;
}

/**
 * Mantém "aguardando resposta" e "resolvida" em dia. Chamado a cada varredura do observer:
 * - conversa aberta: a última mensagem é do cliente -> aguardando desde ela; é sua -> respondido;
 * - lista: conversa de um lead com mensagens não lidas -> aguardando;
 * - mensagem nova do cliente numa conversa resolvida reabre a conversa.
 * Só grava quando algo muda.
 */
/**
 * Para conversas resolvidas: a última mensagem recebida e o total de não lidas vistos desde que foram resolvidas.
 * Só reabre quando isso MUDA. Antes, resolver uma conversa cuja última mensagem era do cliente (ou com não lidas)
 * fazia a verificação seguinte reabrir na hora, e o "Resolver" parecia não funcionar.
 */
const resolvedBaseline = new Map<string, { msg?: string; unread?: number }>();

export async function trackStatus(rows: ConvRow[]): Promise<void> {
  const changes: Contact[] = [];
  const reopen = (c: Contact) => { c.status = 'open'; c.resolvedAt = undefined; resolvedBaseline.delete(c.phone); };
  const mark = (c: Contact, since: number) => {
    if (c.awaitingSince) return;
    c.awaitingSince = since;
    c.lastMsgAt = Math.max(c.lastMsgAt ?? 0, since);
    changes.push(c);
  };
  for (const c of state.contacts) if (c.status !== 'resolved') resolvedBaseline.delete(c.phone);

  const chat = state.chat;
  const open = chat && state.contacts.find((c) => c.phone === chat.key || looseName(c.name) === looseName(chat.name));
  if (chat && open) {
    const last = readMessages(chat.name, 1)[0];
    if (last && !last.out) {
      if (open.status === 'resolved') {
        const sig = msgSig(last);
        const base = resolvedBaseline.get(open.phone) ?? {};
        // mensagem claramente posterior (horário tem só minutos) ou diferente da que havia ao resolver
        const newer = !!last.at && !!open.resolvedAt && last.at > open.resolvedAt + 60_000;
        if (newer || (base.msg !== undefined && base.msg !== sig)) { reopen(open); mark(open, last.at ?? Date.now()); }
        else resolvedBaseline.set(open.phone, { ...base, msg: sig });
      } else mark(open, last.at ?? Date.now());
    } else if (last?.out && open.awaitingSince) {
      open.awaitingSince = undefined;
      open.lastMsgAt = last.at ?? Date.now();
      changes.push(open);
    }
  }
  for (const r of rows) {
    const c = findLead(r.name);
    if (!c || c === open) continue;
    if (c.status === 'resolved') {
      const base = resolvedBaseline.get(c.phone) ?? {};
      if (base.unread !== undefined && r.unread > base.unread) { reopen(c); mark(c, Date.now()); }
      else resolvedBaseline.set(c.phone, { ...base, unread: r.unread });
    } else if (r.unread) mark(c, Date.now());
  }
  for (const c of new Set(changes)) await putContact(c);
}

const msgSig = (m: { author: string; time: string; text: string }) => `${m.author}|${m.time}|${m.text}`;

export async function setStatus(c: Contact, status: 'open' | 'resolved'): Promise<void> {
  c.status = status;
  c.resolvedAt = status === 'resolved' ? Date.now() : undefined;
  if (status === 'resolved') {
    c.awaitingSince = undefined;
    // ponto de partida gravado no clique: qualquer mensagem do cliente diferente desta reabre a conversa
    const chat = state.chat;
    if (chat && (chat.key === c.phone || looseName(chat.name) === looseName(c.name))) {
      const last = readMessages(chat.name, 1)[0];
      resolvedBaseline.set(c.phone, { msg: last && !last.out ? msgSig(last) : '' });
    }
  } else resolvedBaseline.delete(c.phone);
  await putContact(c);
}

export const isAwaiting = (c: Contact | undefined) => !!c?.awaitingSince && c.status !== 'resolved';
