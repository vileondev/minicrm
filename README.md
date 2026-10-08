# WA Local CRM

Extensão (Chrome/Edge, Manifest V3) que adiciona um CRM local ao WhatsApp Web: Kanban em tela cheia, etiquetas ao lado dos contatos, respostas rápidas com `/` e chat dentro dos cards.

**Privacidade:** todos os dados ficam no navegador (`chrome.storage.local` e IndexedDB). Nada é enviado a servidores externos, exceto se você ligar o assistente de IA: nesse caso, o nome do contato e até 30 mensagens de texto da conversa analisada vão para a API que você escolheu, com a sua chave. A chave fica só neste navegador e não entra no backup.

## Instalação (Edge ou Chrome)

```bash
npm install
npm run build
```

1. Abra `edge://extensions` (ou `chrome://extensions`) e ative o **Modo do desenvolvedor**.
2. **Carregar sem pacote** e escolha a pasta `dist`.
3. Recarregue `https://web.whatsapp.com`.

Depois de mudar o código: `npm run build`, recarregue a extensão e dê F5 no WhatsApp.

## Recursos

- **Kanban** (botão ▦ ou Alt+K): arraste leads entre etapas, edite etapas, busque e filtre por tag, exporte CSV, importe as conversas visíveis.
- **Tarefas e Relatório** (abas no topo do Kanban): todas as tarefas abertas agrupadas por prazo (atrasadas, hoje, 7 dias…) com "Amanhã" e "Conversa"; relatório do funil com quantos passaram por cada etapa, conversão para a etapa seguinte, tempo médio e valor ponderado.
- **Valor ponderado:** cada etapa tem uma chance de fechar (engrenagem da coluna); o topo mostra valor × chance. Lead sem etapa usa a nota da IA.
- **Grupos e internos:** grupos ficam fora do funil por padrão (botão "Grupos"); qualquer contato pode ser marcado como interno (olho no card ou no painel) e sai do funil, das métricas e dos fluxos.
- **Chat no card:** expanda um card para ler e responder a conversa sem sair do Kanban. Mídia aparece como marcador ([áudio], [foto], [figurinha]…).
- **Número do contato:** o WhatsApp não mostra mais o número nas mensagens. No painel, "Ler do perfil" abre os dados do contato, lê o número e vincula ao lead (ou digite manualmente).
- **Painel do contato** (☰ ou Alt+P): etapa, valor, tags, tarefas com prazo, notas.
- **Lista de conversas:** etapa e tags ao lado do nome.
- **Respostas rápidas:** digite `/` no chat. Variáveis: `{nome}`, `{primeiro_nome}`, `{saudacao}`, `{data}`.
- **Fluxos de automação (locais):** aba Fluxos do painel. Gatilhos: mensagem recebida contém palavras, lead entra na etapa, tag adicionada, lead parado N dias na etapa. Ações: mover etapa, adicionar ou remover tag, criar tarefa, adicionar nota, avisar, sugerir resposta rápida. Há modelos prontos (follow-up, pediu preço, pós-venda). Nenhuma ação envia mensagem.
- **Assistente de IA (opcional):** aba IA do painel e botão Analisar nos cards. Desligado por padrão. Com a sua chave (Anthropic, OpenAI ou Google Gemini) ele lê as últimas mensagens de texto da conversa e atualiza temperatura (quente, morno, frio), resumo, próximo passo, tarefa, reunião (com .ics) e etapa no CRM. Sugere um rascunho de resposta que você revisa e envia. A chamada à API sai do service worker da extensão, só quando você ativa e usa.
- **Backup** em JSON e **diagnóstico** (aba Dados do painel).

## Estrutura

- `src/utils/domSelectors.ts`: todos os seletores do WhatsApp (ajuste aqui quando o WhatsApp mudar).
- `src/content/`: entrada, observer, injeção em Shadow DOM, lista de conversas.
- `src/components/`: Kanban, painel, popup de respostas.
- `src/storage/`: IndexedDB e `chrome.storage.local`.
- `src/content/automation.ts`: motor de fluxos. `src/content/ai.ts` e `src/background.ts`: assistente de IA (a chamada de rede fica no service worker).

## Aviso

O WhatsApp muda o DOM com frequência e a extensão depende dele. Use com moderação: automações de envio podem violar os termos do WhatsApp.
