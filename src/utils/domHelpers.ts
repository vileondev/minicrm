import { MEDIA_CAPTION, MEDIA_SEND, queryFirst } from './domSelectors';

export const sanitizePhone = (raw: string): string => raw.replace(/\D/g, '');

export const randomDelay = (min = 1500, max = 4000): number => Math.floor(min + Math.random() * (max - min));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const getComposer = (): HTMLElement | null => queryFirst('composer');
export const getComposerText = (): string => (getComposer()?.innerText ?? '').replace(/[​\r]/g, '').replace(/\n$/, '');

function placeCaretAtEnd(box: HTMLElement): void {
  box.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Cola texto via ClipboardEvent: o editor (Lexical) trata como colagem real. Devolve true se ele tratou o evento. */
function pasteText(box: HTMLElement, text: string): boolean {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const ev = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
  return !box.dispatchEvent(ev);
}

/**
 * Apaga `count` caracteres antes do cursor. Primeiro tenta o beforeinput nativo (o editor Lexical do WhatsApp trata
 * deleteContentBackward), depois execCommand. Confere o tamanho do texto a cada passo para nunca apagar a mais.
 */
async function deleteBackward(box: HTMLElement, count: number): Promise<void> {
  if (count <= 0) return;
  const target = Math.max(0, getComposerText().length - count);
  for (let guard = 0; guard < count * 4 && getComposerText().length > target; guard++) {
    placeCaretAtEnd(box);
    const len = getComposerText().length;
    box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
    await sleep(30);
    if (getComposerText().length < len) continue;
    document.execCommand('delete');
    await sleep(30);
  }
}

/**
 * Apaga os últimos `tokenLength` caracteres do composer (o "/atalho" digitado) e insere o texto
 * no lugar, preservando o que o usuário já tinha escrito antes. Não envia.
 */
export async function replaceTokenWithText(tokenLength: number, text: string): Promise<boolean> {
  const box = getComposer();
  if (!box) return false;
  placeCaretAtEnd(box);
  await deleteBackward(box, tokenLength);
  const before = getComposerText();
  pasteText(box, text);
  await sleep(80);
  if (getComposerText() === before) {
    // colagem ignorada: fallback para os eventos de input nativos
    box.focus();
    if (!document.execCommand('insertText', false, text)) {
      box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
      box.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
    }
  }
  return true;
}

export const insertText = (text: string) => replaceTokenWithText(0, text);

/** Esvazia o composer do WhatsApp (usado antes de enviar uma mensagem digitada no Kanban). */
export async function clearComposer(): Promise<void> {
  const box = getComposer();
  if (!box) return;
  for (let i = 0; i < 3 && getComposerText().length > 0; i++) {
    placeCaretAtEnd(box);
    document.execCommand('selectAll');
    box.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
    await sleep(40);
    if (getComposerText().length > 0) document.execCommand('delete');
    await sleep(40);
  }
}

/**
 * Envia a mensagem do composer. `humanDelay` (1500-4000ms) vale para envio automatizado;
 * mensagens que o próprio usuário digitou e mandou enviar usam um atraso curto.
 */
export async function sendComposer(humanDelay = true): Promise<boolean> {
  await sleep(humanDelay ? randomDelay() : 150);
  const btn = queryFirst<HTMLElement>('sendButton');
  if (btn) {
    (btn.closest('button') ?? btn).click();
    return true;
  }
  const box = getComposer();
  if (!box) return false;
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true } as const;
  box.dispatchEvent(new KeyboardEvent('keydown', opts));
  box.dispatchEvent(new KeyboardEvent('keypress', opts));
  box.dispatchEvent(new KeyboardEvent('keyup', opts));
  return true;
}

/** Preenche um <input> controlado pelo React: o setter do protótipo faz o React enxergar a mudança. */
function setInputValue(input: HTMLInputElement, text: string): void {
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Digita no campo de busca da lista de conversas (para abrir um contato que não está visível). */
export async function typeInSearch(text: string): Promise<boolean> {
  const box = queryFirst('searchBox');
  if (!box) return false;
  // versões novas do WhatsApp usam <input> na busca; as antigas, um contenteditable
  if (box instanceof HTMLInputElement) {
    setInputValue(box, text);
    return true;
  }
  placeCaretAtEnd(box);
  document.execCommand('selectAll');
  document.execCommand('delete');
  pasteText(box, text);
  return true;
}

/** Clique "de verdade": o WhatsApp reage a pointerdown/mousedown, não só ao click. */
export function realClick(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}

const visible = (el: Element) => el.getClientRects().length > 0;

/** Botão de enviar do editor de mídia (o do rodapé é o de texto e não serve). */
function mediaSendButton(): HTMLElement | null {
  for (const sel of MEDIA_SEND) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => !e.closest('footer') && visible(e));
    if (el) return (el.closest<HTMLElement>('button, [role="button"]') ?? el);
  }
  return null;
}

function mediaCaptionBox(): HTMLElement | null {
  for (const sel of MEDIA_CAPTION) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(visible);
    if (el) return el;
  }
  return null;
}

export type MediaResult = 'sent' | 'no-composer' | 'no-editor' | 'not-confirmed';

/**
 * Envia fotos pela conversa aberta: cola os arquivos no campo de mensagem (o WhatsApp abre o editor de mídia,
 * como quando você cola uma imagem), escreve a legenda e clica em enviar no editor. Só é chamado quando o
 * usuário clica em Enviar no CRM.
 */
export async function sendFiles(files: File[], caption: string): Promise<MediaResult> {
  const box = getComposer();
  if (!box) return 'no-composer';
  box.focus();
  const stale = mediaSendButton(); // algo parecido já na tela não é o editor que vamos abrir
  const data = new DataTransfer();
  files.forEach((f) => data.items.add(f));
  box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));

  let send: HTMLElement | null = null;
  for (let i = 0; i < 40 && !send; i++) {
    await sleep(150);
    const found = mediaSendButton();
    send = found && found !== stale ? found : null;
  }
  if (!send) return 'no-editor';

  if (caption) {
    const cap = mediaCaptionBox();
    if (cap) {
      placeCaretAtEnd(cap);
      pasteText(cap, caption);
      await sleep(120);
      if (!cap.innerText.trim()) document.execCommand('insertText', false, caption);
      await sleep(80);
    }
  }
  await sleep(250);
  realClick(mediaSendButton() ?? send);
  for (let i = 0; i < 30; i++) {
    await sleep(150);
    const still = mediaSendButton();
    if (!still || still === stale) return 'sent';
  }
  return 'not-confirmed';
}

/** Esvazia a busca da lista de conversas (depois de abrir um contato por ela). */
export async function clearSearch(): Promise<void> {
  const box = queryFirst('searchBox');
  if (!box) return;
  if (box instanceof HTMLInputElement) return setInputValue(box, '');
  placeCaretAtEnd(box);
  document.execCommand('selectAll');
  document.execCommand('delete');
}
