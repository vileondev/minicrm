import { STYLES } from '../components/styles';

const HOST_ID = 'wa-local-crm-host';

function isDark(): boolean {
  const cls = (el: Element | null) => !!el && /(^|\s)dark(\s|$)/.test(el.className?.toString() ?? '');
  if (cls(document.body) || cls(document.documentElement)) return true;
  const probe = document.querySelector('#app') ?? document.body;
  const m = getComputedStyle(probe).backgroundColor.match(/\d+/g);
  if (!m || m.length < 3) return false;
  const [r, g, b] = m.map(Number) as [number, number, number];
  return (r * 299 + g * 587 + b * 114) / 1000 < 90;
}

type ThemePref = 'auto' | 'light' | 'dark';
let preference: ThemePref = 'auto';
let syncTheme = () => undefined as void;

/** Tema escolhido no CRM. "auto" acompanha o WhatsApp; claro ou escuro valem mesmo que o WhatsApp esteja no outro. */
export function setThemePreference(pref: ThemePref): void {
  preference = pref;
  syncTheme();
}

export const currentTheme = (): 'light' | 'dark' => (preference === 'auto' ? (isDark() ? 'dark' : 'light') : preference);

/** Cria o host com Shadow Root (isola o CSS do WhatsApp) e acompanha o tema claro/escuro. */
export function mountShadowRoot(): ShadowRoot {
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.append(style);
  document.documentElement.append(host);

  const sync = () => host.setAttribute('data-theme', currentTheme());
  syncTheme = sync;
  sync();
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return root;
}
