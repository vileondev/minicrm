import type { Action, Automation, Trigger } from '../types';
import { saveAutomations } from '../storage/chromeStore';
import { describeAction, describeTrigger, presets } from '../content/automation';
import { state } from '../content/state';
import { h, toast, uid } from './h';
import { icon } from './icons';

/** Construtor de fluxos: Quando (gatilho) + Então (ações). Tudo local, nenhuma ação envia mensagem. */
interface Draft {
  name: string;
  trigger: Trigger;
  actions: Action[];
}

const TRIGGERS: { v: Trigger['type']; l: string }[] = [
  { v: 'message', l: 'Mensagem recebida contém' },
  { v: 'stage', l: 'Lead entra na etapa' },
  { v: 'tag', l: 'Tag é adicionada' },
  { v: 'stale', l: 'Lead parado na etapa há N dias' },
];

const ACTIONS: { v: Action['type']; l: string }[] = [
  { v: 'suggest', l: 'Sugerir resposta rápida' },
  { v: 'stage', l: 'Mover para etapa' },
  { v: 'addTag', l: 'Adicionar tag' },
  { v: 'removeTag', l: 'Remover tag' },
  { v: 'task', l: 'Criar tarefa' },
  { v: 'note', l: 'Adicionar nota' },
  { v: 'notify', l: 'Mostrar aviso' },
];

let draft: Draft | null = null;
let newAction: Action | null = null;

const firstStage = () => state.stages[0]?.id ?? '';

function defaultTrigger(type: Trigger['type']): Trigger {
  switch (type) {
    case 'message': return { type, keywords: '' };
    case 'stage': return { type, stageId: firstStage() };
    case 'tag': return { type, tag: '' };
    case 'stale': return { type, stageId: firstStage(), days: 3 };
  }
}

function defaultAction(type: Action['type']): Action {
  switch (type) {
    case 'suggest': return { type, replyId: state.quickReplies[0]?.id ?? '' };
    case 'stage': return { type, stageId: firstStage() };
    case 'addTag': return { type, tag: '' };
    case 'removeTag': return { type, tag: '' };
    case 'task': return { type, text: '', dueDays: 1 };
    case 'note': return { type, text: '' };
    case 'notify': return { type, text: '' };
  }
}

const field = (id: string, label: string) => h('label', { class: 'field', for: id }, label);

function stageSelect(id: string, value: string, onChange: (v: string) => void) {
  return h('select', { id, on: { change: (e) => onChange((e.target as HTMLSelectElement).value) } },
    ...state.stages.map((s) => h('option', { value: s.id, selected: s.id === value }, s.name)));
}

function textInput(id: string, value: string, placeholder: string, onChange: (v: string) => void, type = 'text') {
  return h('input', { id, type, value, placeholder, on: { input: (e) => onChange((e.target as HTMLInputElement).value) } });
}

function triggerEditor(d: Draft): Node[] {
  const t = d.trigger;
  switch (t.type) {
    case 'message':
      return [field('fl-kw', 'Palavras-chave, separadas por vírgula (vazio = qualquer mensagem)'), textInput('fl-kw', t.keywords, 'preço, valor, orçamento', (v) => { t.keywords = v; })];
    case 'stage':
      return [field('fl-st', 'Etapa'), stageSelect('fl-st', t.stageId, (v) => { t.stageId = v; })];
    case 'tag':
      return [field('fl-tg', 'Tag'), textInput('fl-tg', t.tag, 'interessado', (v) => { t.tag = v.trim(); })];
    case 'stale':
      return [field('fl-st', 'Etapa'), stageSelect('fl-st', t.stageId, (v) => { t.stageId = v; }),
        field('fl-dy', 'Dias parado'), textInput('fl-dy', String(t.days), '3', (v) => { t.days = Math.max(1, Number(v) || 1); }, 'number')];
  }
}

function actionEditor(a: Action): Node[] {
  switch (a.type) {
    case 'suggest':
      return [field('fa-qr', 'Resposta rápida'), h('select', { id: 'fa-qr', on: { change: (e) => { a.replyId = (e.target as HTMLSelectElement).value; } } },
        ...state.quickReplies.map((q) => h('option', { value: q.id, selected: q.id === a.replyId }, '/' + q.shortcut + ' ' + q.title)))];
    case 'stage':
      return [field('fa-st', 'Etapa'), stageSelect('fa-st', a.stageId, (v) => { a.stageId = v; })];
    case 'addTag':
    case 'removeTag':
      return [field('fa-tg', 'Tag'), textInput('fa-tg', a.tag, 'quente', (v) => { a.tag = v.trim(); })];
    case 'task':
      return [field('fa-tx', 'Texto da tarefa (aceita {nome})'), textInput('fa-tx', a.text, 'Ligar para {nome}', (v) => { a.text = v; }),
        field('fa-dy', 'Vence em quantos dias'), textInput('fa-dy', String(a.dueDays), '1', (v) => { a.dueDays = Math.max(0, Number(v) || 0); }, 'number')];
    case 'note':
    case 'notify':
      return [field('fa-tx', 'Texto (aceita {nome} e {data})'), textInput('fa-tx', a.text, '', (v) => { a.text = v; })];
  }
}

export function flowsView(root: ShadowRoot, refresh: () => void): Node[] {
  const nodes: Node[] = [];
  const list = state.automations;

  /* ---- lista ---- */
  nodes.push(h('div', { class: 'sec' }, h('h4', {}, 'Fluxos ativos'),
    ...(list.length ? list.map((a) => h('div', { class: 'flow' },
      h('div', { class: 'row', style: 'padding-top:0' },
        h('label', {}, h('input', { type: 'checkbox', checked: a.enabled, on: { change: () => void saveAutomations(list.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x))) } }), h('b', {}, a.name)),
        h('button', { class: 'x danger', title: 'Excluir fluxo', 'aria-label': 'Excluir fluxo', on: { click: () => { if (confirm(`Excluir o fluxo "${a.name}"?`)) void saveAutomations(list.filter((x) => x.id !== a.id)); } } }, icon('trash', 14))),
      h('div', { class: 'muted' }, 'Quando: ' + describeTrigger(a.trigger)),
      h('div', { class: 'muted' }, 'Então: ' + a.actions.map(describeAction).join('; ')),
    )) : [h('div', { class: 'empty' }, 'Nenhum fluxo ainda.', 'Use um modelo abaixo ou crie o seu.')])));

  /* ---- modelos ---- */
  const ps = presets();
  if (ps.length) {
    nodes.push(h('div', { class: 'sec' }, h('h4', {}, 'Modelos prontos'),
      ...ps.map((p) => h('div', { class: 'row' }, h('span', {}, p.name),
        h('button', { class: 'btn ghost sm', on: { click: () => { void saveAutomations([...list, p.build()]); toast(root, 'Fluxo adicionado.'); } } }, icon('plus', 14), 'Usar')))));
  }

  /* ---- construtor ---- */
  if (!draft) {
    nodes.push(h('button', { class: 'btn', on: { click: () => { draft = { name: '', trigger: defaultTrigger('message'), actions: [] }; newAction = defaultAction('addTag'); refresh(); } } }, icon('plus'), 'Novo fluxo'));
    return nodes;
  }

  const d = draft;
  const na = newAction ?? defaultAction('addTag');
  newAction = na;

  const trigSel = h('select', { id: 'fl-tp', on: { change: (e) => { d.trigger = defaultTrigger((e.target as HTMLSelectElement).value as Trigger['type']); refresh(); } } },
    ...TRIGGERS.map((t) => h('option', { value: t.v, selected: t.v === d.trigger.type }, t.l)));
  const actSel = h('select', { id: 'fa-tp', on: { change: (e) => { newAction = defaultAction((e.target as HTMLSelectElement).value as Action['type']); refresh(); } } },
    ...ACTIONS.map((t) => h('option', { value: t.v, selected: t.v === na.type }, t.l)));

  const validTrigger = (): boolean => {
    const t = d.trigger;
    if (t.type === 'tag') return !!t.tag;
    if (t.type === 'stage' || t.type === 'stale') return state.stages.some((s) => s.id === t.stageId);
    return true;
  };
  const validAction = (a: Action): boolean => {
    if (a.type === 'suggest') return state.quickReplies.some((q) => q.id === a.replyId);
    if (a.type === 'stage') return state.stages.some((s) => s.id === a.stageId);
    if (a.type === 'addTag' || a.type === 'removeTag') return !!a.tag;
    return !!a.text.trim();
  };

  nodes.push(h('div', { class: 'sec flow-builder' }, h('h4', {}, 'Novo fluxo'),
    field('fl-nm', 'Nome do fluxo'), textInput('fl-nm', d.name, 'Ex.: Follow-up de orçamento', (v) => { d.name = v; }),
    h('div', { class: 'step' }, h('b', {}, 'Quando'), field('fl-tp', 'Gatilho'), trigSel, ...triggerEditor(d)),
    h('div', { class: 'step' }, h('b', {}, 'Então'),
      ...d.actions.map((a, i) => h('div', { class: 'row' }, h('span', {}, describeAction(a)),
        h('button', { class: 'x', title: 'Remover ação', 'aria-label': 'Remover ação', on: { click: () => { d.actions.splice(i, 1); refresh(); } } }, icon('x', 12)))),
      field('fa-tp', 'Adicionar ação'), actSel, ...actionEditor(na),
      h('button', { class: 'btn ghost sm', on: { click: () => {
        if (!validAction(na)) return toast(root, 'Preencha os dados da ação.');
        d.actions.push({ ...na });
        newAction = defaultAction(na.type);
        refresh();
      } } }, icon('plus', 14), 'Adicionar ação')),
    h('div', { class: 'inline', style: 'margin-top:10px' },
      h('button', { class: 'btn', on: { click: async () => {
        if (!validTrigger()) return toast(root, 'Preencha o gatilho.');
        if (!d.actions.length) return toast(root, 'Adicione pelo menos uma ação.');
        const flow: Automation = { id: uid(), name: d.name.trim() || describeTrigger(d.trigger), enabled: true, trigger: d.trigger, actions: d.actions };
        draft = null;
        newAction = null;
        await saveAutomations([...list, flow]);
        toast(root, 'Fluxo salvo.');
      } } }, 'Salvar fluxo'),
      h('button', { class: 'btn ghost', on: { click: () => { draft = null; newAction = null; refresh(); } } }, 'Cancelar'))));
  return nodes;
}
