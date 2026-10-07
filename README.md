# WA Local CRM

Extensão (Chrome/Edge, Manifest V3) que adiciona um CRM local ao WhatsApp Web: Kanban em tela cheia, etiquetas ao lado dos contatos, respostas rápidas com `/` e chat dentro dos cards.

**Privacidade:** todos os dados ficam no navegador (`chrome.storage.local` e IndexedDB). Nada é enviado a servidores externos.

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
- **Chat no card:** expanda um card para ler e responder a conversa sem sair do Kanban (só mensagens de texto aparecem).
- **Painel do contato** (☰ ou Alt+P): etapa, valor, tags, tarefas com prazo, notas.
- **Lista de conversas:** etapa e tags ao lado do nome.
- **Respostas rápidas:** digite `/` no chat. Variáveis: `{nome}`, `{primeiro_nome}`, `{saudacao}`, `{data}`.
- **Regras:** se a mensagem recebida contém uma palavra, sugere uma resposta.
- **Backup** em JSON e **diagnóstico** (aba Dados do painel).

## Estrutura

- `src/utils/domSelectors.ts`: todos os seletores do WhatsApp (ajuste aqui quando o WhatsApp mudar).
- `src/content/`: entrada, observer, injeção em Shadow DOM, lista de conversas.
- `src/components/`: Kanban, painel, popup de respostas.
- `src/storage/`: IndexedDB e `chrome.storage.local`.

## Aviso

O WhatsApp muda o DOM com frequência e a extensão depende dele. Use com moderação: automações de envio podem violar os termos do WhatsApp.
