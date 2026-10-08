import type { FieldDef, QuickReply } from '../types';
import { getQuickReplies, getTagColors, saveAutomations, saveFields, saveQuickReplies, saveTagColors, saveViewPrefs } from '../storage/chromeStore';
import { putContact } from '../storage/db';
import { emitDataChange } from '../storage/bus';
import { exportBackup, importBackup } from '../storage/backup';
import { collectDiagnostics } from '../content/diagnostics';
import { state } from '../content/state';
import { slug, tagHue, todayStr } from '../utils/format';
import { aiView } from './AiPanel';
import { flowsView } from './Flows';
import { icon, type IconName } from './icons';
import { h, toast, uid } from './h';

export type SettingsSection = 'tags' | 'fields' | 'replies' | 'flows' | 'ai' | 'data';

export const SETTINGS_MENU: [SettingsSection, string, IconName][] = [
  ['tags', 'Etiquetas', 'tag'],
  ['fields', 'Campos personalizados', 'textbox'],
  ['replies', 'Respostas rápidas', 'lightning'],
  ['flows', 'Fluxos de automação', 'flows'],
  ['ai', 'Assistente de IA', 'robot'],
  ['data', 'Dados e backup', 'database'],
];

/** Matizes oferecidos para etiquetas: espalhados no círculo para continuarem distinguíveis entre si. */
const HUES = [150, 190, 215, 250, 290, 330, 5, 30, 45];

/* ---------- etiquetas ---------- */

async function renameTag(from: string, to: string): Promise<void> {
  for (const c of state.contacts.filter((x) => x.tags.includes(from))) {
    c.tags = [...new Set(c.tags.map((t) => (t === from ? to : t)))];
    await putContact(c, true);
  }
  // fluxos que usam a etiqueta acompanham o novo nome
  await saveAutomations(state.automations.map((a) => ({
    ...a,
    trigger: a.trigger.type === 'tag' && a.trigger.tag === from ? { ...a.trigger, tag: to } : a.trigger,
    actions: a.actions.map((x) => ((x.type === 'addTag' || x.type === 'removeTag') && x.tag === from ? { ...x, tag: to } : x)),
  })));
  const colors = await getTagColors();
  const hue = colors[from.toLowerCase()];
  if (hue !== undefined) { delete colors[from.toLowerCase()]; colors[to.toLowerCase()] ??= hue; await saveTagColors(colors); }
  emitDataChange();
}

async function deleteTag(tag: string): Promise<void> {
  for (const c of state.contacts.filter((x) => x.tags.includes(tag))) {
    c.tags = c.tags.filter((t) => t !== tag);
    await putContact(c, true);
  }
  const colors = await getTagColors();
  delete colors[tag.toLowerCase()];
  await saveTagColors(colors);
}

function tagsView(root: ShadowRoot): Node[] {
  const counts = new Map<string, number>();
  for (const c of state.contacts) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!tags.length) {
    return [h('div', { class: 'empty' }, icon('tag'), 'Nenhuma etiqueta ainda.', 'Adicione etiquetas aos contatos pelo painel da conversa.')];
  }
  return [
    h('p', { class: 'muted lead' }, 'Renomear ou apagar aqui vale para todos os contatos e para os fluxos que usam a etiqueta.'),
    h('div', { class: 'set-list' }, ...tags.map((t) => {
      const name = h('input', { value: t, 'aria-label': 'Nome da etiqueta ' + t });
      name.addEventListener('change', async () => {
        const to = name.value.trim();
        if (!to || to === t) { name.value = t; return; }
        const merge = counts.has(to);
        if (merge && !confirm(`Já existe a etiqueta "${to}". Juntar "${t}" com ela?`)) { name.value = t; return; }
        await renameTag(t, to);
        toast(root, merge ? `"${t}" foi juntada com "${to}".` : `Etiqueta renomeada para "${to}".`);
      });
      const current = tagHue(t);
      return h('div', { class: 'set-row' },
        h('span', { class: 'chip', style: `--h:${current}` }, t),
        name,
        h('div', { class: 'swatches', role: 'group', 'aria-label': 'Cor da etiqueta ' + t },
          ...HUES.map((hue) => h('button', { class: 'swatch' + (hue === current ? ' on' : ''), style: `--h:${hue}`, title: 'Usar esta cor', 'aria-label': 'Cor ' + hue, 'aria-pressed': String(hue === current),
            on: { click: async () => { const colors = await getTagColors(); colors[t.toLowerCase()] = hue; await saveTagColors(colors); } } }))),
        h('span', { class: 'muted num' }, `${counts.get(t)} contato${counts.get(t) === 1 ? '' : 's'}`),
        h('button', { class: 'x danger', title: 'Apagar etiqueta', 'aria-label': 'Apagar etiqueta ' + t, on: { click: async () => {
          if (!confirm(`Apagar a etiqueta "${t}" de ${counts.get(t)} contato(s)?`)) return;
          await deleteTag(t);
          toast(root, `Etiqueta "${t}" apagada.`);
        } } }, icon('trash')));
    })),
  ];
}

/* ---------- campos personalizados ---------- */

const TYPE_LABEL: Record<FieldDef['type'], string> = { text: 'Texto', number: 'Número', date: 'Data', select: 'Lista de opções' };

function fieldsView(root: ShadowRoot): Node[] {
  const name = h('input', { id: 'nf-name', placeholder: 'Ex.: Cidade de entrega' });
  const type = h('select', { id: 'nf-type' }, ...Object.entries(TYPE_LABEL).map(([v, l]) => h('option', { value: v }, l)));
  const options = h('input', { id: 'nf-opts', placeholder: 'Ex.: Pix, Boleto, Cartão' });
  const optWrap = h('div', { class: 'hidden' }, h('label', { class: 'field', for: 'nf-opts' }, 'Opções, separadas por vírgula'), options);
  type.addEventListener('change', () => optWrap.classList.toggle('hidden', type.value !== 'select'));

  const add = async () => {
    const n = name.value.trim();
    if (!n) return name.focus();
    if (state.fields.some((f) => slug(f.name) === slug(n))) return toast(root, 'Já existe um campo com esse nome.');
    const opts = options.value.split(',').map((o) => o.trim()).filter(Boolean);
    if (type.value === 'select' && !opts.length) return toast(root, 'Informe as opções da lista.');
    await saveFields([...state.fields, { id: uid(), name: n, type: type.value as FieldDef['type'], options: type.value === 'select' ? opts : undefined }]);
    toast(root, `Campo "${n}" criado. Ele já aparece no painel de cada contato.`);
  };

  const list = state.fields.length
    ? h('div', { class: 'set-list' }, ...state.fields.map((f) => {
        const label = h('input', { value: f.name, 'aria-label': 'Nome do campo ' + f.name });
        label.addEventListener('change', () => {
          const n = label.value.trim();
          if (n && n !== f.name) void saveFields(state.fields.map((x) => (x.id === f.id ? { ...x, name: n } : x)));
          else label.value = f.name;
        });
        return h('div', { class: 'set-row' },
          label,
          h('span', { class: 'muted' }, TYPE_LABEL[f.type] + (f.options?.length ? `: ${f.options.join(', ')}` : '')),
          h('code', { title: 'Use nas respostas rápidas e nos fluxos' }, `{${slug(f.name)}}`),
          h('button', { class: 'x danger', title: 'Apagar campo', 'aria-label': 'Apagar campo ' + f.name, on: { click: async () => {
            if (!confirm(`Apagar o campo "${f.name}" e os valores preenchidos nos contatos?`)) return;
            for (const c of state.contacts.filter((x) => x.fields?.[f.id] !== undefined)) {
              const next = { ...c.fields };
              delete next[f.id];
              c.fields = next;
              await putContact(c, true);
            }
            await saveFields(state.fields.filter((x) => x.id !== f.id));
          } } }, icon('trash')));
      }))
    : h('div', { class: 'empty' }, icon('textbox'), 'Nenhum campo criado.', 'Campos guardam o que o funil não guarda: cidade, CPF, forma de pagamento.');

  return [
    h('p', { class: 'muted lead' }, 'Os campos aparecem no painel de cada contato, entram na busca e no CSV e viram variáveis nas respostas rápidas.'),
    list,
    h('div', { class: 'sec form-card' }, h('h4', {}, 'Novo campo'),
      h('label', { class: 'field', for: 'nf-name' }, 'Nome'), name,
      h('label', { class: 'field', for: 'nf-type' }, 'Tipo'), type,
      optWrap,
      h('button', { class: 'btn', on: { click: () => void add() } }, icon('plus'), 'Criar campo')),
  ];
}

/* ---------- respostas rápidas ---------- */

let editingReply: string | null = null;

async function repliesView(root: ShadowRoot, refresh: () => void): Promise<Node[]> {
  const replies = await getQuickReplies();
  const editing = replies.find((r) => r.id === editingReply);
  const sc = h('input', { id: 'qr-sc', placeholder: 'preco', value: editing?.shortcut ?? '' });
  const ti = h('input', { id: 'qr-ti', placeholder: 'Preços', value: editing?.title ?? '' });
  const tx = h('textarea', { id: 'qr-tx', rows: 4, placeholder: 'Olá {primeiro_nome}, segue a tabela de valores.' }, editing?.text ?? '');
  const lab = (id: string, text: string) => h('label', { class: 'field', for: id }, text);
  const vars = ['{nome}', '{primeiro_nome}', '{saudacao}', '{data}', ...state.fields.map((f) => `{${slug(f.name)}}`)].join(' ');

  const save = async () => {
    const s = sc.value.trim().replace(/^\//, '').replace(/\s+/g, '');
    if (!s || !tx.value.trim()) return toast(root, 'Informe atalho e texto.');
    const item: QuickReply = { id: editing?.id ?? uid(), shortcut: s, title: ti.value.trim() || s, text: tx.value };
    await saveQuickReplies(editing ? replies.map((r) => (r.id === editing.id ? item : r)) : [...replies, item]);
    editingReply = null;
    refresh();
  };

  return [
    h('p', { class: 'muted lead' }, 'Na conversa, digite / e o atalho, ou use o botão de raio ao lado do campo de mensagem.'),
    replies.length
      ? h('div', { class: 'set-list' }, ...replies.map((r) => h('div', { class: 'set-row reply' + (r.id === editingReply ? ' editing' : '') },
          h('div', { class: 'grow' }, h('b', {}, '/' + r.shortcut), h('span', { class: 'muted' }, ' ' + r.title), h('small', {}, r.text)),
          h('button', { class: 'x', title: 'Editar', 'aria-label': 'Editar resposta ' + r.shortcut, on: { click: () => { editingReply = r.id; refresh(); } } }, icon('gear')),
          h('button', { class: 'x danger', title: 'Apagar', 'aria-label': 'Apagar resposta ' + r.shortcut, on: { click: () => void saveQuickReplies(replies.filter((x) => x.id !== r.id)) } }, icon('trash')))))
      : h('div', { class: 'empty' }, icon('lightning'), 'Nenhuma resposta rápida.', 'Crie a primeira abaixo.'),
    h('div', { class: 'sec form-card' }, h('h4', {}, editing ? `Editando /${editing.shortcut}` : 'Nova resposta rápida'),
      lab('qr-sc', 'Atalho'), sc, lab('qr-ti', 'Título'), ti,
      lab('qr-tx', 'Texto'), tx,
      h('p', { class: 'muted' }, 'Variáveis: ' + vars),
      h('div', { class: 'inline' },
        h('button', { class: 'btn', on: { click: () => void save() } }, editing ? 'Salvar alterações' : 'Salvar resposta'),
        editing ? h('button', { class: 'btn ghost', on: { click: () => { editingReply = null; refresh(); } } }, 'Cancelar') : null)),
  ];
}

/* ---------- dados ---------- */

function dataView(root: ShadowRoot): Node[] {
  const file = h('input', { type: 'file', accept: 'application/json', class: 'hidden', on: { change: async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!confirm('Importar troca todos os dados atuais pelos do arquivo. Continuar?')) return;
    try { toast(root, `${await importBackup(await f.text())} contatos importados.`); } catch (err) { toast(root, String(err)); }
  } } });
  return [
    h('div', { class: 'sec form-card' }, h('h4', {}, 'Ao abrir o WhatsApp'),
      h('label', { class: 'check', for: 'set-autoopen' },
        h('input', { id: 'set-autoopen', type: 'checkbox', checked: state.view.autoOpen, on: { change: (e) => void saveViewPrefs({ ...state.view, autoOpen: (e.target as HTMLInputElement).checked }) } }),
        'Abrir o CRM em tela cheia assim que o WhatsApp carregar')),
    h('div', { class: 'sec form-card' }, h('h4', {}, 'Backup'),
      h('p', { class: 'muted' }, 'Tudo fica só neste navegador. Exporte de vez em quando para não perder nada. A chave da IA não entra no arquivo.'),
      h('div', { class: 'inline' },
        h('button', { class: 'btn', on: { click: async () => {
          const url = URL.createObjectURL(new Blob([await exportBackup()], { type: 'application/json' }));
          h('a', { href: url, download: `wa-crm-backup-${todayStr()}.json` }).click();
          URL.revokeObjectURL(url);
        } } }, icon('download'), 'Exportar JSON'),
        h('button', { class: 'btn ghost', on: { click: () => file.click() } }, 'Importar JSON'), file)),
    h('div', { class: 'sec form-card' }, h('h4', {}, 'Diagnóstico'),
      h('p', { class: 'muted' }, 'Se algo parar de funcionar depois de uma atualização do WhatsApp, copie o diagnóstico (números mascarados) e mande junto com o problema.'),
      h('button', { class: 'btn ghost', on: { click: async () => { await navigator.clipboard.writeText(collectDiagnostics()); toast(root, 'Diagnóstico copiado.'); } } }, icon('copy'), 'Copiar diagnóstico')),
    h('div', { class: 'sec form-card' }, h('h4', {}, 'Atalhos'),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Alt+K'), h('dd', {}, 'Abre ou esconde o CRM'),
        h('dt', {}, 'Alt+P'), h('dd', {}, 'Painel do contato sobre o WhatsApp original'),
        h('dt', {}, '/'), h('dd', {}, 'Respostas rápidas no campo de mensagem'))),
  ];
}

/** Conteúdo de uma seção de Ajustes (o menu lateral fica no App). */
export async function settingsContent(root: ShadowRoot, section: SettingsSection, refresh: () => void): Promise<Node[]> {
  switch (section) {
    case 'tags': return tagsView(root);
    case 'fields': return fieldsView(root);
    case 'replies': return repliesView(root, refresh);
    case 'flows': return flowsView(root, refresh);
    case 'ai': return aiView(root, refresh);
    case 'data': return dataView(root);
  }
}

/** Para o painel lateral antigo (sobre o WhatsApp original). */
export { repliesView as legacyRepliesView, dataView as legacyDataView };
