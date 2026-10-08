import type { ChatContext } from '../types';
import { GROUP_SUBTITLE_PATTERN, HEADER_STATUS_PATTERN, MESSAGE_ID_PATTERN, PHONE_TEXT_PATTERN, queryFirst } from '../utils/domSelectors';
import { sanitizePhone } from '../utils/domHelpers';
import { looseName, normalizeName } from '../utils/format';
import { isOutgoing, splitReply } from './messages';

/** Painel da conversa aberta: ancestral do composer que também contém um <header>. Não depende de #main. */
export function conversationRoot(): HTMLElement | null {
  let el: HTMLElement | null = queryFirst('composer');
  for (let i = 0; el && i < 14; i++, el = el.parentElement) {
    if (el.querySelector('header')) return el;
  }
  return null;
}

function readTitle(root: HTMLElement): string {
  const header = root.querySelector('header');
  if (!header) return '';
  // o texto visível do cabeçalho é a fonte mais confiável; atributos title do cabeçalho são rótulos de botões ("Dados do perfil")
  const line = header.innerText.split('\n').map((l) => l.trim()).find((l) => l && !HEADER_STATUS_PATTERN.test(l));
  if (line) return line;
  const auto = Array.from(header.querySelectorAll<HTMLElement>('span[dir="auto"]')).find((e) => e.textContent?.trim());
  return auto?.textContent?.trim() ?? '';
}

function isGroupHeader(root: HTMLElement): boolean {
  const header = root.querySelector('header');
  if (!header) return false;
  const lines = header.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
  const attrs = Array.from(header.querySelectorAll('[title]')).map((e) => e.getAttribute('title') ?? '');
  return [...lines, ...attrs].some((l) => GROUP_SUBTITLE_PATTERN.test(l));
}

/**
 * Outro sinal de grupo: mensagem RECEBIDA cujo autor não é o nome da conversa. Numa conversa individual quem
 * escreve para você é sempre o próprio contato; num grupo, cada balão traz o nome de quem mandou.
 * Necessário porque o cabeçalho do grupo mostra "clique para dados do grupo" antes da lista de participantes.
 */
function hasOtherAuthors(root: HTMLElement, chatName: string): boolean {
  const target = looseName(chatName);
  return Array.from(root.querySelectorAll<HTMLElement>('[data-pre-plain-text]')).some((el) => {
    const author = el.getAttribute('data-pre-plain-text')?.match(/\]\s*(.*?):\s*$/)?.[1] ?? '';
    return !!author && looseName(author) !== target && !isOutgoing(el, root, author, chatName, false);
  });
}

interface Idf { id: string; digits: string; kind: string }

function messageIds(root: ParentNode): Idf[] {
  const out: Idf[] = [];
  root.querySelectorAll<HTMLElement>('[data-id]').forEach((n) => {
    const m = n.getAttribute('data-id')?.match(MESSAGE_ID_PATTERN);
    if (m?.[2] && m[3]) out.push({ id: n.getAttribute('data-id')!, digits: m[2], kind: m[3] });
  });
  return out;
}

export function readChatContext(): ChatContext | null {
  const root = conversationRoot();
  if (!root) return null;
  const name = readTitle(root);
  const ids = messageIds(root);

  const pick = (kind: string) => ids.find((i) => i.kind === kind);
  const cus = pick('c.us');
  if (cus) return { key: cus.digits, number: cus.digits, name, isGroup: false, byName: false };
  const grp = pick('g.us');
  if (grp) return { key: 'g' + grp.digits, number: null, name, isGroup: true, byName: false };
  const lid = pick('lid');
  if (lid) return { key: 'lid' + lid.digits, number: PHONE_TEXT_PATTERN.test(name) ? sanitizePhone(name) : null, name, isGroup: false, byName: false };
  if (!name) return null;
  // data-id sem telefone (formato atual do WhatsApp): grupo é reconhecido pela linha de participantes "…, Você"
  if (isGroupHeader(root) || hasOtherAuthors(root, name)) return { key: 'name_' + normalizeName(name), number: null, name, isGroup: true, byName: true };
  if (PHONE_TEXT_PATTERN.test(name)) {
    const n = sanitizePhone(name);
    return { key: n, number: n, name, isGroup: false, byName: false };
  }
  return { key: 'name_' + normalizeName(name), number: null, name, isGroup: false, byName: true };
}

export interface ObserverHandlers {
  onChatChange: (ctx: ChatContext | null) => void;
  onIncoming: (text: string, ctx: ChatContext) => void;
  onTick: () => void; // a cada varredura (usada para as badges da lista)
}

export function startObserver(h: ObserverHandlers): () => void {
  let currentKey: string | null = null;
  let seen = new Set<string>();
  let primed = false;
  let timer: number | undefined;

  const scan = () => {
    const ctx = readChatContext();
    // a chave pode "subir de nível" (name_ → telefone) quando as mensagens carregam: troca de chat só se mudou o nome ou o tipo
    // muda de conversa, ou a mesma conversa foi reconhecida como grupo depois que o cabeçalho carregou
    const key = ctx ? `${ctx.key}|${ctx.isGroup}` : null;
    if (key !== currentKey) {
      currentKey = key;
      seen = new Set();
      primed = false;
      h.onChatChange(ctx);
    }
    h.onTick();
    if (!ctx) return;

    // cada balão de texto tem data-pre-plain-text; o id vem do data-id do balão (hoje só um hash, sem "false_/true_")
    const root = conversationRoot();
    const nodes = root ? Array.from(root.querySelectorAll<HTMLElement>('[data-pre-plain-text]')) : [];
    const idOf = (n: HTMLElement) => n.closest('[data-id]')?.getAttribute('data-id') ?? (n.getAttribute('data-pre-plain-text') ?? '') + n.textContent;
    const last = nodes[nodes.length - 1];
    if (root && last && primed && !seen.has(idOf(last))) {
      const author = last.getAttribute('data-pre-plain-text')?.match(/\]\s*(.*?):\s*$/)?.[1] ?? '';
      // só a mensagem mais recente, e só se for recebida
      if (!isOutgoing(last, root, author, ctx.name, ctx.isGroup)) {
        const { text } = splitReply(last);
        if (text) h.onIncoming(text, ctx);
      }
    }
    nodes.forEach((n) => seen.add(idOf(n)));
    if (nodes.length) primed = true;
  };

  const mo = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(scan, 250);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => mo.disconnect();
}
