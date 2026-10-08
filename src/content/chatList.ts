import type { Contact, Stage } from '../types';
import { queryAll } from '../utils/domSelectors';
import { clearSearch, realClick, sleep, typeInSearch } from '../utils/domHelpers';
import { looseName, normalizeName, tagColor } from '../utils/format';
import { state } from './state';

const BADGE_ATTR = 'data-wacrm-badges';

// o nome da conversa vem antes da prévia da última mensagem; prefere o span[title][dir=auto], que é o do nome
const rowTitle = (row: HTMLElement) => row.querySelector<HTMLElement>('span[title][dir="auto"]') ?? row.querySelector<HTMLElement>('span[title]');
const rowName = (row: HTMLElement) => rowTitle(row)?.getAttribute('title')?.trim() ?? '';

export function visibleChatNames(): string[] {
  return [...new Set(queryAll('chatListRows').map(rowName).filter(Boolean))];
}

function chip(text: string, bg: string): HTMLElement {
  const s = document.createElement('span');
  s.className = 'c';
  s.textContent = text;
  s.style.background = bg;
  return s;
}

function buildHost(c: Contact, stage: Stage | undefined): HTMLElement {
  const host = document.createElement('span');
  host.setAttribute(BADGE_ATTR, '');
  host.style.cssText = 'display:inline-flex;flex:none;margin-left:6px;vertical-align:middle;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = '.w{display:inline-flex;gap:3px;align-items:center;white-space:nowrap}.c{font:600 10px/1 system-ui,sans-serif;color:#fff;border-radius:8px;padding:2px 6px}';
  const wrap = document.createElement('span');
  wrap.className = 'w';
  if (stage) wrap.append(chip(stage.name, stage.color));
  c.tags.slice(0, 3).forEach((t) => wrap.append(chip(t, tagColor(t))));
  if (c.tags.length > 3) wrap.append(chip('+' + (c.tags.length - 3), '#667781'));
  root.append(style, wrap);
  return host;
}

/** Mostra etapa + tags ao lado do nome em cada conversa da lista. Idempotente (não gera novas mutações se nada mudou). */
export function refreshBadges(): void {
  const byName = new Map<string, Contact>();
  for (const c of state.contacts) if (c.stageId || c.tags.length) byName.set(normalizeName(c.name), c);
  const stages = new Map(state.stages.map((s) => [s.id, s]));

  for (const row of queryAll('chatListRows')) {
    const title = rowTitle(row);
    if (!title) continue;
    const existing = row.querySelector<HTMLElement>(`[${BADGE_ATTR}]`);
    const c = byName.get(normalizeName(rowName(row)));
    if (!c) {
      existing?.remove();
      continue;
    }
    const stage = c.stageId ? stages.get(c.stageId) : undefined;
    const sig = JSON.stringify([stage?.name, stage?.color, c.tags]);
    if (existing?.dataset.sig === sig && existing.previousElementSibling === title) continue;
    existing?.remove();
    const host = buildHost(c, stage);
    host.dataset.sig = sig;
    title.after(host);
  }
}

/** Linhas da lista de conversas e dos resultados da pesquisa (que nem sempre ficam dentro de #pane-side). */
const EXTRA_ROWS = ['#side [role="listitem"]', '#side [role="row"]', '#side [data-testid="cell-frame-container"]', '[aria-label*="esultados"] [role="listitem"]', '[aria-label*="esults"] [role="listitem"]'];

function allRows(): HTMLElement[] {
  const set = new Set<HTMLElement>(queryAll('chatListRows'));
  for (const sel of EXTRA_ROWS) document.querySelectorAll<HTMLElement>(sel).forEach((r) => set.add(r));
  return [...set].filter((r) => !r.closest('#wa-local-crm-host'));
}

/** Nomes possíveis de uma linha: todos os title e a primeira linha de texto (o nome nem sempre tem title). */
export function rowNames(row: HTMLElement): string[] {
  const titles = Array.from(row.querySelectorAll('[title]')).map((e) => e.getAttribute('title')?.trim() ?? '');
  const firstLine = row.innerText.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return [...new Set([rowName(row), ...titles, firstLine].filter(Boolean))];
}

function findRow(name: string): HTMLElement | undefined {
  const rows = allRows();
  const exact = normalizeName(name);
  const lo = looseName(name);
  return rows.find((r) => rowNames(r).some((n) => normalizeName(n) === exact))
    ?? (lo ? rows.find((r) => rowNames(r).some((n) => looseName(n) === lo)) : undefined);
}

/** Na busca por número o título é o nome salvo: aceita a linha que mostra os últimos dígitos ou o único resultado. */
function findRowByPhone(digits: string): HTMLElement | undefined {
  const rows = allRows();
  const tail = digits.slice(-8);
  return rows.find((r) => (r.textContent ?? '').replace(/\D/g, '').includes(tail)) ?? (rows.length === 1 ? rows[0] : undefined);
}

async function searchAndFind(text: string, find: () => HTMLElement | undefined): Promise<HTMLElement | undefined> {
  if (!(await typeInSearch(text))) return undefined;
  for (let i = 0; i < 10; i++) {
    await sleep(350);
    const row = find();
    if (row) return row;
  }
  return undefined;
}

export type OpenResult = 'opened' | 'not-found';

/**
 * Abre a conversa clicando na linha da lista. Se ela não estiver visível, pesquisa pelo nome e, para contatos
 * com telefone, pelo número. Limpa a pesquisa depois para a lista voltar ao normal.
 */
export async function openChat(name: string, key?: string): Promise<OpenResult> {
  let row = findRow(name);
  let searched = false;
  if (!row) {
    searched = true;
    row = await searchAndFind(name, () => findRow(name));
  }
  const digits = key && /^\d{8,}$/.test(key) ? key : null;
  if (!row && digits) row = await searchAndFind(digits, () => findRowByPhone(digits));
  if (row) realClick(rowTitle(row) ?? row);
  else console.warn('[WA CRM] conversa não encontrada', { name, rows: allRows().slice(0, 15).map(rowNames) });
  if (searched) window.setTimeout(() => void clearSearch(), 800);
  return row ? 'opened' : 'not-found';
}
