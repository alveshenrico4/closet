# Closet — guarda-roupa virtual

App para escanear roupas, remover o fundo automaticamente e montar looks
arrastando as peças na tela — sem precisar vestir nada.

## Como rodar localmente

Pré-requisito: Node.js 18 ou mais recente.

```bash
npm install
npm start
```

Depois abra `http://localhost:3000`.

Na primeira vez que você enviar uma foto, o servidor baixa o modelo de IA
usado para remover o fundo (pacote `@imgly/background-removal-node`). Isso
precisa de internet nessa primeira execução; depois o modelo fica em cache
local. Se o download falhar por qualquer motivo, o app não quebra: a peça é
salva com a foto original mesmo assim.

## Como funciona

- **Backend** (`server.js`): Express + Multer para upload, remoção de fundo
  automática, e um arquivo `db.json` como banco de dados simples (peças e
  looks salvos).
- **Frontend** (`public/`): HTML/CSS/JS puro, sem framework, conversando com
  o backend via `fetch`.
- Fotos ficam em `public/uploads/originals` (foto enviada) e
  `public/uploads/processed` (já sem fundo, em PNG).

## Rotas da API

| Método | Rota              | O que faz                                  |
|--------|-------------------|---------------------------------------------|
| GET    | `/api/items`       | lista as peças do guarda-roupa              |
| POST   | `/api/items`       | envia uma foto (`photo`) + `category`       |
| PATCH  | `/api/items/:id`   | atualiza categoria/nome de uma peça         |
| DELETE | `/api/items/:id`   | remove uma peça (e os arquivos de imagem)   |
| GET    | `/api/looks`       | lista os looks salvos                       |
| POST   | `/api/looks`       | salva um look (`name` + `pieces`)           |
| DELETE | `/api/looks/:id`   | remove um look salvo                        |

## Deploy

Funciona em qualquer serviço que rode Node.js: Render, Railway, Fly.io, um
VPS comum, etc. Passos gerais:

1. Suba o código pro serviço escolhido (git push ou upload).
2. Configure o comando de start como `npm start` (ele já roda `node server.js`).
3. Garanta que a pasta `public/uploads` seja **persistente** (em alguns
   serviços "serverless"/containers efêmeros os arquivos somem a cada
   deploy — nesse caso, troque o armazenamento de arquivo por um bucket tipo
   S3/Cloudflare R2 antes de ir pra produção séria).
4. `db.json` também precisa estar num disco persistente pelo mesmo motivo.
   Para múltiplos usuários de verdade, o próximo passo natural é trocar esse
   arquivo por um banco real (Postgres, SQLite com volume, etc).

## Próximos passos sugeridos

- Contas de usuário (hoje o guarda-roupa é compartilhado por quem acessa o servidor)
- Trocar `db.json` por um banco de dados de verdade
- Sugestão automática de combinações por cor/categoria
- Exportar o look montado como imagem (PNG) pra compartilhar
