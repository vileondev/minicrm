export interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  probability?: number; // 0-100: chance de fechar a partir desta etapa (valor ponderado)
}

export interface QuickReply {
  id: string;
  shortcut: string; // "preco" -> acionado por /preco
  title: string;
  text: string; // aceita {nome} {primeiro_nome} {saudacao} {data}
}

/** Regra antiga (palavra-chave -> sugestão). Migrada para Automation na inicialização. */
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

export type Heat = 'quente' | 'morno' | 'frio';

export interface Contact {
  phone: string; // chave do registro: telefone sanitizado, "lid…", "g…" (grupo) ou "name_…"
  name: string;
  stageId: string | null;
  stageChangedAt?: number;
  tags: string[];
  notes: Note[];
  tasks: Task[];
  value: number; // valor do negócio
  heat?: Heat; // temperatura do lead (IA)
  score?: number; // 0-100 (IA)
  aiAt?: number; // última análise de IA
  number?: string; // telefone vinculado (o WhatsApp não mostra mais o número nas mensagens)
  isGroup?: boolean;
  internal?: boolean; // grupo/contato interno: fora do funil, das métricas e dos fluxos
  stageHistory?: StageEvent[]; // a última entrada é a etapa atual
  createdAt: number;
  updatedAt: number;
}

export interface StageEvent {
  stageId: string | null;
  at: number;
}

/** Preferências de visualização do Kanban (chrome.storage, fora do backup). */
export interface ViewPrefs {
  hideGroups: boolean;
  showInternal: boolean;
}

export interface ChatContext {
  key: string;
  number: string | null; // número real quando disponível
  name: string;
  isGroup: boolean;
  byName: boolean; // identificado só pelo nome
}

/* ---------- automação (100% local) ---------- */

export type Trigger =
  | { type: 'message'; keywords: string } // palavras separadas por vírgula; vazio = qualquer mensagem
  | { type: 'stage'; stageId: string } // lead entra na etapa
  | { type: 'tag'; tag: string } // tag adicionada
  | { type: 'stale'; stageId: string; days: number }; // parado na etapa há N dias

export type Action =
  | { type: 'suggest'; replyId: string } // sugere resposta rápida (o usuário aprova)
  | { type: 'stage'; stageId: string }
  | { type: 'addTag'; tag: string }
  | { type: 'removeTag'; tag: string }
  | { type: 'task'; text: string; dueDays: number }
  | { type: 'note'; text: string }
  | { type: 'notify'; text: string };

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  actions: Action[];
}

/* ---------- assistente de IA (opt-in, chave do usuário) ---------- */

export interface AiSettings {
  enabled: boolean;
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  model: string;
  context: string; // sobre o negócio, tom de voz, regras de preço
  autoAnalyze: boolean; // analisa mensagens recebidas sozinho
  autoStage: boolean; // deixa a IA mover a etapa do lead
}
