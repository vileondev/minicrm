import type { Contact, Stage } from '../types';
import { queryAll } from '../utils/domSelectors';
import { sleep, typeInSearch } from '../utils/domHelpers';
import { normalizeName, tagColor } from '../utils/format';
import { state } from './state';

const BADGE_ATTR = 'data-wacrm-badges';

const rowTitle = (row: HTMLElement) => row.querySelector<HTMLElement>('span[title]');
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

function findRow(name: string): HTMLElement | undefined {
  const target = normalizeName(name);
  return queryAll('chatListRows').find((r) => normalizeName(rowName(r)) === target);
}

/** Abre a conversa clicando na linha da lista; se não estiver visível, pesquisa pelo nome. */
export async function openChatByName(name: string): Promise<boolean> {
  let row = findRow(name);
  if (!row && (await typeInSearch(name))) {
    for (let i = 0; i < 6 && !row; i++) {
      await sleep(400);
      row = findRow(name);
    }
  }
  const el = row && rowTitle(row);
  if (!el) return false;
  el.click();
  return true;
}
