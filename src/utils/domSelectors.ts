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
  searchBox: [
    'div[contenteditable="true"][data-tab="3"]',
    '[role="search"] [contenteditable="true"]',
    '#side [contenteditable="true"]',
    '#side input[type="text"]',
    '[role="search"] input',
    'input[aria-label*="esquisar"]',
    'input[aria-label*="earch"]',
  ],
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
/**
 * Editor de mídia que o WhatsApp abre ao colar uma imagem no campo de mensagem: legenda e botão de enviar.
 * O botão de enviar do editor é o que NÃO está no rodapé da conversa (lá fica o envio de texto).
 */
export const MEDIA_CAPTION = ['[contenteditable="true"][aria-label*="legenda" i]', '[contenteditable="true"][aria-label*="caption" i]', '[contenteditable="true"][aria-placeholder*="legenda" i]'];
export const MEDIA_SEND = ['[role="button"][aria-label="Enviar"]', 'button[aria-label="Enviar"]', '[role="button"][aria-label="Send"]', 'button[aria-label="Send"]', '[data-icon="send"]', '[data-icon="wds-ic-send-filled"]'];

/** Ícones de status de entrega (relógio, um tique, dois tiques): só aparecem em mensagens enviadas por você. */
export const OUTGOING_MARKERS = '[data-icon^="msg-check"], [data-icon^="msg-dblcheck"], [data-icon^="msg-time"], [data-icon*="status-check"], [data-icon*="status-dblcheck"], [data-icon*="status-time"]';
/**
 * Marcadores de mídia dentro de uma linha de mensagem, na ordem de checagem (o primeiro que bater vale).
 * "foto" só conta imagens blob: com pelo menos 80px, para não pegar avatar, emoji ou miniatura de link.
 */
export const MEDIA_MARKERS: [string, string][] = [
  ['mensagem apagada', '[data-icon*="recalled"]'],
  ['figurinha', '[data-icon*="sticker"], img[alt*="igurinha"], img[alt*="ticker"]'],
  ['áudio', '[data-icon*="audio"], [data-icon*="ptt"], audio, [aria-label*="áudio" i], [aria-label*="voice message" i]'],
  ['vídeo', 'video, [data-icon*="video"], [data-icon*="media-play"]'],
  ['documento', '[data-icon*="document"], [data-icon*="doc-"], [data-icon*="pdf"]'],
  ['localização', '[data-icon*="location"], a[href*="maps.google"]'],
  ['contato', '[data-icon*="vcard"]'],
  ['foto', 'img[src^="blob:"]'],
];
/** Linha de participantes no cabeçalho de grupo: "Ana, Bruno, +55 11 9999-9999, Você". */
export const GROUP_SUBTITLE_PATTERN = /,\s*(voc[eê]|you)\s*$/i;
/** Textos de status que aparecem no cabeçalho sob o nome. */
export const HEADER_STATUS_PATTERN = /^(online|digitando|gravando|visto por último|clique para|click here|typing|last seen)/i;
