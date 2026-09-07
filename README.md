# Chácara Agenda

Monorepo inicial para a gestão de agendamentos de uma chácara.

## Estrutura

- `apps/web`: painel administrativo em React + Vite.
- `apps/api`: API REST em Express.

## Executar

```powershell
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

A API inicia em `http://localhost:3333` e o painel em `http://localhost:5173`.

## Banco local

O PostgreSQL de desenvolvimento está definido em `docker-compose.yml`. Para iniciá-lo, execute `docker compose up -d`. Em seguida, `npm run db:migrate` aplica as migrations do Prisma e `npm run db:seed` inclui dados de demonstração.

Para recriar o banco do zero (isso apaga somente os dados locais do Docker), execute `docker compose down -v`, depois `docker compose up -d` e rode as migrations novamente.

A API lê `DATABASE_URL`. Copie `apps/api/.env.example` para `apps/api/.env` ao usar uma ferramenta que carregue arquivos `.env`; em produção, configure a mesma variável no provedor com a URL do PostgreSQL gerenciado.

## Próximos passos

O armazenamento atual da API é propositalmente em memória para validar a experiência. A próxima etapa é conectar PostgreSQL/Supabase, autenticação e pagamentos.
