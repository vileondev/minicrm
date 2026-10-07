export const STYLES = `
:host { all: initial; --bg:#fff; --bg2:#f0f2f5; --fg:#111b21; --muted:#667781; --border:#d1d7db; --accent:#00a884; --danger:#ea4335; --shadow:0 6px 24px rgba(0,0,0,.18); }
:host([data-theme="dark"]) { --bg:#111b21; --bg2:#0b141a; --fg:#e9edef; --muted:#8696a0; --border:#2a3942; --shadow:0 6px 24px rgba(0,0,0,.6); }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
button { font: inherit; color: inherit; }
.hidden { display: none !important; }

/* ---- dock (barra lateral esquerda do WhatsApp) ---- */
.dock { position: fixed; left: 8px; bottom: 120px; z-index: 99990; display: flex; flex-direction: column; gap: 6px; }
.dock button { position: relative; width: 40px; height: 40px; border-radius: 50%; border: 0; cursor: pointer; background: var(--accent); color: #fff; font-size: 18px; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.dock button:hover { filter: brightness(1.1); }
.dock .badge { position: absolute; top: -3px; right: -3px; background: var(--danger); color: #fff; font-size: 10px; font-weight: 700; border-radius: 9px; padding: 1px 5px; }

/* ---- painel do contato ---- */
.panel { position: fixed; right: 0; top: 60px; bottom: 0; width: 360px; max-width: 100vw; z-index: 99980; background: var(--bg); color: var(--fg);
  border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: var(--shadow); font-size: 13px; }
.phead { padding: 12px 14px; display: flex; gap: 10px; align-items: center; border-bottom: 1px solid var(--border); background: var(--bg2); }
.phead .grow { flex: 1; min-width: 0; }
.phead b { display: block; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.avatar { width: 38px; height: 38px; border-radius: 50%; color: #fff; font-weight: 700; display: grid; place-items: center; flex: none; }
.tabs { display: flex; border-bottom: 1px solid var(--border); }
.tab { flex: 1; padding: 9px 4px; border: 0; background: none; cursor: pointer; font-size: 12px; color: var(--muted); }
.tab.active { color: var(--accent); border-bottom: 2px solid var(--accent); font-weight: 600; }
.body { flex: 1; overflow-y: auto; padding: 12px 14px; }
.sec { margin-bottom: 16px; }
.sec h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: .05em; }
input, select, textarea { width: 100%; padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; margin-bottom: 6px; background: var(--bg); color: var(--fg); }
input[type=checkbox] { width: auto; margin: 0 6px 0 0; }
textarea { resize: vertical; min-height: 58px; }
.btn { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 12px; font-weight: 600; }
.btn.ghost { background: var(--bg2); color: var(--fg); border: 1px solid var(--border); }
.btn.sm { padding: 3px 8px; }
.x { background: none; border: 0; cursor: pointer; color: var(--muted); font-size: 14px; padding: 0 4px; }
.x:hover { color: var(--danger); }
.stages { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { border: 1px solid var(--border); background: var(--bg); border-radius: 14px; padding: 4px 10px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
.pill.on { color: #fff; border-color: transparent; font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.chip { display: inline-flex; align-items: center; gap: 2px; color: #fff; border-radius: 10px; padding: 2px 8px; margin: 0 4px 4px 0; font-size: 11px; font-weight: 600; }
.chip .x { color: #fff; opacity: .8; font-size: 11px; }
.row { display: flex; align-items: center; gap: 6px; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--border); }
.row.done .t { text-decoration: line-through; color: var(--muted); }
.row.late .due { color: var(--danger); font-weight: 600; }
.muted { color: var(--muted); font-size: 12px; }
.note { background: color-mix(in srgb, #f5c542 18%, var(--bg)); border: 1px solid color-mix(in srgb, #f5c542 45%, var(--bg)); border-radius: 8px; padding: 7px 9px; margin-bottom: 6px; white-space: pre-wrap; }
.qr { padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; cursor: pointer; }
.qr:hover { border-color: var(--accent); }
.qr small { display: block; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inline { display: flex; gap: 6px; } .inline > * { margin-bottom: 6px; }

/* ---- kanban em tela cheia ---- */
.kb { position: fixed; inset: 0; z-index: 100000; background: var(--bg2); color: var(--fg); display: flex; flex-direction: column; font-size: 13px; }
.kb-top { display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: var(--bg); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.kb-top h2 { margin: 0; font-size: 18px; }
.kb-top input, .kb-top select { width: 200px; margin: 0; }
.kb-stats { color: var(--muted); }
.kb-spacer { flex: 1; }
.kb-board { flex: 1; display: flex; gap: 12px; padding: 16px 18px; overflow-x: auto; align-items: flex-start; }
.col { width: 292px; flex: none; max-height: 100%; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-top: 3px solid var(--c, var(--muted)); border-radius: 10px; }
.col.over { outline: 2px dashed var(--accent); outline-offset: 2px; }
.col-head { padding: 10px 12px; display: flex; align-items: center; gap: 8px; }
.col-head .grow { flex: 1; min-width: 0; }
.col-head b { display: block; }
.col-body { padding: 4px 8px 8px; overflow-y: auto; min-height: 70px; flex: 1; }
.col-edit { padding: 0 12px 10px; }
.card { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 9px 10px; margin-bottom: 8px; cursor: grab; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.card:hover { border-color: var(--accent); }
.card.drag { opacity: .4; }
.card.open { cursor: default; border-color: var(--accent); }
.cardchat { margin-top: 8px; }
.cardchat .msgs { height: 240px; overflow-y: auto; background: var(--bg2); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.bubble { max-width: 85%; padding: 5px 8px; border-radius: 8px; font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
.bubble.in { align-self: flex-start; background: var(--bg); border: 1px solid var(--border); }
.bubble.out { align-self: flex-end; background: color-mix(in srgb, var(--accent) 28%, var(--bg)); }
.bubble .time { display: block; text-align: right; font-size: 10px; color: var(--muted); }
.qchips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.card.sel { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.card-top { display: flex; align-items: center; gap: 8px; }
.card-top .avatar { width: 28px; height: 28px; font-size: 11px; }
.card-top b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card .meta { display: flex; gap: 10px; margin-top: 6px; color: var(--muted); font-size: 11px; }
.card .meta .late { color: var(--danger); font-weight: 700; }
.card .snippet { margin-top: 6px; color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card .chips { margin-top: 6px; }
.empty { text-align: center; color: var(--muted); padding: 18px 8px; font-size: 12px; }

/* ---- popup "/" e avisos ---- */
.popup { position: fixed; z-index: 100001; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); overflow: hidden; max-height: 280px; overflow-y: auto; }
.popup .item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border); font-size: 13px; }
.popup .item.sel, .popup .item:hover { background: color-mix(in srgb, var(--accent) 16%, var(--bg)); }
.popup .item small { display: block; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.popup .hint { padding: 5px 12px; font-size: 11px; color: var(--muted); background: var(--bg2); }
.toast { position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%); z-index: 100001; background: #111b21; color: #fff; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; display: flex; gap: 10px; align-items: center; max-width: 90vw; box-shadow: var(--shadow); }
.msg { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); z-index: 100002; background: #111b21; color: #fff; border-radius: 8px; padding: 9px 16px; font-size: 13px; box-shadow: var(--shadow); }
`;
