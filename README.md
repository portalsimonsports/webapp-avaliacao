# WebApp Avaliação — PWA

PWA móvel hospedada no GitHub Pages, mantendo Google Apps Script + Google Sheets como backend.

## Estrutura

- `index.html` — interface de acesso
- `styles.css` — layout responsivo
- `app.js` — login, sessão e módulos
- `config.js` — URL pública do Apps Script
- `manifest.webmanifest` — instalação como PWA
- `sw.js` — service worker/cache
- `icon-192.svg` e `icon-512.svg` — ícones da aplicação
- `AppsScript_Backend.gs` — backend base para autenticação na planilha

## Próximos passos

1. Ajustar `ID_PLANILHA`, `ABA_USUARIOS` e os cabeçalhos no `AppsScript_Backend.gs` para refletirem a base real.
2. Implantar o Apps Script como Web App.
3. Colar a URL `/exec` em `config.js`.
4. Ativar GitHub Pages usando a branch `main` e a pasta `/root`.
5. Abrir a página no celular e usar `Adicionar à tela inicial` / `Instalar app`.

## Segurança

A base inicial mantém compatibilidade com a estrutura atual de credenciais. Recomenda-se migrar posteriormente para hash de senha e sessão persistente/validada no backend.
