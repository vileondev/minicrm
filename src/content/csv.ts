import type { Contact } from '../types';
import { blankContact, putContact } from '../storage/db';
import { emitDataChange } from '../storage/bus';
import { looseName, normalizeName, slug } from '../utils/format';
import { state } from './state';

/** Lê CSV com ; ou , (o que aparecer mais na primeira linha), aspas e quebras de linha dentro de aspas. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/** Telefone brasileiro sem DDI ("(81) 97000-1111", 10 ou 11 dígitos) ganha o 55, como o WhatsApp identifica. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return (d.length === 10 || d.length === 11) && !d.startsWith('55') ? '55' + d : d;
}

/** "R$ 1.890,50" -> 1890.5 */
export function parseMoney(raw: string): number {
  let s = raw.replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, ''); // "4.200" e "1.250.000": ponto de milhar
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

type Column = 'name' | 'phone' | 'key' | 'stage' | 'tags' | 'value' | 'note' | 'internal' | `field:${string}` | 'ignore';

const ALIASES: [Column, RegExp][] = [
  ['name', /^(nome|name|contato|cliente|lead)$/],
  ['phone', /^(telefone|phone|celular|whatsapp|numero|fone)$/],
  ['key', /^(chave|chave telefone)$/],
  ['stage', /^(etapa|stage|fase|status do funil)$/],
  ['tags', /^(tags|etiquetas|tag|etiqueta)$/],
  ['value', /^(valor|value|valor do negocio)$/],
  ['note', /^(nota|notas|observacao|observacoes|ultima nota|obs)$/],
  ['internal', /^(interno)$/],
  ['ignore', /^(valor ponderado|tarefas abertas|produtos)$/],
];

function columnFor(header: string): Column | null {
  const n = normalizeName(header).replace(/[^a-z0-9 ]/g, '').trim();
  for (const [col, re] of ALIASES) if (re.test(n)) return col;
  const field = state.fields.find((f) => slug(f.name) === slug(header));
  return field ? `field:${field.id}` : null;
}

export interface ImportRow {
  key: string;
  name: string;
  phone: string;
  stageId: string | null | undefined; // undefined = coluna ausente ou etapa não reconhecida
  stageName: string;
  tags: string[];
  value: number;
  note: string;
  internal: boolean;
  fields: Record<string, string>;
  existing?: Contact;
}

export interface ImportPlan {
  rows: ImportRow[];
  skipped: number; // linhas sem nome nem telefone
  recognized: string[];
  unknown: string[];
  unknownStages: string[];
}

/** Monta a prévia: nada é gravado aqui. */
export function planImport(text: string): ImportPlan {
  const [header, ...lines] = parseCsv(text);
  if (!header) throw new Error('O arquivo está vazio.');
  const cols = header.map(columnFor);
  if (!cols.includes('name') && !cols.includes('phone')) throw new Error('Não achei uma coluna "Nome" ou "Telefone" na primeira linha.');
  const stageByName = new Map(state.stages.map((s) => [looseName(s.name), s.id]));
  const unknownStages = new Set<string>();
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const line of lines) {
    const get = (c: Column) => { const i = cols.indexOf(c); return i >= 0 ? line[i] ?? '' : ''; };
    const name = get('name');
    const phone = normalizePhone(get('phone'));
    if (!name && phone.length < 8) { skipped++; continue; }
    const keyCol = get('key');
    const key = phone.length >= 8 ? phone : keyCol || 'name_' + normalizeName(name);
    const stageName = get('stage');
    let stageId: string | null | undefined;
    if (cols.includes('stage')) {
      if (!stageName || /^sem etapa$/i.test(stageName)) stageId = null;
      else {
        stageId = stageByName.get(looseName(stageName));
        if (stageId === undefined) unknownStages.add(stageName);
      }
    }
    const fields: Record<string, string> = {};
    cols.forEach((c, i) => { if (c?.startsWith('field:') && line[i]) fields[c.slice(6)] = line[i]!; });
    rows.push({
      key, name: name || '+' + phone, phone, stageId, stageName,
      tags: get('tags').split(/[,|]/).map((t) => t.trim()).filter(Boolean),
      value: parseMoney(get('value')),
      note: get('note'),
      internal: /^(sim|s|yes|true|1)$/i.test(get('internal')),
      fields,
      existing: state.contacts.find((c) => c.phone === key || (phone.length >= 8 && c.number === phone) || (!!name && looseName(c.name) === looseName(name))),
    });
  }
  return {
    rows, skipped, unknownStages: [...unknownStages],
    recognized: header.filter((_, i) => cols[i] && cols[i] !== 'ignore'),
    unknown: header.filter((_, i) => !cols[i]),
  };
}

/** Grava a prévia: cria os novos e completa os existentes (nunca apaga o que já estava preenchido). */
export async function applyImport(plan: ImportPlan): Promise<{ created: number; updated: number }> {
  let created = 0, updated = 0;
  for (const r of plan.rows) {
    const c: Contact = r.existing ? { ...r.existing } : blankContact(r.key, r.name);
    if (r.existing) updated++; else created++;
    if (r.phone.length >= 8) c.number ??= r.phone;
    if (r.stageId !== undefined) c.stageId = r.stageId;
    c.tags = [...new Set([...c.tags, ...r.tags])];
    if (r.value && !c.items?.length) c.value = r.value;
    if (r.note && !c.notes.some((n) => n.text === r.note)) c.notes = [{ id: crypto.randomUUID(), text: r.note, createdAt: Date.now() }, ...c.notes];
    if (r.internal) c.internal = true;
    if (Object.keys(r.fields).length) c.fields = { ...(c.fields ?? {}), ...r.fields };
    await putContact(c, true);
  }
  emitDataChange();
  return { created, updated };
}
