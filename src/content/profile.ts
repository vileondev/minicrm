import { PHONE_TEXT_PATTERN } from '../utils/domSelectors';
import { sanitizePhone, sleep } from '../utils/domHelpers';
import { conversationRoot } from './observer';

/** Botão do cabeçalho que abre "Dados do contato", do mais específico ao mais genérico (testados em ordem). */
const PROFILE_TRIGGER = ['header [title="Dados do perfil"]', 'header [title="Profile details"]', 'header [title*="dados do contato" i]', 'header [title*="contact info" i]', 'header [role="button"]'];
const CLOSE_BUTTON = ['[aria-label="Fechar"]', '[aria-label="Close"]', '[data-icon="x"]', '[data-icon="close"]', '[data-icon*="ic-close"]'];

const first = (scope: ParentNode, sels: string[]) => {
  for (const sel of sels) {
    const el = scope.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
};

/** Textos com cara de telefone ("+55 87 9644-3771") visíveis na página, fora da extensão. */
function phoneTexts(): Map<Text, string> {
  const found = new Map<Text, string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const t = n.data.trim();
    if (t.startsWith('+') && PHONE_TEXT_PATTERN.test(t)) found.set(n, t);
  }
  return found;
}

/**
 * Abre "Dados do contato" da conversa atual, lê o telefone que aparece ali e fecha o painel.
 * O WhatsApp não põe mais o número nas mensagens; o painel de perfil é o único lugar onde ele aparece para
 * contatos salvos. Compara os telefones visíveis antes e depois de abrir, para não pegar um número da lista.
 */
export async function readNumberFromProfile(): Promise<string | null> {
  const root = conversationRoot();
  const trigger = root && first(root, PROFILE_TRIGGER);
  if (!trigger) return null;
  const before = phoneTexts();
  trigger.click();

  let number: string | null = null;
  let drawer: HTMLElement | null = null;
  for (let i = 0; i < 20 && !number; i++) {
    await sleep(150);
    for (const [node, text] of phoneTexts()) {
      if (before.has(node)) continue;
      number = sanitizePhone(text);
      drawer = node.parentElement?.closest<HTMLElement>('section, [role="dialog"], aside') ?? null;
      break;
    }
  }

  // fecha o painel: botão de fechar dentro dele ou Esc. Sem número, não manda Esc: sem painel aberto ele fecharia a conversa
  const close = drawer && first(drawer, CLOSE_BUTTON);
  if (close) (close.closest('button, [role="button"]') as HTMLElement | null ?? close).click();
  else if (number) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  return number && number.length >= 8 ? number : null;
}
