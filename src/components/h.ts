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
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

export const uid = () => crypto.randomUUID();

export function toast(root: ShadowRoot, msg: string): void {
  const t = h('div', { class: 'msg' }, msg);
  root.append(t);
  setTimeout(() => t.remove(), 3500);
}
