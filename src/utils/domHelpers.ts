import { queryFirst } from './domSelectors';

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

/** Esvazia a busca da lista de conversas (depois de abrir um contato por ela). */
export async function clearSearch(): Promise<void> {
  const box = queryFirst('searchBox');
  if (!box) return;
  if (box instanceof HTMLInputElement) return setInputValue(box, '');
  placeCaretAtEnd(box);
  document.execCommand('selectAll');
  document.execCommand('delete');
}
