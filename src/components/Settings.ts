import type { FieldDef, QuickReply, Template } from '../types';
import { getQuickReplies, getTagColors, saveAutomations, saveFields, saveProducts, saveQuickReplies, saveTagColors, saveTemplates, saveViewPrefs } from '../storage/chromeStore';
import { putContact } from '../storage/db';
import { emitDataChange } from '../storage/bus';
import { exportBackup, importBackup } from '../storage/backup';
import { collectDiagnostics } from '../content/diagnostics';
import { applyImport, planImport, type ImportPlan } from '../content/csv';
import { state } from '../content/state';
import { money, slug, tagHue, todayStr } from '../utils/format';
import { aiView } from './AiPanel';
import { flowsView } from './Flows';
import { icon, type IconName } from './icons';
import { fieldError, h, toast, uid } from './h';

export type SettingsSection = 'tags' | 'fields' | 'catalog' | 'replies' | 'templates' | 'flows' | 'ai' | 'data';

export const SETTINGS_MENU: [SettingsSection, string, IconName][] = [
  ['tags', 'Etiquetas', 'tag'],
  ['fields', 'Campos personalizados', 'textbox'],
  ['catalog', 'Catálogo', 'package'],
  ['replies', 'Respostas rápidas', 'lightning'],
  ['templates', 'Modelos de mensagem', 'template'],
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

/* ---------- catálogo ---------- */

function catalogView(root: ShadowRoot): Node[] {
  const name = h('input', { id: 'np-name', placeholder: 'Ex.: Kit completo com instalação' });
  const price = h('input', { id: 'np-price', type: 'number', min: '0', step: '1', placeholder: '0' });
  const err = fieldError();
  name.addEventListener('input', () => err.clear(name));
  price.addEventListener('input', () => err.clear(price));
  const add = async () => {
    const n = name.value.trim();
    const p = Math.round(Number(price.value));
    if (!n) return err.show(name, 'Dê um nome ao produto.');
    if (!Number.isFinite(p) || p <= 0) return err.show(price, 'Informe um preço maior que zero.');
    await saveProducts([...state.products, { id: uid(), name: n, price: p }]);
    toast(root, `"${n}" entrou no catálogo.`);
  };
  const list = state.products.length
    ? h('div', { class: 'set-list' }, ...state.products.map((p) => {
        const nm = h('input', { value: p.name, 'aria-label': 'Nome do produto ' + p.name });
        const pr = h('input', { type: 'number', min: '0', value: String(p.price), 'aria-label': 'Preço de ' + p.name, class: 'price' });
        const update = () => {
          const n = nm.value.trim() || p.name;
          const v = Math.max(0, Math.round(Number(pr.value)) || p.price);
          void saveProducts(state.products.map((x) => (x.id === p.id ? { ...x, name: n, price: v } : x)));
        };
        nm.addEventListener('change', update);
        pr.addEventListener('change', update);
        const uses = state.contacts.filter((c) => c.items?.some((i) => i.productId === p.id)).length;
        return h('div', { class: 'set-row' }, icon('package'), nm, h('span', { class: 'muted' }, 'R$'), pr,
          h('span', { class: 'muted' }, uses ? `em ${uses} negócio${uses > 1 ? 's' : ''}` : 'sem uso'),
          h('button', { class: 'x danger', title: 'Tirar do catálogo', 'aria-label': 'Tirar ' + p.name + ' do catálogo', on: { click: () => {
            if (confirm(`Tirar "${p.name}" do catálogo? Os negócios que já têm este produto continuam com ele.`)) void saveProducts(state.products.filter((x) => x.id !== p.id));
          } } }, icon('trash')));
      }))
    : h('div', { class: 'empty' }, icon('package'), 'Catálogo vazio.', 'Cadastre produtos ou serviços para montar o valor de cada negócio.');
  return [
    h('p', { class: 'muted lead' }, 'Na conversa, adicione produtos ao lead e o valor do negócio é calculado sozinho. Mudar o preço aqui não altera negócios já montados.'),
    list,
    h('div', { class: 'sec form-card' }, h('h4', {}, 'Novo produto ou serviço'),
      h('label', { class: 'field', for: 'np-name' }, 'Nome'), name,
      h('label', { class: 'field', for: 'np-price' }, 'Preço (R$)'), price,
      err.el,
      h('button', { class: 'btn', on: { click: () => void add() } }, icon('plus'), 'Adicionar ao catálogo')),
  ];
}

/* ---------- modelos de mensagem ---------- */

let editingTemplate: string | null = null;

function templatesView(root: ShadowRoot, refresh: () => void): Node[] {
  const editing = state.templates.find((t) => t.id === editingTemplate);
  const title = h('input', { id: 'tp-title', placeholder: 'Ex.: Envio de proposta', value: editing?.title ?? '' });
  const category = h('input', { id: 'tp-cat', placeholder: 'Ex.: Vendas', list: 'tp-cats', value: editing?.category ?? '' });
  const cats = [...new Set(state.templates.map((t) => t.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const text = h('textarea', { id: 'tp-text', rows: 5, placeholder: '{saudacao}, {primeiro_nome}! Segue a proposta que combinamos.' }, editing?.text ?? '');
  const err = fieldError();
  title.addEventListener('input', () => err.clear(title));
  text.addEventListener('input', () => err.clear(text));
  const vars = ['{nome}', '{primeiro_nome}', '{saudacao}', '{data}', ...state.fields.map((f) => `{${slug(f.name)}}`)].join(' ');
  const save = async () => {
    if (!title.value.trim()) return err.show(title, 'Dê um título ao modelo.');
    if (!text.value.trim()) return err.show(text, 'Escreva o texto do modelo.');
    const item: Template = { id: editing?.id ?? uid(), title: title.value.trim(), category: category.value.trim() || 'Geral', text: text.value };
    await saveTemplates(editing ? state.templates.map((t) => (t.id === editing.id ? item : t)) : [...state.templates, item]);
    editingTemplate = null;
    toast(root, editing ? 'Modelo atualizado.' : 'Modelo criado.');
    refresh();
  };
  const groups = cats.map((cat) => h('div', { class: 'tpl-group' }, h('h4', {}, cat),
    h('div', { class: 'set-list' }, ...state.templates.filter((t) => t.category === cat).map((t) => h('div', { class: 'set-row reply' + (t.id === editingTemplate ? ' editing' : '') },
      h('div', { class: 'grow' }, h('b', {}, t.title), h('small', {}, t.text)),
      h('button', { class: 'x', title: 'Editar', 'aria-label': 'Editar modelo ' + t.title, on: { click: () => { editingTemplate = t.id; refresh(); } } }, icon('gear')),
      h('button', { class: 'x danger', title: 'Apagar', 'aria-label': 'Apagar modelo ' + t.title, on: { click: () => { if (confirm(`Apagar o modelo "${t.title}"?`)) void saveTemplates(state.templates.filter((x) => x.id !== t.id)); } } }, icon('trash')))))));
  return [
    h('p', { class: 'muted lead' }, 'Modelos são mensagens prontas e mais longas, organizadas por categoria. Use pelo botão de documento ao lado do campo de mensagem.'),
    ...(groups.length ? groups : [h('div', { class: 'empty' }, icon('template'), 'Nenhum modelo.', 'Crie o primeiro abaixo.')]),
    h('div', { class: 'sec form-card' }, h('h4', {}, editing ? `Editando "${editing.title}"` : 'Novo modelo'),
      h('label', { class: 'field', for: 'tp-title' }, 'Título'), title,
      h('label', { class: 'field', for: 'tp-cat' }, 'Categoria'), category, h('datalist', { id: 'tp-cats' }, ...cats.map((c) => h('option', { value: c }))),
      h('label', { class: 'field', for: 'tp-text' }, 'Texto'), text,
      h('p', { class: 'muted' }, 'Variáveis: ' + vars),
      err.el,
      h('div', { class: 'inline' },
        h('button', { class: 'btn', on: { click: () => void save() } }, editing ? 'Salvar alterações' : 'Criar modelo'),
        editing ? h('button', { class: 'btn ghost', on: { click: () => { editingTemplate = null; refresh(); } } }, 'Cancelar') : null)),
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

/* ---------- importar leads por CSV ---------- */

let pendingImport: { plan: ImportPlan; file: string } | null = null;

function importSection(root: ShadowRoot, refresh: () => void): HTMLElement {
  const file = h('input', { type: 'file', accept: '.csv,text/csv', class: 'hidden', on: { change: async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      pendingImport = { plan: planImport(await f.text()), file: f.name };
    } catch (err) {
      pendingImport = null;
      toast(root, err instanceof Error ? err.message : String(err));
    }
    refresh();
  } } });
  const card = h('div', { class: 'sec form-card wide' }, h('h4', {}, 'Importar leads (CSV)'),
    h('p', { class: 'muted' }, 'A primeira linha precisa ter os nomes das colunas. Reconheço Nome, Telefone, Etapa, Tags, Valor, Nota e os seus campos personalizados. Leads que já existem são completados, nada é apagado.'),
    h('button', { class: 'btn ghost', on: { click: () => file.click() } }, icon('arrow-up'), 'Escolher arquivo CSV'), file);
  const p = pendingImport;
  if (!p) return card;

  const { rows } = p.plan;
  const novos = rows.filter((r) => !r.existing).length;
  const stageLabel = (r: (typeof rows)[number]) => (r.stageId === undefined ? (r.stageName ? `${r.stageName} (não existe)` : '') : r.stageId === null ? 'Sem etapa' : state.stages.find((s) => s.id === r.stageId)?.name ?? '');
  card.append(
    h('div', { class: 'import-preview' },
      h('p', {}, h('b', {}, p.file), `: ${novos} novo${novos === 1 ? '' : 's'}, ${rows.length - novos} já no CRM${p.plan.skipped ? `, ${p.plan.skipped} linha(s) sem nome nem telefone ignorada(s)` : ''}.`),
      h('p', { class: 'muted' }, 'Colunas usadas: ' + (p.plan.recognized.join(', ') || 'nenhuma') + (p.plan.unknown.length ? `. Ignoradas: ${p.plan.unknown.join(', ')}` : '') + '.'),
      p.plan.unknownStages.length ? h('p', { class: 'field-err' }, `Etapas que não existem no funil (os leads entram sem mudar de etapa): ${p.plan.unknownStages.join(', ')}.`) : null,
      h('table', { class: 'rep' },
        h('thead', {}, h('tr', {}, ...['', 'Nome', 'Telefone', 'Etapa', 'Tags', 'Valor'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...rows.slice(0, 8).map((r) => h('tr', {},
          h('td', {}, h('span', { class: 'heat ' + (r.existing ? 'frio' : 'morno') }, r.existing ? 'Atualiza' : 'Novo')),
          h('td', {}, r.name), h('td', { class: 'num' }, r.phone ? '+' + r.phone : '-'), h('td', {}, stageLabel(r)),
          h('td', {}, r.tags.join(', ')), h('td', { class: 'num' }, r.value ? money(r.value) : '-'))))),
      rows.length > 8 ? h('p', { class: 'muted' }, `E mais ${rows.length - 8} linha(s).`) : null,
      h('div', { class: 'inline' },
        h('button', { class: 'btn', on: { click: async (e) => {
          (e.currentTarget as HTMLButtonElement).setAttribute('disabled', '');
          const { created, updated } = await applyImport(p.plan);
          pendingImport = null;
          toast(root, `Importação concluída: ${created} lead(s) novo(s), ${updated} atualizado(s).`);
          refresh();
        } } }, `Importar ${rows.length} lead${rows.length === 1 ? '' : 's'}`),
        h('button', { class: 'btn ghost', on: { click: () => { pendingImport = null; refresh(); } } }, 'Cancelar'))));
  return card;
}

/* ---------- dados ---------- */

function dataView(root: ShadowRoot, refresh: () => void): Node[] {
  const file = h('input', { type: 'file', accept: 'application/json', class: 'hidden', on: { change: async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (!confirm('Importar troca todos os dados atuais pelos do arquivo. Continuar?')) return;
    try { toast(root, `${await importBackup(await f.text())} contatos importados.`); } catch (err) { toast(root, String(err)); }
  } } });
  return [
    h('div', { class: 'sec form-card' }, h('h4', {}, 'Aparência, abertura e avisos'),
      h('label', { class: 'check', for: 'set-autoopen' },
        h('input', { id: 'set-autoopen', type: 'checkbox', checked: state.view.autoOpen, on: { change: (e) => void saveViewPrefs({ ...state.view, autoOpen: (e.target as HTMLInputElement).checked }) } }),
        'Abrir o CRM em tela cheia assim que o WhatsApp carregar'),
      h('label', { class: 'field', for: 'set-theme' }, 'Tema'),
      h('select', { id: 'set-theme', on: { change: (e) => void saveViewPrefs({ ...state.view, theme: (e.target as HTMLSelectElement).value as typeof state.view.theme }) } },
        ...([['auto', 'Seguir o WhatsApp'], ['light', 'Claro'], ['dark', 'Escuro']] as const).map(([v, l]) => h('option', { value: v, selected: state.view.theme === v }, l))),
      h('label', { class: 'check', for: 'set-notify' },
        h('input', { id: 'set-notify', type: 'checkbox', checked: state.view.notifyTasks, on: { change: (e) => void saveViewPrefs({ ...state.view, notifyTasks: (e.target as HTMLInputElement).checked }) } }),
        'Avisar no computador quando uma tarefa vence hoje ou atrasa'),
      h('p', { class: 'muted' }, 'O aviso só aparece com o WhatsApp Web aberto em alguma aba, mesmo em segundo plano.')),
    importSection(root, refresh),
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
    case 'catalog': return catalogView(root);
    case 'templates': return templatesView(root, refresh);
    case 'replies': return repliesView(root, refresh);
    case 'flows': return flowsView(root, refresh);
    case 'ai': return aiView(root, refresh);
    case 'data': return dataView(root, refresh);
  }
}

/** Para o painel lateral antigo (sobre o WhatsApp original). */
export { repliesView as legacyRepliesView, dataView as legacyDataView };
