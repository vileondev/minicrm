/**
 * Registro centralizado de seletores. O WhatsApp muda o DOM com frequência:
 * cada alvo tem uma lista de candidatos, do mais estável (aria/data) ao mais frágil.
 * Evite classes ofuscadas.
 */
export const SELECTORS = {
  composer: [
    'footer [contenteditable="true"][role="textbox"]',
    'footer [contenteditable="true"]',
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][role="textbox"]:not([data-tab="3"])',
  ],
  searchBox: ['div[contenteditable="true"][data-tab="3"]', '[role="search"] [contenteditable="true"]', '#side [contenteditable="true"]'],
  sendButton: ['footer button[aria-label="Enviar"]', 'footer button[aria-label="Send"]', 'footer span[data-icon="send"]', 'footer [data-icon="wds-ic-send-filled"]'],
  chatListRows: [
    '#pane-side [role="listitem"]',
    '#pane-side [role="row"]',
    '#pane-side [data-testid="cell-frame-container"]',
    '[aria-label="Lista de conversas"] [role="listitem"]',
    '[aria-label="Chat list"] [role="listitem"]',
  ],
  messageText: ['span.selectable-text', '.copyable-text span', 'span[dir="ltr"]'],
} as const;

export type SelectorKey = keyof typeof SELECTORS;

export function queryFirst<T extends Element = HTMLElement>(key: SelectorKey, root: ParentNode = document): T | null {
  for (const sel of SELECTORS[key]) {
    const el = root.querySelector<T>(sel);
    if (el) return el;
  }
  return null;
}

export function queryAll<T extends Element = HTMLElement>(key: SelectorKey, root: ParentNode = document): T[] {
  for (const sel of SELECTORS[key]) {
    const found = Array.from(root.querySelectorAll<T>(sel));
    if (found.length) return found;
  }
  return [];
}

/** Fallback por padrão de texto: telefone exibido no título (ex.: "+55 11 99999-9999"). */
export const PHONE_TEXT_PATTERN = /^\+?\d[\d\s().-]{7,}$/;
/** data-id de mensagens: "false_5511999999999@c.us_3EB0…", "…@g.us" (grupo), "…@lid". */
export const MESSAGE_ID_PATTERN = /^(true|false)_(\d+)@(c\.us|g\.us|lid)/;
/** Textos de status que aparecem no cabeçalho sob o nome. */
export const HEADER_STATUS_PATTERN = /^(online|digitando|gravando|visto por último|clique para|click here|typing|last seen)/i;
