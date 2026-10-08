<div align="center">

# WA Local CRM

**Um CRM completo dentro do WhatsApp Web. Gratuito, open source e 100% local.**

Kanban de vendas, tarefas, relatório do funil, respostas rápidas, automações e um assistente de IA opcional,
tudo rodando no seu navegador. Seus dados não saem do seu computador.

[![Licença: GPL v3](https://img.shields.io/badge/licen%C3%A7a-GPL--3.0-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Contribuições bem-vindas](https://img.shields.io/badge/contribui%C3%A7%C3%B5es-bem--vindas-brightgreen.svg)](#-como-contribuir)

</div>

---

## ✨ O que ele faz

| | |
|---|---|
| 📋 **Kanban de vendas** | Arraste leads entre etapas, filtre por tag, ordene pelos mais quentes e exporte CSV. Alt+K abre. |
| 💬 **Chat dentro do card** | Leia e responda a conversa sem sair do Kanban. Áudios, fotos e figurinhas aparecem como marcadores. |
| ✅ **Tarefas** | Todas as tarefas de todos os leads, agrupadas em atrasadas, hoje e próximos dias. |
| 📊 **Relatório do funil** | Quantos leads passaram por cada etapa, conversão, tempo médio e valor ponderado. |
| 🏷️ **Etiquetas na lista** | A etapa e as tags aparecem ao lado do nome de cada conversa. |
| ⚡ **Respostas rápidas** | Digite `/` no chat. Aceita `{nome}`, `{primeiro_nome}`, `{saudacao}` e `{data}`. |
| 🔁 **Automações locais** | "Lead parado 3 dias → criar follow-up", "cliente pediu preço → mover etapa". Nenhuma automação envia mensagem. |
| 🤖 **Assistente de IA (opcional)** | Com a sua chave da Anthropic, OpenAI ou Google Gemini: temperatura do lead, resumo, próximo passo e rascunho de resposta. Você revisa e envia. |
| 👥 **Grupos e internos** | Grupos ficam fora do funil por padrão; contatos da equipe podem ser marcados como internos. |
| 💾 **Backup** | Exporte e importe tudo em JSON. |

## 🔒 Privacidade

Tudo fica **no seu navegador** (`chrome.storage.local` e IndexedDB). Não existe servidor, conta ou telemetria.

A única exceção é o assistente de IA, que vem **desligado**. Se você ligar e usar, o nome do contato e até 30 mensagens
da conversa analisada vão direto para a API que você escolheu, com a sua chave. A chave fica só no seu navegador e
não entra no backup.

---

## 📥 Como baixar e instalar

A extensão ainda não está na Chrome Web Store, então a instalação é pelo modo do desenvolvedor. Leva uns 5 minutos.

### 1. O que você precisa

- **Google Chrome** ou **Microsoft Edge**
- **Node.js 18 ou mais novo**: baixe em [nodejs.org](https://nodejs.org/) (a versão LTS serve)
- **Git** (opcional): baixe em [git-scm.com](https://git-scm.com/)

### 2. Baixe o código

**Com Git:**

```bash
git clone https://github.com/vileondev/minicrm.git
cd minicrm
```

**Sem Git:** no topo desta página, clique em **Code → Download ZIP**, extraia o arquivo e abra um terminal dentro da pasta extraída.

### 3. Gere a extensão

```bash
npm install
npm run build
```

Isso cria a pasta **`dist`**, que é a extensão pronta.

### 4. Carregue no navegador

1. Abra `chrome://extensions` (Chrome) ou `edge://extensions` (Edge).
2. Ligue o **Modo do desenvolvedor**: canto superior direito no Chrome, menu lateral no Edge.
3. Clique em **Carregar sem pacote** e escolha a pasta **`dist`**.
4. Abra (ou recarregue) [web.whatsapp.com](https://web.whatsapp.com).

Pronto: os botões do CRM aparecem na lateral esquerda do WhatsApp. 🎉

### Atualizar para uma versão nova

```bash
git pull
npm install
npm run build
```

Depois clique no ↻ da extensão em `chrome://extensions` e dê F5 no WhatsApp. Seus dados continuam lá.
Se você baixou o ZIP, baixe de novo e repita os passos 3 e 4.

---

## 🚀 Primeiros passos

1. **Abra o Kanban** com o botão ▦ ou **Alt+K**.
2. Clique em **Chat atual** para pôr a conversa aberta no funil, ou em **Importar** para trazer as conversas visíveis na lista.
3. **Abra o painel do contato** com o botão ☰ ou **Alt+P** para definir etapa, valor, tags, tarefas e notas.
4. Em **Respostas** (no painel), crie seus atalhos e use-os digitando `/` no chat.
5. Quer IA? No painel, vá em **IA**, ligue o assistente, escolha o provedor e cole a sua chave.

| Atalho | Ação |
|---|---|
| `Alt+K` | Abrir ou fechar o Kanban |
| `Alt+P` | Abrir ou fechar o painel do contato |
| `/` no chat | Respostas rápidas |
| `Esc` | Fechar o Kanban |

### Onde conseguir uma chave de IA

| Provedor | Onde criar a chave | Modelo padrão |
|---|---|---|
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com/) | `claude-haiku-4-5-20251001` |
| OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) | `gpt-4o-mini` |
| Google (Gemini) | [aistudio.google.com](https://aistudio.google.com/apikey) | `gemini-2.5-flash` |

O uso é cobrado pelo provedor, na sua conta.

---

## 🛠️ Problemas comuns

**O CRM não aparece no WhatsApp:** confira se a extensão está ativada em `chrome://extensions` e dê F5 no WhatsApp.

**Não encontra a conversa de um lead:** o card mostra **Abrir WhatsApp ao lado** e **Usar "conversa"**. Abra a conversa
manualmente e ligue o lead a ela. No painel do contato, **Ler do perfil** vincula o número do contato, o que deixa a busca mais confiável.

**Parou de funcionar depois de uma atualização do WhatsApp:** o WhatsApp muda o site com frequência. No painel, vá em
**Dados → Copiar diagnóstico** (os números saem mascarados) e abra uma [issue](https://github.com/vileondev/minicrm/issues) com ele.

---

## 🤝 Como contribuir

Contribuições são muito bem-vindas: correções, novos recursos, traduções, melhorias de texto.

1. Faça um fork e crie um branch: `git checkout -b minha-melhoria`
2. Rode `npm run build` e teste no WhatsApp Web (recarregue a extensão a cada build)
3. Confira os tipos com `npm run typecheck`
4. Abra um pull request explicando o que mudou e por quê

### Estrutura do código

| Caminho | O que tem |
|---|---|
| `src/utils/domSelectors.ts` | Todos os seletores do WhatsApp. **Comece por aqui quando o WhatsApp mudar.** |
| `src/content/` | Entrada, observer, leitura de mensagens, lista de conversas, métricas, automações e IA |
| `src/components/` | Kanban, painel do contato, fluxos, assistente de IA e respostas rápidas (Shadow DOM) |
| `src/storage/` | IndexedDB (contatos) e `chrome.storage.local` (etapas, respostas, fluxos, configurações) |
| `src/background.ts` | Service worker: única parte que fala com as APIs de IA |

---

## ⚠️ Aviso

Este projeto não tem relação com o WhatsApp nem com a Meta. Ele depende da estrutura do WhatsApp Web, que muda sem aviso.
Use com bom senso: automações de envio em massa podem violar os termos de uso do WhatsApp. Por isso, nenhuma automação
desta extensão envia mensagens sozinha.

## 📄 Licença

Copyright © 2026 Victor Leon

Este programa é software livre: você pode redistribuí-lo e modificá-lo sob os termos da
[GNU General Public License versão 3](LICENSE), publicada pela Free Software Foundation.
Ele é distribuído na esperança de ser útil, mas **sem nenhuma garantia**. Veja o arquivo [LICENSE](LICENSE) para os detalhes.

A fonte [Geist](https://github.com/vercel/geist-font) é distribuída sob a SIL Open Font License (veja `public/fonts/Geist-OFL-LICENSE.txt`)
e os ícones são do [Phosphor Icons](https://phosphoricons.com/) (MIT).
