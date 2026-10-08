import type { Contact, Stage } from '../types';
import { state } from './state';

const DAY = 86400000;
export const DAY_MS = DAY;

export const sortedStages = (): Stage[] => state.stages.slice().sort((a, b) => a.order - b.order);

/** Chance de fechar a partir da etapa. Sem valor definido: cresce em linha até 100% na última etapa. */
export function stageProbability(stage: Stage): number {
  if (typeof stage.probability === 'number') return Math.max(0, Math.min(100, stage.probability));
  const list = sortedStages();
  const i = list.findIndex((s) => s.id === stage.id);
  return Math.round(((i + 1) / Math.max(1, list.length)) * 100);
}

/** Valor × chance. Lead sem etapa usa a nota da IA (0-100) como chance, se houver. */
export function weightedValue(c: Contact): number {
  if (!c.value) return 0;
  const stage = c.stageId ? state.stages.find((s) => s.id === c.stageId) : undefined;
  const p = stage ? stageProbability(stage) : c.score ?? 0;
  return (c.value * p) / 100;
}

export const isGroupContact = (c: Contact) => !!c.isGroup || c.phone.startsWith('g');

/** Leads que entram no funil, nas métricas e no relatório, conforme "Mostrar grupos/internos". */
export const inFunnel = (c: Contact) =>
  (state.view.showInternal || !c.internal) && !(state.view.hideGroups && isGroupContact(c));

export interface StageStats {
  stage: Stage;
  current: number;
  entered: number; // leads que passaram pela etapa em algum momento
  advanced: number; // desses, quantos chegaram a uma etapa posterior
  avgDays: number | null; // permanência média (inclui quem ainda está nela)
  value: number;
  weighted: number;
}

export function funnelStats(contacts: Contact[]): StageStats[] {
  const stages = sortedStages();
  const order = new Map(stages.map((s, i) => [s.id, i]));
  const now = Date.now();
  return stages.map((stage, idx) => {
    let entered = 0, advanced = 0, stays = 0, total = 0;
    for (const c of contacts) {
      const hist = c.stageHistory ?? [];
      const first = hist.findIndex((e) => e.stageId === stage.id);
      if (first < 0) continue;
      entered++;
      if (hist.slice(first + 1).some((e) => e.stageId && (order.get(e.stageId) ?? -1) > idx)) advanced++;
      hist.forEach((e, i) => {
        if (e.stageId !== stage.id) return;
        total += (hist[i + 1]?.at ?? now) - e.at;
        stays++;
      });
    }
    const mine = contacts.filter((c) => c.stageId === stage.id);
    return {
      stage,
      current: mine.length,
      entered,
      advanced,
      avgDays: stays ? total / stays / DAY : null,
      value: mine.reduce((a, c) => a + c.value, 0),
      weighted: mine.reduce((a, c) => a + weightedValue(c), 0),
    };
  });
}

export interface PeriodStats {
  newLeads: number;
  advanced: number; // leads que foram para uma etapa mais à frente
  won: number; // leads que chegaram à última etapa
  wonValue: number;
  tasksDone: number;
  timeToClose: number | null; // ms, da entrada no CRM até a última etapa
}

/** Números do painel para um intervalo [from, to). Usa o histórico de etapas e as datas de conclusão das tarefas. */
export function periodStats(contacts: Contact[], from: number, to: number): PeriodStats {
  const stages = sortedStages();
  const order = new Map(stages.map((s, i) => [s.id, i]));
  const lastId = stages[stages.length - 1]?.id;
  const inRange = (t: number | undefined) => t !== undefined && t >= from && t < to;
  let newLeads = 0, advanced = 0, won = 0, wonValue = 0, tasksDone = 0, closeSum = 0;
  for (const c of contacts) {
    if (inRange(c.createdAt)) newLeads++;
    const hist = c.stageHistory ?? [];
    let moved = false;
    let wonAt: number | undefined;
    hist.forEach((e, i) => {
      if (!inRange(e.at) || i === 0) return;
      const before = hist[i - 1]!.stageId;
      const a = before ? order.get(before) ?? -1 : -1;
      const b = e.stageId ? order.get(e.stageId) ?? -1 : -1;
      if (b > a) moved = true;
      if (e.stageId === lastId) wonAt = e.at;
    });
    if (moved) advanced++;
    if (wonAt !== undefined) { won++; wonValue += c.value; closeSum += wonAt - c.createdAt; }
    tasksDone += c.tasks.filter((t) => t.done && inRange(t.doneAt)).length;
  }
  return { newLeads, advanced, won, wonValue, tasksDone, timeToClose: won ? closeSum / won : null };
}
