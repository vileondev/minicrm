/**
 * Sistema visual (calmo, neutro, funde com o tema do WhatsApp).
 * Regras travadas: UM acento (verde), UMA escala de raios (controle 8px, caixa 12px, chip/avatar pill),
 * sombras tingidas (nunca preto puro), sem preto/branco puros, texto sobre o acento com contraste AA.
 * Estados de etapa/tag são dados do usuário: aparecem só em um ponto pequeno ou em chips suaves.
 */
export const STYLES = `
:host {
  all: initial;
  --canvas:#eef1f0; --surface:#f8f9f8; --raised:#fcfdfc; --fg:#16201d; --muted:#586863; --line:#dce2e0;
  --accent:#00806a; --on-accent:#f3fbf8; --danger:#b3261e; --warn:#8a5a00;
  --r-ctl:8px; --r-box:12px; --r-pill:999px;
  --shadow: 0 1px 2px color-mix(in srgb, var(--fg) 8%, transparent), 0 10px 28px -10px color-mix(in srgb, var(--fg) 24%, transparent);
  --font: "WA CRM Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
  --tag-s: 55%; --tag-l: 32%;
}
:host([data-theme="dark"]) {
  --canvas:#0b1115; --surface:#111b21; --raised:#17232a; --fg:#e4eae8; --muted:#8fa1a7; --line:#25343b;
  --accent:#00a884; --on-accent:#04201a; --danger:#ff8a80; --warn:#f2c14e;
  --tag-s: 62%; --tag-l: 74%;
}
* { box-sizing: border-box; font-family: var(--font); }
button, input, select, textarea { font: inherit; color: inherit; }
.hidden { display: none !important; }
.ic { width: 16px; height: 16px; flex: none; fill: currentColor; }
.num { font-variant-numeric: tabular-nums; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ---------- controles ---------- */
.btn { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; background: var(--accent); color: var(--on-accent); border: 1px solid transparent;
  border-radius: var(--r-ctl); padding: 7px 12px; cursor: pointer; font-size: 13px; font-weight: 600; transition: transform .12s, filter .12s, background .12s; }
.btn:hover { filter: brightness(1.06); }
.btn:active { transform: translateY(1px) scale(.98); }
.btn.ghost { background: var(--raised); color: var(--fg); border-color: var(--line); }
.btn.ghost:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); filter: none; }
.btn.sm { padding: 4px 9px; font-size: 12px; }
.x { display: inline-grid; place-items: center; width: 26px; height: 26px; border: 0; background: none; border-radius: var(--r-ctl); cursor: pointer; color: var(--muted); transition: background .12s, color .12s; }
.x:hover { background: color-mix(in srgb, var(--fg) 8%, transparent); color: var(--fg); }
.x.danger:hover { color: var(--danger); }
.x:active { transform: translateY(1px); }
label.field { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-ctl); font-size: 13px; margin-bottom: 8px; background: var(--raised); color: var(--fg); }
input::placeholder, textarea::placeholder { color: var(--muted); opacity: .85; }
input[type=checkbox] { width: 16px; height: 16px; margin: 0 8px 0 0; accent-color: var(--accent); vertical-align: -3px; }
input[type=color] { padding: 2px; height: 34px; }
textarea { resize: vertical; min-height: 58px; }
.inline { display: flex; gap: 8px; align-items: flex-start; } .inline > * { margin-bottom: 0; }
.muted { color: var(--muted); font-size: 12px; }

/* ---------- avatar, chips ---------- */
.avatar { width: 32px; height: 32px; border-radius: var(--r-pill); color: #fff; font-weight: 600; font-size: 12px; display: grid; place-items: center; flex: none; }
.chip { --t: hsl(var(--h) var(--tag-s) var(--tag-l)); display: inline-flex; align-items: center; gap: 2px; background: color-mix(in srgb, var(--t) 15%, var(--raised));
  color: var(--t); border-radius: var(--r-pill); padding: 2px 9px; margin: 0 4px 4px 0; font-size: 11px; font-weight: 600; }
.chip .x { width: 16px; height: 16px; color: inherit; } .chip .ic { width: 10px; height: 10px; }
.pill { border: 1px solid var(--line); background: var(--raised); border-radius: var(--r-pill); padding: 4px 11px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; transition: border-color .12s, transform .12s; }
.pill:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
.pill:active { transform: scale(.97); }
.pill.on { background: var(--accent); color: var(--on-accent); border-color: transparent; font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }

/* ---------- dock ---------- */
.dock { position: fixed; left: 10px; bottom: 120px; z-index: 99990; display: flex; flex-direction: column; gap: 8px; }
.dock button { position: relative; width: 40px; height: 40px; border-radius: var(--r-box); border: 1px solid var(--line); cursor: pointer; background: var(--surface); color: var(--fg);
  display: grid; place-items: center; box-shadow: var(--shadow); transition: transform .12s, border-color .12s, color .12s; }
.dock button:hover { border-color: var(--accent); color: var(--accent); }
.dock button:active { transform: translateY(1px) scale(.97); }
.dock .ic { width: 20px; height: 20px; }
.dock .badge { position: absolute; top: -5px; right: -5px; background: var(--danger); color: var(--canvas); font-size: 10px; font-weight: 700; border-radius: var(--r-pill); padding: 1px 5px; min-width: 16px; text-align: center; }

/* ---------- painel do contato ---------- */
.panel { position: fixed; right: 0; top: 60px; bottom: 0; width: 380px; max-width: 100vw; z-index: 99980; background: var(--surface); color: var(--fg);
  border-left: 1px solid var(--line); display: flex; flex-direction: column; box-shadow: var(--shadow); font-size: 13px; }
.phead { padding: 14px; display: flex; gap: 12px; align-items: center; border-bottom: 1px solid var(--line); }
.phead .grow { flex: 1; min-width: 0; }
.phead b { display: block; font-size: 15px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs { display: flex; gap: 4px; padding: 8px 10px 0; border-bottom: 1px solid var(--line); }
.tab { padding: 8px 9px; border: 0; background: none; cursor: pointer; font-size: 13px; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--fg); }
.tab.active { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }
.body { flex: 1; overflow-y: auto; padding: 14px; }
.sec { margin-bottom: 20px; }
.sec h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--muted); }
.stages { display: flex; flex-wrap: wrap; gap: 6px; }
.row { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 6px 0; }
.row + .row { border-top: 1px solid var(--line); }
.row .t { overflow-wrap: anywhere; }
.row.done .t { text-decoration: line-through; color: var(--muted); }
.row.late .due { color: var(--danger); font-weight: 600; }
.note { background: color-mix(in srgb, var(--warn) 12%, var(--raised)); border: 1px solid color-mix(in srgb, var(--warn) 30%, var(--line)); border-radius: var(--r-ctl); padding: 8px 10px; margin-bottom: 8px; white-space: pre-wrap; }
.qr { padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-ctl); margin-bottom: 8px; cursor: pointer; background: var(--raised); transition: border-color .12s; }
.qr:hover { border-color: var(--accent); }
.qr small { display: block; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }

/* ---------- kanban ---------- */
.kb { position: fixed; inset: 0; z-index: 100000; background: var(--canvas); color: var(--fg); display: flex; flex-direction: column; font-size: 13px; }
.kb-top { display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: var(--surface); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.kb-top h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.02em; }
.kb-metrics { display: flex; gap: 20px; margin-left: 8px; }
.metric { display: flex; flex-direction: column; gap: 1px; }
.metric span { font-size: 11px; color: var(--muted); }
.metric b { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.metric.alert b { color: var(--danger); }
.kb-spacer { flex: 1; }
.search { position: relative; }
.search .ic { position: absolute; left: 10px; top: 10px; color: var(--muted); }
.search input { padding-left: 32px; width: 220px; margin: 0; }
.kb-top select { width: 160px; margin: 0; }
.kb-board { flex: 1; display: flex; gap: 14px; padding: 18px 20px; overflow-x: auto; align-items: flex-start; }
.col { width: 300px; flex: none; max-height: 100%; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-box); transition: border-color .12s, background .12s; }
.col.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }
.col-head { padding: 12px 12px 8px 14px; display: flex; align-items: center; gap: 8px; }
.col-head .grow { flex: 1; min-width: 0; }
.col-head .name { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; letter-spacing: -.01em; }
.col-head .count { background: color-mix(in srgb, var(--fg) 8%, transparent); color: var(--muted); border-radius: var(--r-pill); padding: 0 8px; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.col-head .sum { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 2px; display: block; }
.col-body { padding: 4px 10px 10px; overflow-y: auto; min-height: 76px; flex: 1; }
.col-edit { padding: 0 14px 12px; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; color: var(--muted); padding: 20px 12px; font-size: 12px;
  border: 1px dashed var(--line); border-radius: var(--r-ctl); line-height: 1.4; }
.empty .ic { width: 20px; height: 20px; }
.card { background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-box); padding: 10px 12px; margin-bottom: 8px; cursor: grab; transition: border-color .12s, transform .12s, box-shadow .12s; }
.card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
.card:active { cursor: grabbing; }
.card.drag { opacity: .45; transform: scale(.98); }
.card.open { cursor: default; border-color: var(--accent); box-shadow: var(--shadow); }
.card.sel { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
.card-top { display: flex; align-items: center; gap: 10px; }
.card-top .avatar { width: 30px; height: 30px; }
.card-top b { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card .chips { margin-top: 8px; }
.card .snippet { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card .meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.card .meta span { display: inline-flex; align-items: center; gap: 4px; }
.card .meta .ic { width: 14px; height: 14px; }
.card .meta .late { color: var(--danger); font-weight: 600; }

/* ---------- temperatura do lead, fluxos e assistente ---------- */
.heat { display: inline-flex; align-items: center; border-radius: var(--r-pill); padding: 2px 9px; margin: 0 4px 4px 0; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.heat.quente { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, var(--raised)); }
.heat.morno { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, var(--raised)); }
.heat.frio { color: var(--muted); background: color-mix(in srgb, var(--fg) 8%, var(--raised)); }
.flow { border: 1px solid var(--line); border-radius: var(--r-ctl); padding: 10px; margin-bottom: 8px; background: var(--raised); }
.flow .muted { line-height: 1.45; }
.step { border-left: 2px solid var(--line); padding-left: 12px; margin: 12px 0; }
.step > b { display: block; margin-bottom: 6px; }
.ai-result { background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-box); padding: 12px; }
.ai-result p { margin: 8px 0; line-height: 1.45; }
label.check { display: flex; align-items: center; font-size: 13px; margin-bottom: 8px; cursor: pointer; }
details.sec summary { cursor: pointer; font-weight: 600; font-size: 13px; }
.btn[disabled] { opacity: .5; cursor: not-allowed; filter: none; transform: none; }

/* ---------- chat dentro do card ---------- */
.cardchat { margin-top: 10px; }
.cardchat .msgs { height: 240px; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-ctl); padding: 8px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.bubble { max-width: 86%; padding: 6px 9px; border-radius: var(--r-ctl); font-size: 13px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.bubble.in { align-self: flex-start; background: var(--raised); border: 1px solid var(--line); }
.bubble.out { align-self: flex-end; background: color-mix(in srgb, var(--accent) 22%, var(--raised)); }
.bubble .quote { border-left: 2px solid var(--accent); padding-left: 8px; margin-bottom: 4px; color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bubble .author { font-size: 11px; font-weight: 600; color: var(--accent); margin-bottom: 2px; }
.bubble .time { display: block; text-align: right; font-size: 10px; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
.qchips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.skel { height: 34px; border-radius: var(--r-ctl); background: color-mix(in srgb, var(--fg) 7%, transparent); }
.skel:nth-child(odd) { width: 62%; } .skel:nth-child(even) { width: 78%; align-self: flex-end; }
@media (prefers-reduced-motion: no-preference) {
  .skel { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .45; } }
}
.state { display: flex; align-items: center; gap: 8px; padding: 10px; font-size: 12px; color: var(--muted); }
.state.err { color: var(--danger); }
.inline.wrap { flex-wrap: wrap; }
.bubble.media { font-style: italic; color: var(--muted); }

/* ---------- visões do Kanban: tarefas e relatório ---------- */
.seg { display: inline-flex; gap: 4px; }
.kb-page { flex: 1; overflow-y: auto; padding: 18px 20px; max-width: 1000px; width: 100%; }
.tform { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-box); padding: 10px; margin-bottom: 18px; }
.tform input, .tform select { margin: 0; width: auto; }
.tform input:not([type]) { flex: 1; min-width: 200px; }
.tgroup { margin-bottom: 18px; }
.tgroup h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.tgroup h3 .count { background: color-mix(in srgb, var(--fg) 8%, transparent); border-radius: var(--r-pill); padding: 0 8px; font-size: 11px; }
.trow { display: flex; align-items: center; gap: 10px; background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-ctl); padding: 8px 10px; margin-bottom: 6px; }
.trow input[type=checkbox] { margin: 0; }
.trow .avatar { width: 26px; height: 26px; font-size: 11px; }
.trow .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.trow .grow b { font-weight: 500; overflow-wrap: anywhere; }
.trow .grow .muted { font-size: 12px; }
.trow .due { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.trow.late { border-color: color-mix(in srgb, var(--danger) 40%, var(--line)); }
.trow.late .due { color: var(--danger); font-weight: 600; }
.rep { width: 100%; border-collapse: collapse; background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-box); overflow: hidden; }
.rep th, .rep td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
.rep th { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; background: var(--surface); }
.rep td.num, .rep th:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rep tr:last-child td { border-bottom: 0; }
.rep .bar { height: 4px; border-radius: var(--r-pill); background: color-mix(in srgb, var(--fg) 7%, transparent); margin-top: 6px; overflow: hidden; }
.rep .bar span { display: block; height: 100%; border-radius: inherit; }
.kb-page > .muted { margin-top: 12px; line-height: 1.5; }
.state.err > span { display: flex; flex-direction: column; align-items: flex-start; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }

/* ---------- popup "/" e avisos ---------- */
.popup { position: fixed; z-index: 100001; background: var(--surface); color: var(--fg); border: 1px solid var(--line); border-radius: var(--r-box); box-shadow: var(--shadow); overflow: hidden; max-height: 280px; overflow-y: auto; }
.popup .item { padding: 9px 12px; cursor: pointer; font-size: 13px; }
.popup .item + .item { border-top: 1px solid var(--line); }
.popup .item.sel, .popup .item:hover { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
.popup .item small { display: block; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.popup .hint { padding: 6px 12px; font-size: 11px; color: var(--muted); background: var(--canvas); border-top: 1px solid var(--line); }
.toast { position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%); z-index: 100001; background: var(--surface); color: var(--fg); border: 1px solid var(--line); border-radius: var(--r-box);
  padding: 10px 12px 10px 16px; font-size: 13px; display: flex; gap: 10px; align-items: center; max-width: 90vw; box-shadow: var(--shadow); }
.msg { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); z-index: 100002; background: var(--fg); color: var(--canvas); border-radius: var(--r-ctl); padding: 10px 16px; font-size: 13px; box-shadow: var(--shadow); }
`;
