export interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface QuickReply {
  id: string;
  shortcut: string; // "preco" -> acionado por /preco
  title: string;
  text: string; // aceita {nome} {primeiro_nome} {saudacao} {data}
}

export interface Rule {
  id: string;
  keyword: string;
  quickReplyId: string;
  enabled: boolean;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  due?: string; // YYYY-MM-DD
}

export interface Note {
  id: string;
  text: string;
  createdAt: number;
}

export interface Contact {
  phone: string; // chave do registro: telefone sanitizado, "lid…", "g…" (grupo) ou "name_…"
  name: string;
  stageId: string | null;
  tags: string[];
  notes: Note[];
  tasks: Task[];
  value: number; // valor do negócio
  createdAt: number;
  updatedAt: number;
}

export interface ChatContext {
  key: string;
  number: string | null; // número real quando disponível
  name: string;
  isGroup: boolean;
  byName: boolean; // identificado só pelo nome
}
