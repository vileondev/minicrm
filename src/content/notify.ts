import { getNotified, saveNotified } from '../storage/chromeStore';
import { todayStr } from '../utils/format';
import { state } from './state';

interface Alert {
  taskId: string;
  key: string; // chave do lead
  title: string;
  message: string;
  mark: string; // o que fica gravado para não repetir
}

/** Mais que isso de uma vez vira um aviso só, com o total (evita uma enxurrada na primeira verificação). */
const MAX_SEPARATE = 3;

/**
 * Avisos do sistema para tarefas: "vence hoje" uma vez por dia e "atrasada" uma vez por tarefa.
 * Roda na aba do WhatsApp (o IndexedDB do CRM é desta página); o service worker só mostra o aviso.
 */
export async function checkTaskAlerts(): Promise<void> {
  if (!state.view.notifyTasks) return;
  const today = todayStr();
  const notified = await getNotified();
  const alerts: Alert[] = [];
  for (const c of state.contacts) {
    if (c.internal) continue;
    for (const t of c.tasks) {
      if (t.done || !t.due || t.due > today) continue;
      const late = t.due < today;
      const mark = late ? 'atrasada' : `${today}|hoje`;
      if (notified[t.id] === mark) continue;
      alerts.push({ taskId: t.id, key: c.phone, mark,
        title: late ? `Tarefa atrasada: ${c.name}` : `Tarefa para hoje: ${c.name}`,
        message: t.text });
    }
  }
  if (!alerts.length) return;

  if (alerts.length > MAX_SEPARATE) {
    const late = alerts.filter((a) => a.mark === 'atrasada').length;
    const parts = [late ? `${late} atrasada${late > 1 ? 's' : ''}` : '', alerts.length - late ? `${alerts.length - late} para hoje` : ''].filter(Boolean);
    await chrome.runtime.sendMessage({ type: 'wacrm-notify', id: 'tasks', title: `${alerts.length} tarefas pedem atenção`, message: parts.join(' e ') + '. Clique para ver a lista.' });
  } else {
    for (const a of alerts) await chrome.runtime.sendMessage({ type: 'wacrm-notify', id: `lead|${encodeURIComponent(a.key)}|${a.taskId}`, title: a.title, message: a.message });
  }
  for (const a of alerts) notified[a.taskId] = a.mark;
  // limpa marcas de tarefas que não existem mais
  const live = new Set(state.contacts.flatMap((c) => c.tasks.map((t) => t.id)));
  for (const id of Object.keys(notified)) if (!live.has(id)) delete notified[id];
  await saveNotified(notified);
}
