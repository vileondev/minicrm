type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> };

/** Mini hyperscript: usa textContent (nunca innerHTML) para evitar XSS com dados do usuário/WhatsApp. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
    else if (k === 'style') el.setAttribute('style', String(v));
    else {
      try {
        if (!(k in el)) throw new Error('attr');
        (el as unknown as Record<string, unknown>)[k] = v;
      } catch {
        el.setAttribute(k, String(v)); // propriedades somente leitura (ex.: input.list) e atributos desconhecidos
      }
    }
  }
  // estados vazios são flex em coluna: cada frase vira um item, senão textos vizinhos se colam ("etapa.Arraste")
  const wrapText = /(^|\s)empty(\s|$)/.test(el.className);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    const node = typeof c === 'number' ? String(c) : c;
    el.append(wrapText && typeof node === 'string' ? h('span', {}, node) : node);
  }
  return el;
}

export const uid = () => crypto.randomUUID();

const NOT_TYPING = /^(checkbox|radio|button|submit|reset|color|file|range|date)$/;

/**
 * Pode redesenhar `container` sem atrapalhar quem está digitando? Só segura o redesenho um campo de texto focado
 * com algo escrito. Botões, caixas de marcar e campos vazios não seguram (antes qualquer foco no painel
 * segurava, e um clique num botão só aparecia ao trocar de página). `restore` devolve o foco ao mesmo campo.
 */
export function focusGuard(container: HTMLElement, root: ShadowRoot): { blocked: boolean; restore: () => void } {
  const el = root.activeElement as HTMLElement | null;
  const none = { blocked: false, restore: () => undefined };
  if (!el || !container.contains(el)) return none;
  const typing = el instanceof HTMLTextAreaElement || el.isContentEditable || (el instanceof HTMLInputElement && !NOT_TYPING.test(el.type));
  const value = (el as HTMLInputElement).value ?? el.textContent ?? '';
  if (typing && value.trim()) return { blocked: true, restore: () => undefined };
  const id = el.id;
  return { blocked: false, restore: () => { if (id) container.querySelector<HTMLElement>('#' + CSS.escape(id))?.focus(); } };
}

/** Mensagem de erro de um campo: aparece abaixo dele e é lida por leitores de tela. */
export function fieldError(): { el: HTMLElement; show(input: HTMLElement, msg: string): void; clear(input?: HTMLElement): void } {
  const el = h('p', { class: 'field-err hidden', role: 'alert' });
  return {
    el,
    show(input, msg) { el.textContent = msg; el.classList.remove('hidden'); input.setAttribute('aria-invalid', 'true'); input.focus(); },
    clear(input) { el.classList.add('hidden'); input?.removeAttribute('aria-invalid'); },
  };
}

/**
 * Devolve o foco ao campo de mensagem do CRM depois de enviar. Para enviar, o texto passa pelo campo do WhatsApp
 * (escondido), que fica com o foco, e o WhatsApp ainda o puxa de volta logo depois do envio: por isso a segunda
 * tentativa. Ela só age se o foco saiu do CRM; se você clicou em outra coisa do CRM, fica onde você clicou.
 */
export function refocus(root: ShadowRoot, el: HTMLElement): void {
  el.focus();
  for (const ms of [150, 450]) {
    window.setTimeout(() => { if (el.isConnected && document.activeElement !== root.host) el.focus(); }, ms);
  }
}

export function toast(root: ShadowRoot, msg: string): void {
  const t = h('div', { class: 'msg' }, msg);
  root.append(t);
  setTimeout(() => t.remove(), 3500);
}
