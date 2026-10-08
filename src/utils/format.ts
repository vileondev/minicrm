import type { ChatContext } from '../types';

export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export const tagHue = (tag: string) => hashHue(tag.toLowerCase());
export const tagColor =(tag: string) => `hsl(${hashHue(tag.toLowerCase())} 62% 42%)`;
export const avatarColor = (name: string) => `hsl(${hashHue(name)} 45% 42%)`;
// primeira letra/dígito de cada palavra: p[0] partiria emojis ao meio ("Lucas 🚀" virava "L\uD83D")
export const initials = (name: string) =>
  name.split(/\s+/).map((p) => Array.from(p).find((ch) => /[\p{L}\p{N}]/u.test(ch))).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

export const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const todayStr = (): string => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local

export const addDays = (n: number): string => new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE');

export function greeting(): string {
  const hr = new Date().getHours();
  return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Variáveis das respostas rápidas. */
export function applyVars(text: string, chat: ChatContext | null): string {
  const name = chat && !chat.byName && /^\+?[\d\s().-]+$/.test(chat.name) ? '' : chat?.name ?? '';
  const first = name.split(/\s+/)[0] ?? '';
  const values: Record<string, string> = {
    nome: name || 'cliente',
    primeironome: first || 'tudo bem',
    saudacao: greeting(),
    data: new Date().toLocaleDateString('pt-BR'),
  };
  // aceita {nome}, {{nome}}, (nome) e [nome]; com ou sem acento e underscore
  return text.replace(/(?:\{\{?|\(|\[)\s*(nome|primeiro[_ ]?nome|sauda[cç][aã]o|data)\s*(?:\}\}?|\)|\])/gi, (_m, k: string) =>
    values[k.toLowerCase().replace(/[_ ]/g, '').replace('ç', 'c').replace('ã', 'a')] ?? _m);
}

export const normalizeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
