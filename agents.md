\# AGENTS.md



Guia para agentes de código (Claude Code, Codex, Cursor etc.) e para qualquer pessoa que entre no projeto. \*\*Leia o arquivo inteiro antes de alterar qualquer coisa.\*\* Se este arquivo e o código divergirem, pare e pergunte: não "corrija" nenhum dos dois em silêncio.



> \*\*Idiomas.\*\* Código, nomes de tabelas, rotas, variáveis e mensagens de commit em \*\*inglês\*\*. Textos de interface, e-mails, mensagens de erro exibidas ao usuário e este documento em \*\*português do Brasil\*\*.



\## Sumário



1\. Visão do produto

2\. Princípios de engenharia e regras para agentes

3\. Stack

4\. Estrutura do repositório

5\. Comandos

6\. Variáveis de ambiente

7\. Convenções de código

8\. Modelo de dados

9\. Regras de negócio (agenda, estoque, status, preço e combos)

10\. Autenticação e segurança

11\. API

12\. Frontend: arquitetura

13\. Telas e fluxos

14\. Identidade visual e design system

15\. Catálogo de estilos de festa (temas)

16\. Voz, copy e microcopy

17\. E-mails transacionais

18\. Acessibilidade, performance e SEO

19\. Testes

20\. Deploy, CI e operação

21\. Roadmap por fases

22\. Fora do escopo e extensões futuras

23\. Decisões em aberto e suposições

24\. Definition of Done



\---



\## 1. Visão do produto



\### 1.1 O que é



Sistema web para um negócio local de \*\*aluguel de chácara para eventos\*\* e \*\*decoração "pegue e monte"\*\* (o cliente retira os itens e monta a decoração sozinho). O uso típico é festa: aniversário infantil e adulto, chá de bebê, chá revelação, chá de panela, confraternização, casamento no campo, festa junina, churrasco.



O sistema tem \*\*dois ambientes no mesmo SPA React\*\*:



| Ambiente | Quem usa | Função |

|---|---|---|

| \*\*Cliente\*\* (`/`) | Público e clientes logados | Conhecer a chácara (landing page com fotos e boa apresentação), escolher datas, montar o pedido com itens e combos, acompanhar reservas |

| \*\*Admin\*\* (`/admin`) | Dono/equipe | Calendário, aprovação de reservas, catálogo de itens, combos, temas, preços, galeria, clientes, configurações |



\### 1.2 Fluxo principal



1\. A pessoa chega na landing page, se encanta com as fotos e vê as datas livres.

2\. Escolhe o dia (ou intervalo de dias) e o número de convidados. (O tipo de evento também era perguntado aqui; saiu em outubro de 2026, a pedido do dono, ver o registro na seção 8.)

3\. Escolhe itens "pegue e monte", filtrando por estilo/tema. Combos aplicam desconto automaticamente. (Desde novembro de 2026, a pedido do dono: escolhe uma decoração completa, que sai pelo preço com a chácara, e os estilos e os combos saíram. Quem aluga só a decoração escolhe entre retirar na chácara e receber no endereço. Ver 9.12 e 13.2.)

4\. Vê o resumo com o preço calculado pelo servidor.

5\. Entra ou cria conta (e-mail com confirmação por token, ou Google).

6\. Envia o \*\*pedido de reserva\*\*. A reserva nasce `PENDING` e \*\*segura as datas\*\* por tempo limitado.

7\. O admin confirma (ou recusa). O cliente recebe e-mail em cada mudança de status.



\### 1.3 Objetivos do MVP



\- Reservar em menos de 3 minutos, no celular (a maior parte do público chega pelo celular).

\- \*\*Zero dupla reserva\*\*, mesmo com requisições simultâneas.

\- O admin opera sozinho, sem precisar de um desenvolvedor para trocar preço, foto ou item.

\- O admin consegue lançar \*\*reserva manual\*\* (cliente que fechou pelo WhatsApp).



\### 1.4 Glossário (use estes termos, no código e na UI)



| Termo (UI, pt-BR) | Nome no código | Significado |

|---|---|---|

| Reserva | `Booking` | Pedido de uso da chácara em um ou mais dias, com itens opcionais |

| Diária | `daily` | Valor de um dia de uso da chácara; varia por regra de preço |

| Item | `Item` | Peça de decoração/mobiliário do pegue e monte, com estoque. Desde novembro de 2026, cada item é uma \*\*decoração completa\*\*, e é assim que o site o chama; o pedido leva uma só (9.12) |

| Preço com a chácara | `venuePriceCents` | Preço da decoração quando a reserva é da chácara. Nunca acima do preço avulso (`priceCents`), que vale para a reserva só de decoração (9.12) |

| Retirada, entrega | `fulfillment` (`PICKUP`, `DELIVERY`) | Como a decoração da reserva só de decoração chega à festa. A taxa de entrega é combinada com a chácara e não entra no total (9.12) |

| Endereço de entrega | `User.address`, `Booking.deliveryAddress` | O endereço do perfil do cliente. A reserva com entrega guarda uma cópia dele (9.12) |

| Combo | `Combo` | Conjunto de itens com desconto quando levados juntos. Saiu do site em novembro de 2026: o orçamento não aplica mais combo, e o painel guarda os cadastrados (9.6) |

| Estilo (tema) | `Theme` | Linha estética da festa (Rústico Boho, Nuvens, Tropical...). Agrupa itens e combos. Saiu do site em novembro de 2026: a landing e o wizard não filtram mais por estilo, e o painel continua cadastrando |

| Tipo de evento | — | Removido em outubro de 2026 (seção 8): a reserva não guarda mais o tipo de festa. Não use o termo no código novo |

| Pegue e monte | — | Serviço em que o cliente retira os itens e monta a decoração |

| Bloqueio | `BlockedDate` | Dia indisponível definido pelo admin (manutenção, uso próprio) |

| Segurar datas | `holdExpiresAt` | Reserva `PENDING` ocupa as datas até expirar |

| Pedido de reserva | — | Como a UI chama a reserva enquanto está `PENDING` |

| Sinal | `Payment` (`DEPOSIT`) | Primeiro valor que o cliente paga, anotado pelo dono no plano de pagamento (9.11) |

| Parcela | `Payment` (`INSTALLMENT`) | Cada parte do que falta depois do sinal. Quando é uma só, chama "À vista" (sem sinal) ou "Restante" (depois do sinal) |

| Plano de pagamento | `PaymentPlan` | O sinal e as parcelas de uma reserva, que somam o total dela (9.11) |

| Recebimento | `paidOn` | O dia em que o dinheiro de um sinal ou de uma parcela entrou, anotado pelo dono |

| Financeiro | — | Tela do painel com os vencimentos do mês, o que está em atraso e as reservas sem pagamento anotado (13.4) |



\---



\## 2. Princípios de engenharia e regras para agentes



\### 2.1 Princípios



1\. \*\*Mínimo e autocontido.\*\* Prefira a solução mais simples que resolve o problema. Sem camadas, padrões ou bibliotecas "por precaução". Três linhas parecidas são melhores que uma abstração errada.

2\. \*\*O servidor é a fonte da verdade.\*\* Preço, disponibilidade, estoque e permissões são decididos na API. O front só exibe.

3\. \*\*Dinheiro e datas são fontes clássicas de bug.\*\* Dinheiro em centavos inteiros; datas como `YYYY-MM-DD` (seção 7).

4\. \*\*Snapshot no que foi contratado.\*\* Preços, combos e totais são gravados na reserva. Mudar o catálogo depois nunca altera reservas existentes.

5\. \*\*Segurança por padrão.\*\* Validar toda entrada, guardar só hash de token, nunca confiar no cliente.

6\. \*\*Regra de negócio tem teste.\*\* Mudou preço, combo, disponibilidade ou status? Atualize os testes e este arquivo.



\### 2.2 Sempre



\- Ler a seção relevante deste arquivo antes de implementar.

\- Validar toda rota com Zod (`body`, `params`, `querystring`) e tipar a resposta.

\- Usar `request.log` para logs. Nunca `console.log`.

\- Usar os tokens de design (`var(--...)`) no CSS. Nunca hex direto em componente.

\- Escrever textos de interface em pt-BR seguindo a seção 16.

\- Rodar `pnpm typecheck \&\& pnpm lint \&\& pnpm test` antes de dar a tarefa por concluída.

\- Criar \*\*nova migration\*\* para qualquer mudança de schema.



\### 2.3 Nunca



\- Calcular preço no front ou confiar em valor de preço vindo do cliente.

\- Usar `any`, `@ts-ignore` ou desabilitar regra de lint sem comentário justificando.

\- Guardar token, senha ou segredo em texto puro. Commitar `.env`.

\- Editar uma migration já aplicada.

\- Guardar access token em `localStorage`.

\- Adicionar dependência fora da lista da seção 3 sem justificar por escrito no PR.

\- Usar personagens, marcas ou imagens licenciadas (Disney, Marvel, Turma da Mônica etc.) em fotos, nomes de itens, temas ou textos. O catálogo usa descrições genéricas ("Painel de balões arco-íris", não "Painel do personagem X").

\- Expor dados de outros clientes em qualquer rota pública (a disponibilidade mostra só livre/ocupado/bloqueado).



\### 2.4 Pergunte antes de



\- Mudar constraints do banco, fluxo de autenticação ou regras de preço/combos.

\- Adicionar pagamento, notificações por WhatsApp ou qualquer integração externa.

\- Trocar tipografia, paleta ou a forma-assinatura do design (seção 14).



\---



\## 3. Stack



| Camada | Escolha | Observações |

|---|---|---|

| Runtime | Node.js LTS ativo (>= 22), pnpm workspaces | Um `pnpm-lock.yaml` na raiz |

| Linguagem | TypeScript `strict` | API e web |

| API | Fastify | Plugins do ecossistema `@fastify/\*` |

| Validação | Zod + `fastify-type-provider-zod` | Schemas compartilhados em `packages/shared` |

| ORM/DB | Prisma + PostgreSQL | Migrations com SQL manual quando preciso (constraint de sobreposição) |

| Auth | JWT (`@fastify/jwt`), `@fastify/cookie`, `argon2`, `google-auth-library` | Seção 10 |

| E-mail | `nodemailer` (SMTP) ou Resend | Uma função `sendMail` em `lib/mailer.ts` |

| Segurança HTTP | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` | |

| Front | React + Vite + React Router + TanStack Query | SPA |

| Estilo | \*\*CSS puro\*\* com custom properties + CSS Modules | Sem Tailwind, sem biblioteca de componentes |

| Calendário | `react-day-picker` | Única exceção de UI, calendário próprio custa caro |

| Testes | Vitest (API e web), Testing Library (só onde vale), Playwright (1 smoke do fluxo de reserva) | |

| Lint/format | ESLint + Prettier | Configuração padrão |

| Deploy | API + Postgres na Render, SPA na Vercel | Seção 20 |



\*\*Dependências permitidas além das da tabela:\*\* nenhuma sem justificativa. Não use: Redux/Zustand (estado do servidor fica no TanStack Query, o resto em `useState`/`useReducer`), react-hook-form, axios, moment, lodash, bibliotecas de componentes (MUI, Chakra, shadcn etc.), Tailwind.



\---



\## 4. Estrutura do repositório



```

.

├── AGENTS.md

├── package.json                 # scripts da raiz

├── pnpm-workspace.yaml

├── docker-compose.yml           # Postgres local

├── apps/

│   ├── api/

│   │   ├── prisma/

│   │   │   ├── schema.prisma

│   │   │   ├── migrations/

│   │   │   └── seed.ts          # admin, settings, temas e categorias iniciais

│   │   ├── src/

│   │   │   ├── server.ts        # sobe o app (listen)

│   │   │   ├── app.ts           # monta o Fastify (usado nos testes com inject)

│   │   │   ├── config/env.ts    # valida process.env com Zod

│   │   │   ├── plugins/         # prisma, auth (hooks), errors, cors, rate-limit

│   │   │   ├── modules/

│   │   │   │   ├── auth/        # routes.ts + service.ts

│   │   │   │   ├── users/

│   │   │   │   ├── availability/

│   │   │   │   ├── pricing/     # quote.ts (função pura) + routes

│   │   │   │   ├── bookings/

│   │   │   │   ├── items/

│   │   │   │   ├── combos/

│   │   │   │   ├── themes/

│   │   │   │   ├── gallery/

│   │   │   │   ├── settings/

│   │   │   │   └── admin/       # rotas /admin/\* que reaproveitam os services

│   │   │   ├── lib/             # money.ts, dates.ts, tokens.ts, mailer.ts, errors.ts

│   │   │   └── jobs/            # expire-holds.ts, complete-bookings.ts (rodam via cron)

│   │   └── test/

│   └── web/

│       ├── index.html           # meta tags, JSON-LD, preload da fonte

│       ├── vercel.json          # rewrite /api/\* -> API na Render

│       └── src/

│           ├── main.tsx

│           ├── app/             # router.tsx, providers.tsx, guards.tsx

│           ├── api/             # client.ts (fetch + refresh) e hooks por módulo

│           ├── features/

│           │   ├── landing/

│           │   ├── auth/

│           │   ├── booking/     # wizard de reserva

│           │   ├── account/     # minhas reservas

│           │   └── admin/       # dashboard, calendar, bookings, finance, items, combos, themes, prices, gallery, customers, settings

│           ├── components/      # Button, Field, Dialog, Toast, ArchFrame, Money, StatusBadge...

│           ├── styles/          # tokens.css, themes.css, base.css

│           └── lib/             # format.ts (BRL, datas pt-BR), storage.ts (try/catch)

└── packages/

&#x20;   └── shared/

&#x20;       └── src/                 # schemas Zod, enums, labels pt-BR (status, tipo de reserva)

```



\*\*Padrão de módulo da API:\*\* `routes.ts` (schemas + handlers finos) e `service.ts` (regra de negócio + Prisma). Não crie camada de "repository": o Prisma já é a camada de dados. O admin reaproveita os services, não duplica lógica.



\*\*Por que `packages/shared`:\*\* só para schemas Zod, enums e rótulos pt-BR compartilhados. Impede que API e front divirjam nos contratos. Não coloque regra de negócio aqui.



\---



\## 5. Comandos



```bash

pnpm i                                        # instala tudo

docker compose up -d db                       # Postgres local

cp apps/api/.env.example apps/api/.env        # preencher segredos

pnpm --filter api prisma migrate dev          # aplica migrations

pnpm --filter api prisma db seed              # admin, settings, temas

pnpm dev                                      # api :3333 + web :5173 (web faz proxy de /api)



pnpm typecheck                                # tsc --noEmit em todos os pacotes

pnpm lint

pnpm test                                     # vitest (API usa banco de teste)

pnpm --filter api job:expire-holds            # roda o job manualmente

```



\---



\## 6. Variáveis de ambiente



Validadas em `apps/api/src/config/env.ts` com Zod. A API \*\*não sobe\*\* se faltar variável obrigatória. Mantenha `.env.example` sempre atualizado, sem valores reais.



| Variável | Onde | Descrição |

|---|---|---|

| `NODE\_ENV` | api | `development` \\| `test` \\| `production` |

| `PORT` | api | Padrão `3333` |

| `DATABASE\_URL` | api | Conexão Postgres |

| `JWT\_SECRET` | api | Mínimo 32 bytes aleatórios |

| `JWT\_ACCESS\_TTL` | api | Padrão `15m` |

| `REFRESH\_TTL\_DAYS` | api | Padrão `30` |

| `APP\_URL` | api | URL pública do SPA, usada nos links dos e-mails |

| `CORS\_ORIGIN` | api | Só em desenvolvimento (em produção o front usa o proxy `/api`) |

| `GOOGLE\_CLIENT\_ID` | api | Audience para validar o `id\_token` |

| `SMTP\_URL` ou `RESEND\_API\_KEY` | api | Envio de e-mail |

| `MAIL\_FROM` | api | Remetente, ex.: `Chácara <no-reply@dominio.com.br>` |

| `ADMIN\_EMAIL`, `ADMIN\_PASSWORD` | api (seed) | Cria o primeiro admin |

| `VITE\_GOOGLE\_CLIENT\_ID` | web | Login com Google |

| `VITE\_API\_URL` | web | Padrão `/api` |



\---



\## 7. Convenções de código



\### 7.1 Geral



\- TypeScript `strict`, sem `any`. Prefira `type` a `interface`, salvo extensão real.

\- ESM em todo o repositório. Imports absolutos por alias curto (`@/`) no web.

\- Arquivos em `kebab-case.ts`, componentes React em `PascalCase.tsx`, hooks em `useCamelCase.ts`.

\- Funções pequenas e nomeadas pelo que fazem. Comentário explica \*\*por quê\*\*, não \*\*o quê\*\*.

\- Erros de domínio: `throw new AppError(code, status, message)` (em `lib/errors.ts`). Um único error handler converte para a resposta padrão (seção 11.1).

\- Formatação: Prettier padrão. Não discuta estilo no PR, deixe o formatter decidir.



\### 7.2 Dinheiro



\- \*\*Sempre inteiro em centavos\*\* (`priceCents`, `totalCents`). Nunca `float`, nunca `Decimal` no código.

\- Formatação só na borda da UI, com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` (componente `<Money cents={...} />`).

\- Percentual de desconto é inteiro de 1 a 100. Arredondar com `Math.round` no \*\*desconto\*\*, nunca no total.



\### 7.3 Datas



\- Dias de reserva são \*\*datas sem fuso\*\* (`@db.Date`), trafegam como string `YYYY-MM-DD`.

\- Fuso do negócio: `America/Sao\_Paulo`. "Hoje" é calculado nesse fuso (`lib/dates.ts → todayInSaoPaulo()`).

\- Nunca use `new Date('2026-12-24')` para lógica de calendário (interpreta como UTC e desloca o dia). Use os helpers de `lib/dates.ts` (`parseISODate`, `toISODate`, `eachDay`, `addDays`, `dayOfWeek`).

\- Timestamps (`createdAt`, `expiresAt`) são `timestamptz` em UTC.

\- A reserva com `startDate === endDate` é de \*\*um dia\*\*. O intervalo é \*\*inclusivo\*\* nas duas pontas.



\### 7.4 Git



\- Commits no padrão Conventional Commits: `feat(api): add pricing quote`, `fix(web): keep step on 409`.

\- Branches: `feat/...`, `fix/...`, `chore/...`. PRs pequenos, uma preocupação por PR.

\- Migrations entram no mesmo PR da mudança que as exige.



\---



\## 8. Modelo de dados



Fonte: `apps/api/prisma/schema.prisma`. Regras gerais: dinheiro em `Int` (centavos), datas de reserva em `@db.Date`, ids `uuid`, campos de auditoria `createdAt`/`updatedAt` onde fizer sentido.



> Ajuste o bloco `generator` conforme a versão do Prisma instalada. O restante do schema não depende disso.



> \*\*Registro da T32 (outubro de 2026).\*\* A reserva só de decoração acrescentou `Booking.kind` (`VENUE` | `DECORATION`, padrão `VENUE`), `BlockedDate.scope` (`VENUE` | `DECORATION` | `BOTH`, padrão `VENUE`) e tornou `Booking.guestCount` opcional (nulo só na decoração). O bloco abaixo é o da especificação original; a fonte da verdade é o `schema.prisma`, e as regras estão na 9.10.

> \*\*Registro (outubro de 2026): sem tipo de evento.\*\* A pedido do dono, a pergunta "Que festa é?" saiu do wizard e o conceito saiu do sistema inteiro: `Booking.eventType` e o enum `EventType` foram removidos pela migration `20261026225848_drop_event_type` (o tipo das reservas já gravadas se perdeu junto), e com eles `eventTypeSchema`, `EVENT_TYPE_LABELS` e a sugestão de estilo por tipo de evento (15.1). O corpo de `POST /bookings` e da reserva manual não tem mais o campo, e as telas que diziam "Chá de bebê para 40 pessoas" dizem "Chácara para 40 pessoas". Em produção, a API com a migration sobe antes do site: a API antiga exige o campo e recusaria os pedidos do site novo. Os blocos abaixo ainda mostram o campo, como registro da especificação original.

> \*\*Registro (novembro de 2026): plano de pagamento.\*\* A pedido do dono, o painel passou a anotar o sinal e as parcelas de cada reserva. A migration `20261102002222_payment_plan` criou o enum `PaymentKind` (`DEPOSIT` | `INSTALLMENT`) e a tabela `Payment` (`bookingId`, `kind`, `number`, `dueDate`, `amountCents`, `paidOn`; as duas datas em `@db.Date`), com único em (`bookingId`, `number`), índice em `dueDate`, `onDelete: Cascade` a partir da reserva e três CHECKs manuais: valor maior que zero, número de 0 a 12, e o número 0 só para o sinal. A reserva não mudou: o plano divide o total dela no tempo. As regras estão na 9.11. Em produção, a API com a migration sobe antes do site, que chama as rotas novas.

> \*\*Registro (novembro de 2026): decoração completa, preço com a chácara, retirada ou entrega.\*\* A pedido da dona, cada item virou uma decoração completa, com dois preços, e os combos e os estilos saíram do site. A migration `20261102212329_decoration_delivery` acrescentou `Item.venuePriceCents` (obrigatório, preenchido com o `priceCents` de cada item, ou seja, sem promoção até a dona mudar), o enum `FulfillmentMethod` (`PICKUP` ou `DELIVERY`), `Booking.fulfillment`, `Booking.deliveryAddress` (JSON, a cópia do endereço) e `User.address` (JSON, um endereço por conta), com três CHECKs manuais: `item_venue_price_range` (de zero ao preço avulso), `booking_fulfillment_by_kind` (modalidade só na decoração, e obrigatória nela) e `booking_delivery_address` (endereço copiado se e só se for entrega). As reservas de decoração já gravadas ficaram como retirada, que era o único jeito que existia. As regras estão na 9.12. Em produção, a API com a migration sobe antes do site: o site novo chama `GET /items/availability` e grava o endereço pelo `PATCH /me`, que a API antiga não conhece.



```prisma

generator client {

&#x20; provider = "prisma-client-js"

}



datasource db {

&#x20; provider = "postgresql"

&#x20; url      = env("DATABASE\_URL")

}



enum Role          { CLIENT ADMIN }

enum BookingStatus { PENDING CONFIRMED CANCELLED COMPLETED }

enum DiscountType  { PERCENT FIXED\_PRICE }

enum TokenType     { EMAIL\_VERIFY PASSWORD\_RESET }

enum GalleryKind   { HERO VENUE EVENTS }



enum EventType {

&#x20; BIRTHDAY\_KIDS      // aniversário infantil

&#x20; BIRTHDAY\_ADULT     // aniversário adulto

&#x20; BABY\_SHOWER        // chá de bebê

&#x20; GENDER\_REVEAL      // chá revelação

&#x20; BRIDAL\_SHOWER      // chá de panela / lingerie

&#x20; WEDDING            // casamento, noivado

&#x20; GRADUATION         // formatura

&#x20; GET\_TOGETHER       // confraternização, churrasco

&#x20; OTHER

}



model User {

&#x20; id               String    @id @default(uuid())

&#x20; name             String

&#x20; email            String?   @unique   // nulo apenas para clientes criados pelo admin sem e-mail

&#x20; phone            String?             // WhatsApp, obrigatório para reservar

&#x20; passwordHash     String?             // nulo para conta só com Google ou criada pelo admin

&#x20; googleId         String?   @unique

&#x20; emailVerifiedAt  DateTime?

&#x20; termsAcceptedAt  DateTime?

&#x20; role             Role      @default(CLIENT)

&#x20; createdAt        DateTime  @default(now())

&#x20; updatedAt        DateTime  @updatedAt



&#x20; bookings      Booking\[]

&#x20; authTokens    AuthToken\[]

&#x20; refreshTokens RefreshToken\[]

}



// Confirmação de e-mail e redefinição de senha. Guarda apenas o HASH do token.

model AuthToken {

&#x20; id        String    @id @default(uuid())

&#x20; userId    String

&#x20; type      TokenType

&#x20; tokenHash String    @unique

&#x20; expiresAt DateTime

&#x20; usedAt    DateTime?

&#x20; createdAt DateTime  @default(now())



&#x20; user User @relation(fields: \[userId], references: \[id], onDelete: Cascade)



&#x20; @@index(\[userId, type])

}



// Refresh token com rotação e detecção de reuso (familyId).

model RefreshToken {

&#x20; id        String    @id @default(uuid())

&#x20; userId    String

&#x20; familyId  String

&#x20; tokenHash String    @unique

&#x20; expiresAt DateTime

&#x20; revokedAt DateTime?

&#x20; createdAt DateTime  @default(now())



&#x20; user User @relation(fields: \[userId], references: \[id], onDelete: Cascade)



&#x20; @@index(\[userId])

&#x20; @@index(\[familyId])

}



// Linha única (id = 1). Configurações do negócio editáveis pelo admin.

model VenueSettings {

&#x20; id                   Int     @id @default(1)

&#x20; name                 String

&#x20; baseDailyPriceCents  Int                       // usada quando nenhuma PriceRule se aplica

&#x20; maxGuests            Int

&#x20; minDays              Int     @default(1)

&#x20; maxDays              Int     @default(3)

&#x20; minLeadDays          Int     @default(2)       // antecedência mínima para reservar

&#x20; freeCancelUntilDays  Int     @default(7)       // cancelamento pelo cliente até X dias antes do início

&#x20; holdHours            Int     @default(48)      // quanto tempo uma reserva PENDING segura as datas

&#x20; maxPendingPerUser    Int     @default(3)

&#x20; checkInTime          String  @default("08:00")

&#x20; checkOutTime         String  @default("22:00")

&#x20; whatsapp             String?

&#x20; address              String?

&#x20; mapsUrl              String?

&#x20; houseRules           String?                   // texto simples, mostrado na landing e no resumo

}



// Variação da diária: por dia da semana, por período, ou ambos. Vence a de maior priority.

model PriceRule {

&#x20; id         String    @id @default(uuid())

&#x20; name       String                               // "Fim de semana", "Réveillon", "Feriado prolongado"

&#x20; dayOfWeek  Int?                                 // 0 (domingo) a 6 (sábado); nulo = qualquer dia

&#x20; startDate  DateTime? @db.Date                   // nulo = sem início

&#x20; endDate    DateTime? @db.Date                   // nulo = sem fim

&#x20; priceCents Int

&#x20; priority   Int       @default(0)

&#x20; active     Boolean   @default(true)

}



model Category {

&#x20; id        String @id @default(uuid())

&#x20; name      String @unique                        // Painéis, Mesas, Arcos, Iluminação, Lúdicos...

&#x20; sortOrder Int    @default(0)

&#x20; items     Item\[]

}



model Theme {

&#x20; id            String  @id @default(uuid())

&#x20; slug          String  @unique                   // rustico-boho, nuvens-e-estrelas...

&#x20; name          String

&#x20; tagline       String?                           // uma frase curta

&#x20; description   String?

&#x20; palette       Json                              // \[{ "name": "Sálvia", "hex": "#A7B8A1" }, ...]

&#x20; coverImageUrl String?

&#x20; sortOrder     Int     @default(0)

&#x20; active        Boolean @default(true)



&#x20; items  ItemTheme\[]

&#x20; combos Combo\[]

}



model Item {

&#x20; id            String  @id @default(uuid())

&#x20; categoryId    String

&#x20; name          String

&#x20; description   String?

&#x20; imageUrl      String?

&#x20; priceCents    Int

&#x20; stock         Int                                // unidades disponíveis por dia

&#x20; assemblyNotes String?                            // dicas de montagem (pegue e monte)

&#x20; active        Boolean @default(true)

&#x20; sortOrder     Int     @default(0)



&#x20; category     Category      @relation(fields: \[categoryId], references: \[id])

&#x20; themes       ItemTheme\[]

&#x20; comboItems   ComboItem\[]

&#x20; bookingItems BookingItem\[]



&#x20; @@index(\[categoryId])

}



model ItemTheme {

&#x20; itemId  String

&#x20; themeId String

&#x20; item    Item  @relation(fields: \[itemId], references: \[id], onDelete: Cascade)

&#x20; theme   Theme @relation(fields: \[themeId], references: \[id], onDelete: Cascade)



&#x20; @@id(\[itemId, themeId])

}



model Combo {

&#x20; id            String       @id @default(uuid())

&#x20; name          String

&#x20; description   String?

&#x20; imageUrl      String?

&#x20; themeId       String?

&#x20; discountType  DiscountType

&#x20; discountValue Int                                // PERCENT: 1..100 | FIXED\_PRICE: centavos do combo fechado

&#x20; active        Boolean      @default(true)



&#x20; theme Theme?       @relation(fields: \[themeId], references: \[id])

&#x20; items ComboItem\[]

}



model ComboItem {

&#x20; comboId  String

&#x20; itemId   String

&#x20; quantity Int    @default(1)



&#x20; combo Combo @relation(fields: \[comboId], references: \[id], onDelete: Cascade)

&#x20; item  Item  @relation(fields: \[itemId], references: \[id])



&#x20; @@id(\[comboId, itemId])

}



model Booking {

&#x20; id                 String        @id @default(uuid())

&#x20; userId             String

&#x20; startDate          DateTime      @db.Date

&#x20; endDate            DateTime      @db.Date        // inclusivo

&#x20; eventType          EventType

&#x20; guestCount         Int

&#x20; status             BookingStatus @default(PENDING)

&#x20; holdExpiresAt      DateTime?                     // só enquanto PENDING



&#x20; // Snapshot financeiro (centavos). Nunca recalcular depois de criado.

&#x20; dailyBreakdown     Json                          // \[{ date, priceCents, ruleName }]

&#x20; dailyTotalCents    Int

&#x20; itemsTotalCents    Int

&#x20; discountTotalCents Int

&#x20; totalCents         Int

&#x20; appliedCombos      Json                          // \[{ comboId, name, times, discountCents }]



&#x20; customerNotes      String?

&#x20; adminNotes         String?

&#x20; createdByAdmin     Boolean       @default(false) // reserva manual (WhatsApp)

&#x20; cancelledBy        Role?

&#x20; cancelReason       String?

&#x20; createdAt          DateTime      @default(now())

&#x20; updatedAt          DateTime      @updatedAt



&#x20; user  User          @relation(fields: \[userId], references: \[id])

&#x20; items BookingItem\[]



&#x20; @@index(\[status, startDate])

&#x20; @@index(\[userId])

}



model BookingItem {

&#x20; id             String @id @default(uuid())

&#x20; bookingId      String

&#x20; itemId         String

&#x20; itemName       String                            // snapshot

&#x20; quantity       Int

&#x20; unitPriceCents Int                               // snapshot



&#x20; booking Booking @relation(fields: \[bookingId], references: \[id], onDelete: Cascade)

&#x20; item    Item    @relation(fields: \[itemId], references: \[id])



&#x20; @@index(\[bookingId])

&#x20; @@index(\[itemId])

}



model BlockedDate {

&#x20; date   DateTime @id @db.Date

&#x20; reason String?

}



model GalleryImage {

&#x20; id        String      @id @default(uuid())

&#x20; kind      GalleryKind

&#x20; url       String

&#x20; alt       String                                 // obrigatório: acessibilidade e SEO

&#x20; caption   String?

&#x20; sortOrder Int         @default(0)

&#x20; active    Boolean     @default(true)

}

```



\### 8.1 Migration manual: sem sobreposição de reservas



O Prisma não expressa \*exclusion constraint\*. Crie uma migration vazia (`prisma migrate dev --create-only --name booking\_no\_overlap`) e edite o SQL:



```sql

\-- Impede duas reservas ativas (PENDING/CONFIRMED) com dias em comum.

\-- Range inclusivo nas duas pontas. Não precisa de btree\_gist (só há a coluna de range).

ALTER TABLE "Booking"

&#x20; ADD CONSTRAINT booking\_no\_overlap

&#x20; EXCLUDE USING gist (daterange("startDate", "endDate", '\[]') WITH \&\&)

&#x20; WHERE (status IN ('PENDING', 'CONFIRMED'));



ALTER TABLE "Booking"

&#x20; ADD CONSTRAINT booking\_dates\_order CHECK ("endDate" >= "startDate");

```



Ao capturar o erro do Postgres (`23P01`, exclusion\_violation), o service converte para `AppError('DATE\_UNAVAILABLE', 409)`.



> \*\*Desde a T32\*\* o predicado também exige `kind = 'VENUE'`: reserva só de decoração não ocupa a data da chácara (9.10). A troca está na migration `20261021110945_booking_kind`, com drop e create na mesma transação.



\### 8.2 Seed



`prisma db seed` cria, de forma idempotente: o admin (`ADMIN\_EMAIL`/`ADMIN\_PASSWORD`, e-mail já verificado), `VenueSettings` (linha 1), as categorias iniciais, os \*\*temas da seção 15\*\* (nome, tagline, paleta) e algumas `PriceRule` de exemplo (fim de semana). Não crie itens falsos em produção.



\---



\## 9. Regras de negócio



\### 9.1 Disponibilidade de datas



Um dia está:



\- `blocked`: existe `BlockedDate` para o dia.

\- `booked`: existe reserva `PENDING` (não expirada) ou `CONFIRMED` cobrindo o dia.

\- `past`: anterior a hoje + `minLeadDays`.

\- `free`: nenhum dos anteriores.



Uma reserva é válida se: todos os dias estão `free`, `minDays <= dias <= maxDays`, `guestCount <= maxGuests` e `startDate <= endDate`.



`PENDING` com `holdExpiresAt` no passado \*\*não\*\* ocupa datas (o job de expiração só limpa o status; a consulta de disponibilidade já ignora expiradas, então não depende do job rodar na hora).



> Atenção: a exclusion constraint da seção 8.1 considera `PENDING` como ocupando datas. Por isso, ao criar uma reserva, o service \*\*primeiro\*\* cancela (na mesma transação) qualquer `PENDING` expirada que se sobreponha ao intervalo pedido. Sem isso, uma reserva vencida bloquearia a data até o job rodar.



\### 9.2 Máquina de estados da reserva



| De | Para | Quem | Regras |

|---|---|---|---|

| (novo) | `PENDING` | Cliente ou admin | Define `holdExpiresAt = now + holdHours` (admin manual pode criar já `CONFIRMED`) |

| `PENDING` | `CONFIRMED` | Admin | Limpa `holdExpiresAt`. Envia e-mail de confirmação |

| `PENDING` | `CANCELLED` | Cliente, admin ou job | Cliente sem restrição de prazo. Job usa `cancelReason = 'HOLD\_EXPIRED'` |

| `CONFIRMED` | `CANCELLED` | Admin sempre; cliente só até `freeCancelUntilDays` antes do início | Fora do prazo: erro `CANCEL\_WINDOW\_CLOSED` orientando a falar pelo WhatsApp |

| `CONFIRMED` | `COMPLETED` | Job (dia seguinte ao `endDate`) ou admin | |



Qualquer outra transição responde `422 INVALID\_TRANSITION`. Cada transição dispara o e-mail correspondente (seção 17).



\### 9.3 Estoque dos itens



O `stock` de um item é \*\*por dia\*\*. Para cada item pedido, em cada dia do intervalo:



```

reservado(dia) = Σ quantity dos BookingItem de reservas ativas (PENDING não expiradas + CONFIRMED) que cobrem o dia

disponível(dia) = item.stock - reservado(dia)

```



O pedido só é aceito se `quantity <= disponível(dia)` \*\*em todos os dias\*\* do intervalo. Itens inativos (`active = false`) são recusados.



\*\*Concorrência:\*\* a criação da reserva roda em \*\*uma transação\*\* que (1) trava as linhas de `Item` envolvidas em ordem de id (`SELECT id FROM "Item" WHERE id = ANY($1) ORDER BY id FOR UPDATE`), (2) confere estoque, (3) insere a reserva (a constraint 8.1 protege as datas). Ordenar por id evita deadlock entre duas reservas simultâneas.

> \*\*Desde novembro de 2026\*\* o wizard mostra o estoque livre antes do envio. `GET /items/availability?from=&to=` devolve, para cada decoração ativa, o `freeStock` do pior dia do período, com a mesma conta desta seção e zero onde a decoração está fechada (9.10). `GET /availability?itemId=` usa a mesma conta para a agenda de uma decoração (9.12). As duas são só informação: quem decide no envio continua sendo a transação.



\### 9.4 Preço da diária



Para cada dia do intervalo:



1\. Candidatas: `PriceRule` ativas em que (`dayOfWeek` é nulo \*\*ou\*\* igual ao dia da semana) \*\*e\*\* (o dia está entre `startDate` e `endDate`, com nulos significando aberto).

2\. Vence a de maior `priority`. Empate: a que tem `startDate`/`endDate` (mais específica) e, depois, a de menor `id` (determinístico).

3\. Sem candidata: `VenueSettings.baseDailyPriceCents`.



O resultado por dia vai em `dailyBreakdown` (`{ date, priceCents, ruleName }`), e `dailyTotalCents` é a soma.



\### 9.5 Preço dos itens e combos



```

itemsTotal = Σ (quantity × item.priceCents)

discount   = Σ desconto dos combos aplicados (9.6)

total      = dailyTotal + itemsTotal - discount

```



\*\*Pedido de itens é por reserva\*\* (não por dia): o cliente paga o item uma vez pelo período. (Ver decisão em aberto 23.)

> \*\*Desde novembro de 2026\*\* o preço do item depende do produto da reserva: na chácara (`VENUE`) vale `item.venuePriceCents`, o preço com a chácara, e na decoração sozinha (`DECORATION`), `item.priceCents`, o avulso. O orçamento não aplica combo (9.6), então sai com `combos: []` e `discountTotalCents: 0`, e `total = dailyTotal + itemsTotal`. O `unitPriceCents` do snapshot guarda o preço que valeu.



\### 9.6 Algoritmo de combos



> \*\*Fora de uso desde novembro de 2026.\*\* A pedido da dona, o preço com a chácara (9.12) tomou o lugar dos combos, e o pedido do site leva uma decoração só. O orçamento chama o cálculo com a lista de combos vazia, e nada é descontado. O `applyCombos`, os testes dele, a prévia e o CRUD do painel ficaram, para o caso de os combos voltarem. As reservas antigas guardam os combos que tinham (`appliedCombos`), e o detalhe da reserva continua mostrando. O texto abaixo descreve o algoritmo como ele é.



Um combo se aplica quando o pedido contém \*\*todos\*\* os itens do combo nas quantidades definidas. Regras:



\- \*\*Não acumula sobre o mesmo item.\*\* Cada unidade de item participa de no máximo um combo.

\- \*\*Um combo pode se repetir\*\* se as quantidades permitirem (2 kits iguais = 2 aplicações).

\- \*\*Tipos:\*\* `PERCENT` (desconto = `round(soma dos itens do combo × pct / 100)`) e `FIXED\_PRICE` (desconto = `max(0, soma dos itens do combo - discountValue)`). Desconto nunca é negativo.

\- \*\*Escolha (gulosa):\*\* enquanto algum combo couber no saldo do pedido, aplica o de \*\*maior economia\*\*; empate, menor `id`. Consome as quantidades e repete.



A escolha gulosa não é ótima em todos os casos (dois combos concorrentes por um item raro). Isso é aceito no MVP e coberto por teste com o comportamento esperado. Se virar problema real, troque por busca exaustiva (o número de combos ativos é pequeno).



Implementação (função pura, sem Prisma, em `modules/pricing/quote.ts`):



```ts

type CartLine = { itemId: string; quantity: number; unitPriceCents: number };

type ComboDef = {

&#x20; id: string;

&#x20; name: string;

&#x20; discountType: 'PERCENT' | 'FIXED\_PRICE';

&#x20; discountValue: number;

&#x20; items: { itemId: string; quantity: number }\[];

};

type AppliedCombo = { comboId: string; name: string; times: number; discountCents: number };



export function applyCombos(lines: CartLine\[], combos: ComboDef\[]) {

&#x20; const remaining = new Map(lines.map((l) => \[l.itemId, l.quantity]));

&#x20; const price = new Map(lines.map((l) => \[l.itemId, l.unitPriceCents]));

&#x20; const applied = new Map<string, AppliedCombo>();



&#x20; const fits = (c: ComboDef) => c.items.every((i) => (remaining.get(i.itemId) ?? 0) >= i.quantity);

&#x20; const savings = (c: ComboDef) => {

&#x20;   const base = c.items.reduce((s, i) => s + i.quantity \* (price.get(i.itemId) ?? 0), 0);

&#x20;   const d = c.discountType === 'PERCENT'

&#x20;     ? Math.round((base \* c.discountValue) / 100)

&#x20;     : base - c.discountValue;

&#x20;   return Math.max(0, d);

&#x20; };



&#x20; const sorted = \[...combos].sort((a, b) => a.id.localeCompare(b.id));

&#x20; for (;;) {

&#x20;   let best: { combo: ComboDef; saving: number } | null = null;

&#x20;   for (const c of sorted) {

&#x20;     if (!fits(c)) continue;

&#x20;     const s = savings(c);

&#x20;     if (s > 0 \&\& (!best || s > best.saving)) best = { combo: c, saving: s };

&#x20;   }

&#x20;   if (!best) break;

&#x20;   for (const i of best.combo.items) remaining.set(i.itemId, remaining.get(i.itemId)! - i.quantity);

&#x20;   const prev = applied.get(best.combo.id);

&#x20;   applied.set(best.combo.id, {

&#x20;     comboId: best.combo.id,

&#x20;     name: best.combo.name,

&#x20;     times: (prev?.times ?? 0) + 1,

&#x20;     discountCents: (prev?.discountCents ?? 0) + best.saving,

&#x20;   });

&#x20; }

&#x20; const list = \[...applied.values()];

&#x20; return { applied: list, discountTotalCents: list.reduce((s, a) => s + a.discountCents, 0) };

}

```



\### 9.7 Quote e criação usam o mesmo código



`POST /pricing/quote` e `POST /bookings` chamam a mesma `computeQuote()`. Na criação, o cliente envia `expectedTotalCents`; se o total recalculado for diferente, a API responde `409 PRICE\_CHANGED` com o novo quote, e a UI mostra o novo valor para o cliente aceitar. O cliente nunca paga um valor que não viu.



\### 9.8 Reserva manual (admin)



O admin cria reservas para clientes que fecharam por fora. Pode escolher um cliente existente ou criar um novo com \*\*nome + telefone\*\* (e-mail opcional, sem senha). Pode criar já `CONFIRMED`. As mesmas regras de disponibilidade e estoque valem. Se depois a pessoa se cadastrar com o mesmo e-mail e a conta não tiver senha nem Google, o cadastro \*\*assume\*\* essa conta após a confirmação do e-mail.



\### 9.9 Jobs



Scripts em `apps/api/src/jobs/`, executados por \*\*Cron Job da Render\*\* (não dentro do processo da API):



| Job | Frequência | O que faz |

|---|---|---|

| `expire-holds` | a cada 15 min | `PENDING` com `holdExpiresAt < now` vira `CANCELLED` (`cancelReason = 'HOLD\_EXPIRED'`) e avisa o cliente |

| `complete-bookings` | diário | `CONFIRMED` com `endDate < hoje` vira `COMPLETED` |



Os dois são idempotentes e seguros para rodar duas vezes.



\### 9.10 Reserva só de decoração (T32)



A dona aluga a chácara e também só a decoração (pegue e monte), para festa em outro lugar. `Booking.kind` diz o que a reserva contrata: `VENUE` (a chácara, com ou sem itens) ou `DECORATION` (só os itens). A regra central é que \*\*a decoração não mexe na agenda da chácara\*\*, nos dois sentidos.



| Regra | Chácara (`VENUE`) | Só decoração (`DECORATION`) |

|---|---|---|

| Ocupa a data no site | Sim (constraint da 8.1) | Não |

| Dias | `minDays` a `maxDays` | Um dia de uso (`startDate === endDate`) |

| Convidados | Obrigatório, até `maxGuests` | Não existe (`guestCount` nulo) |

| Diária | Pela regra de preço (9.4) | Não cobra (`days: []`, `dailyTotalCents: 0`) |

| Itens | Opcionais | Pelo menos um |

| Combos, antecedência, prazo e cancelamento | Iguais | Iguais |



\*\*O estoque conta os dois produtos.\*\* O painel que saiu para a chácara e o que saiu sozinho são o mesmo painel (9.3). Como a decoração não passa pela constraint de datas, a trava das linhas de `Item` na transação é o que decide a corrida pelo último item.



\*\*O bloqueio tem escopo\*\* (`BlockedDate.scope`): `VENUE` é o padrão e o bloqueio de sempre (fecha só a chácara); `DECORATION` fecha a saída de decoração, e nenhum item sai naquele dia, nem junto com a chácara (o estoque do dia vira zero); `BOTH` fecha os dois. `GET /availability` aceita `?kind=` e devolve a agenda de cada produto; a da decoração nunca fica `booked`.



O calendário do painel mostra a agenda da chácara e, por cima, as decorações que saem no dia e a decoração fechada. A ocupação do mês conta só dias de chácara. A reserva manual (9.8) lança os dois tipos, com as mesmas regras.



Decisões da dona: o bloqueio de data é só da chácara; a antecedência mínima é a mesma; a decoração é de um dia de uso; não há convidados.

> \*\*Desde novembro de 2026\*\* o pedido do site leva uma decoração só, os combos não se aplicam mais, cada produto tem o seu preço de decoração e a decoração sozinha escolhe entre retirada e entrega (9.12).



\### 9.11 Plano de pagamento e financeiro (novembro de 2026)



O cliente paga por fora (Pix, dinheiro, transferência) e o dono anota no painel o que combinou e o que recebeu. É \*\*controle do dono, não pagamento online\*\*: o site não cobra, não mostra o plano ao cliente e não manda lembrete (seção 22). O caso que originou o pedido: reserva de R$ 500, sinal de R$ 300 abatido na hora, e os R$ 200 que faltam numa data que o dono escolhe.



| Regra | Como funciona |

|---|---|

| Linhas | No máximo um sinal (`DEPOSIT`, número 0) e de 0 a 12 parcelas (`INSTALLMENT`, números 1 a 12), com pelo menos uma linha |

| Soma | Sinal + parcelas = `Booking.totalCents`, ao centavo. O total é o snapshot da reserva e não muda (2.1) |

| Numeração | As parcelas são numeradas pelo vencimento a cada salvamento; no mesmo dia, fica a ordem em que vieram |

| Nome | "Sinal"; uma parcela só é "À vista" (sem sinal) ou "Restante" (depois do sinal); com mais de uma, "Parcela 2 de 3" (`paymentLabel`, em `packages/shared`) |

| Recebimento | `paidOn` é o dia em que o dinheiro entrou, nunca depois de hoje no fuso da chácara (7.3) |

| Situação | Calculada na leitura, nunca gravada: `PAID` com `paidOn`; `CANCELLED` se a reserva foi cancelada e o dinheiro não entrou; `OVERDUE` se venceu antes de hoje; senão `PENDING`. Vencer hoje ainda não é atraso |

| Quando | Plano em reserva `PENDING` (o sinal costuma vir antes da confirmação), `CONFIRMED` e `COMPLETED`. A `CANCELLED` não aceita plano novo (`PAYMENT\_PLAN\_LOCKED`), mas aceita anotar recebimento, porque o sinal pode ter entrado antes |

| Excluir | Só sem recebimento anotado (`PAYMENT\_PLAN\_LOCKED` se houver): apagar seria perder o registro de dinheiro que entrou |



\*\*O plano é salvo inteiro.\*\* O painel manda o sinal e todas as parcelas, e a API troca as linhas da reserva numa transação que primeiro trava a linha da reserva (`SELECT ... FOR UPDATE`): dois salvamentos ao mesmo tempo terminam em "o último vence", e não em erro do índice único. Anotar ou desfazer um recebimento mexe numa linha só (`PATCH /admin/payments/:id`) e passa pela mesma trava, para não cruzar com uma exclusão.



\*\*O editor sugere, a API decide.\*\* O painel divide o que falta em partes iguais, com o centavo que sobra na primeira, e um vencimento por mês a partir da primeira data (dia 31 vira o último dia do mês curto, contado sempre da primeira). A primeira data sugerida é o dia da festa, ou hoje se ela já passou. O dono muda a data e o valor de cada parcela; mudar o número de vezes, a primeira data ou o sinal refaz a sugestão. O que já foi recebido quando o editor abriu fica travado: para mudar, desfaz-se o recebimento no cartão. A API confere a soma, as datas e os limites.



\*\*O financeiro do mês conta pelo vencimento\*\*, não pelo dia em que o dinheiro entrou: a parcela de dezembro recebida em novembro entra em dezembro. A parcela em aberto de reserva cancelada não entra em nada; a recebida continua contando, porque o dinheiro entrou. "Em atraso" junta todos os meses. "Sem pagamento registrado" lista as reservas `CONFIRMED` ou `COMPLETED` que começam no mês, com total maior que zero e sem nenhuma linha: é o que o dono ainda não anotou, inclusive o pagamento à vista, que não vira plano sozinho ao confirmar.



\### 9.12 Decoração completa, preço com a chácara, retirada ou entrega (novembro de 2026)



A pedido da dona, cada item do catálogo passou a ser uma decoração completa, e o pedido do site leva \*\*uma\*\*, uma vez (`hasOneDecorationAtMost`, em `packages/shared`, com a mensagem `ONE_DECORATION_ERROR`). Os estilos e os combos saíram do site. No lugar dos combos, cada decoração tem dois preços.



| Regra | Chácara (`VENUE`) | Só decoração (`DECORATION`) |

|---|---|---|

| Decoração no pedido | Opcional, no máximo uma | Obrigatória, exatamente uma |

| Preço da decoração | `venuePriceCents`, o preço com a chácara | `priceCents`, o avulso |

| Como chega à festa | Já está na chácara (`fulfillment` nulo) | `PICKUP` (retirada na chácara) ou `DELIVERY` (entrega no endereço), obrigatório no pedido do cliente |

| Endereço | Não se aplica | Na entrega, o do perfil, copiado em `Booking.deliveryAddress` |

| Taxa de entrega | Não se aplica | Combinada com a chácara, fora do total. A revisão, a confirmação, o detalhe e os e-mails dizem isso |



\*\*O preço com a chácara\*\* nunca passa do avulso (`VENUE_PRICE_ABOVE_PRICE_ERROR` na API, CHECK `item_venue_price_range` no banco). Igual ao avulso é "sem promoção", e aí a landing e o wizard mostram um preço só.



\*\*O endereço\*\* é um por conta, em `User.address`, no formato do `addressInputSchema` (`packages/shared`): CEP com exatamente 8 números, rua, número, complemento opcional, bairro, cidade e UF (uma das 27). O cliente cadastra em "Meu perfil" (13.3) ou no próprio pedido, num diálogo (`AddressDialog`). Com os 8 números do CEP, o diálogo busca rua, bairro, cidade e UF no ViaCEP, direto do navegador (`lib/cep.ts`) e sem passar pela API; tudo continua editável, e quem valida é a API. Na entrega, a criação da reserva copia o endereço do perfil; sem endereço salvo, responde `VALIDATION_ERROR` no campo `fulfillment`. Mudar o endereço depois não muda a reserva. `DELETE /me` apaga o endereço do perfil, e a cópia que a reserva guardou fica com ela, como o resto do histórico (10.8).



\*\*A agenda de uma decoração.\*\* `GET /availability?itemId=` devolve a agenda do produto com a decoração por cima: o dia em que todo o estoque dela já saiu, por reserva de qualquer produto, fica `booked`, e o dia em que a decoração está fechada fica `blocked`. Decoração inativa ou desconhecida responde 404. É o calendário de quem chega pela decoração da landing. `GET /items/availability?from=&to=` dá o estoque livre de todas no período (9.3), e é com ele que o passo da decoração mostra a que está "Em uso nessa data".



\*\*Reserva manual (9.8).\*\* O painel não pergunta a modalidade: decoração lançada sem `fulfillment` fica como retirada. O painel continua aceitando mais de uma decoração na mesma reserva.



Decisões da dona: a taxa de entrega é combinada, não calculada pelo site; um endereço por conta; a troca de e-mail com código de confirmação fica para depois (seção 22).



\---



\## 10. Autenticação e segurança



\### 10.1 Visão geral



| Item | Decisão |

|---|---|

| Access token | JWT HS256, TTL 15 min, claims `sub`, `role`, `iat`, `exp`. Fica \*\*só em memória\*\* no SPA |

| Refresh token | Valor aleatório (32 bytes, base64url), guardado como \*\*hash SHA-256\*\* no banco. Cookie `httpOnly; Secure; SameSite=Strict; Path=/api/auth` |

| Rotação | A cada `/auth/refresh` o token é trocado. Reuso de um token já usado revoga a \*\*família inteira\*\* (`familyId`) |

| Senha | `argon2id`, mínimo 8 e máximo 128 caracteres. Sem regras de composição irritantes |

| E-mail | Normalizado (`trim` + minúsculas) antes de qualquer consulta |

| Login social | Google, via `id\_token` validado na API |

| Papéis | `CLIENT` e `ADMIN`. Admin só é criado por seed (ou por outro admin no futuro) |



\*\*Cookie e domínio.\*\* O SPA fica na Vercel e a API na Render: são sites diferentes, e Safari/ITP bloqueia cookie de terceiros. Por isso, em produção o SPA chama \*\*`/api/\*` no próprio domínio\*\* e a Vercel faz o \*rewrite\* para a API (`vercel.json`). Para o navegador é same-origin, o cookie é de primeiro nível e não há CORS. Alternativa equivalente: domínio próprio com `app.dominio.com.br` e `api.dominio.com.br` (mesmo site, `SameSite=Lax`). Em dev, o Vite faz proxy de `/api`.



\### 10.2 Cadastro com e-mail e senha



1\. `POST /auth/register` `{ name, email, password, phone?, acceptTerms: true }`.

2\. Cria `User` com `emailVerifiedAt = null`, `termsAcceptedAt = now`.

3\. Gera token de confirmação (32 bytes aleatórios), grava o \*\*hash\*\* em `AuthToken` (`EMAIL\_VERIFY`, validade 24 h, uso único) e envia o link `APP\_URL/verificar-email?token=...`.

4\. A rota do SPA `/verificar-email` chama `POST /auth/verify-email { token }` (não use GET para mudar estado: pré-visualizadores de e-mail abrem links).

5\. Token válido: marca `emailVerifiedAt`, `usedAt`, e já abre a sessão (retorna access token e seta o cookie).

6\. \*\*Login é bloqueado\*\* até a confirmação (`403 EMAIL\_NOT\_VERIFIED`), com opção de reenviar (`POST /auth/resend-verification`).



\*\*Sem enumeração de contas:\*\* `register`, `resend-verification` e `forgot-password` respondem `202` com a mesma mensagem existindo ou não o e-mail. Se o e-mail já existe, o usuário recebe um e-mail avisando ("você já tem conta"). Erros de login usam mensagem genérica (`INVALID\_CREDENTIALS`).



\### 10.3 Login com Google



1\. O SPA usa o Google Identity Services e obtém um `id\_token` (credential).

2\. `POST /auth/google { idToken }`. A API valida com `google-auth-library` (`audience = GOOGLE\_CLIENT\_ID`) e \*\*exige `email\_verified = true`\*\*.

3\. Busca por `googleId` (`sub`). Não achou: busca por e-mail. Achou: \*\*vincula\*\* (`googleId`, `emailVerifiedAt`). Não achou: cria usuário já verificado.

4\. Retorna access token e seta o cookie de refresh.



Isso evita redirect OAuth no backend e mantém tudo em uma rota. Se no futuro entrar outro provedor (Apple, Facebook), a estrutura é a mesma: só muda a validação do token.



\### 10.4 Sessão no SPA



\- Ao carregar, o SPA chama `POST /auth/refresh` (cookie) e, se der certo, guarda o access token em memória. Enquanto isso, exibe um estado de carregamento (não pisca a tela de login).

\- O `client.ts` injeta `Authorization: Bearer ...`. Em `401`, faz \*\*um\*\* refresh (com trava para várias requisições em paralelo esperarem o mesmo refresh) e repete a requisição. Se falhar, limpa a sessão e vai para `/entrar?next=...`.

\- Logout: `POST /auth/logout` revoga o refresh token e limpa o cookie.



\### 10.5 Redefinição de senha



`POST /auth/forgot-password` cria `AuthToken` `PASSWORD\_RESET` (validade 1 h, uso único). `POST /auth/reset-password { token, password }` troca a senha, marca o token usado e \*\*revoga todos os refresh tokens\*\* do usuário.

\*\*Troca de senha logado\*\* (novembro de 2026, em "Meu perfil"). `POST /auth/change-password { currentPassword, newPassword }` exige sessão e a senha atual, recusa a nova igual à atual, troca o hash, \*\*revoga todos os refresh tokens\*\* e devolve uma sessão nova (access token e cookie), para este aparelho continuar conectado e os outros caírem. Senha atual errada responde `400 VALIDATION\_ERROR` no campo `currentPassword`, e não `401`: o `401` dispararia o refresh e a repetição do `client.ts` (10.4), e um erro de digitação derrubaria a sessão. Conta só com Google (`hasPassword: false` na sessão) não tem senha para trocar, e o perfil não oferece. Limite: 5 por minuto por usuário. A troca de e-mail com código de confirmação fica para depois (seção 22): até lá, o e-mail aparece no perfil só para leitura.



\### 10.6 Autorização



\- Decorator `app.authenticate` (verifica o JWT) e `app.requireRole('ADMIN')`, aplicados como hooks. Todo o prefixo `/admin` usa os dois.

\- Rotas de cliente (`/bookings/\*`, `/me`) sempre filtram por `userId` do token. Acesso a reserva de outra pessoa retorna `404` (não `403`), para não confirmar a existência.

\- O papel vem do \*\*banco\*\* em rotas sensíveis (mudança de papel não pode esperar o token expirar). Para o resto, o claim é suficiente.



\### 10.7 Limites e proteções



| Proteção | Regra |

|---|---|

| Rate limit | `login`: 5/min por IP + e-mail. `register`: 5/h por IP. `resend-verification` e `forgot-password`: 3/h por e-mail. `change-password`: 5/min por usuário. Global: 100/min por IP |

| Helmet | Ativo. CSP restritiva no front (`index.html`/Vercel headers) permitindo só Google Identity e fontes usadas. Desde o mapa do "Como chegar" (13.1), `frame-src` também precisa de `https://www.google.com`, de onde vem a ficha incorporada (`/maps/embed`). O `https://maps.google.com` da busca por endereço deixou de ser usado em novembro de 2026. Desde a busca do CEP (9.12), `connect-src` também precisa de `https://viacep.com.br`, que o navegador chama direto |

| CORS | Só em dev. Em produção, sem CORS (proxy same-origin) |

| CSRF | Cookie `SameSite=Strict` + `Path=/api/auth` + checagem de `Origin` em `refresh` e `logout` |

| Corpo | Limite de 100 KB por requisição |

| Proxy | `trustProxy: true` na Render para o rate limit enxergar o IP real |

| Logs | Nunca logar senha, token, cookie ou `id\_token`. Redigir `authorization` e `cookie` no pino |

| Erros | Nunca devolver stack trace nem mensagem interna do Prisma ao cliente |



\### 10.8 LGPD



\- Coletar o mínimo: nome, e-mail, telefone. O endereço só entra para a entrega da decoração, e só se o cliente cadastrar (9.12).

\- Checkbox de aceite dos Termos e da Política de Privacidade no cadastro (`termsAcceptedAt`). As páginas estáticas ficam em `/termos` e `/privacidade`, com link no rodapé do site. (Em novembro de 2026 os links saíram do rodapé enquanto o dono revisava os textos, e voltaram com a revisão pronta. O texto das duas páginas é dele; a política diz que o endereço é guardado para a entrega e que só o CEP vai do navegador ao ViaCEP.)

\- `DELETE /me` (fase 6): anonimiza o usuário (nome, e-mail, telefone e, desde novembro de 2026, o endereço) e mantém as reservas para fins fiscais e históricos, inclusive a cópia do endereço que uma reserva com entrega guardou.

\- Dados de reserva só aparecem para o dono e para o admin.



\---



\## 11. API



\### 11.1 Convenções



\- JSON, `camelCase`. \*\*Todas as rotas vivem sob o prefixo `/api`\*\* (registrado no próprio Fastify: `app.register(routes, { prefix: '/api' })`). As tabelas abaixo omitem o prefixo por brevidade. O rewrite da Vercel e o proxy do Vite repassam `/api/\*` sem reescrever o caminho.

\- Datas de reserva: `"2026-12-24"`. Timestamps: ISO 8601 UTC. Dinheiro: inteiro em centavos com sufixo `Cents`.

\- Listas do admin: `?page=1\&pageSize=20` → `{ items, total, page, pageSize }`.

\- \*\*Erro padrão\*\* (uma única forma, em todos os casos):



```json

{

&#x20; "error": {

&#x20;   "code": "DATE\_UNAVAILABLE",

&#x20;   "message": "Uma ou mais datas escolhidas não estão mais disponíveis.",

&#x20;   "details": { "dates": \["2026-12-24"] }

&#x20; }

}

```



| `code` | HTTP | Quando |

|---|---|---|

| `VALIDATION\_ERROR` | 400 | Zod falhou (`details` traz os campos) |

| `INVALID\_CREDENTIALS` | 401 | Login com e-mail/senha errados |

| `UNAUTHORIZED` | 401 | Sem token, token inválido ou expirado |

| `EMAIL\_NOT\_VERIFIED` | 403 | Login antes da confirmação |

| `FORBIDDEN` | 403 | Papel insuficiente |

| `NOT\_FOUND` | 404 | Recurso não existe (ou não é do usuário) |

| `DATE\_UNAVAILABLE` | 409 | Dia ocupado, bloqueado ou fora da antecedência mínima |

| `STOCK\_INSUFFICIENT` | 409 | Item sem estoque em algum dia (`details.itemId`) |

| `PRICE\_CHANGED` | 409 | Total recalculado difere de `expectedTotalCents` (`details.quote`) |

| `EMAIL\_IN\_USE` | 409 | Só em fluxos autenticados (ex.: trocar e-mail) |

| `INVALID\_TOKEN` | 400 | Token de e-mail/reset inválido, expirado ou usado |

| `INVALID\_TRANSITION` | 422 | Mudança de status não permitida |

| `CANCEL\_WINDOW\_CLOSED` | 422 | Fora do prazo de cancelamento |

| `TOO\_MANY\_PENDING` | 422 | Passou de `maxPendingPerUser` |

| `PAYMENT\_PLAN\_LOCKED` | 422 | Plano de pagamento de reserva cancelada, ou exclusão de plano com recebimento anotado (9.11) |

| `RATE\_LIMITED` | 429 | Rate limit |

| `INTERNAL` | 500 | Qualquer outra coisa (mensagem genérica) |



\### 11.2 Rotas



\*\*Públicas\*\*



| Método | Rota | Descrição |

|---|---|---|

| GET | `/health` | Health check (sem auth) |

| GET | `/public/venue` | Nome, capacidade, horários, WhatsApp, endereço, regras, limites de dias |

| GET | `/availability?from=\&to=` | Estado de cada dia: `free` \\| `booked` \\| `blocked` \\| `past`. `kind=` escolhe a agenda (9.10), e `itemId=` pede a de uma decoração (9.12) |

| GET | `/themes` | Temas ativos (com paleta). Sem uso no site desde novembro de 2026 |

| GET | `/items?themeId=\&categoryId=` | Itens ativos (com temas, categoria e os dois preços) |

| GET | `/items/availability?from=\&to=` | Estoque livre de cada decoração ativa no período, pelo pior dia (9.3). Novembro de 2026 |

| GET | `/combos?themeId=` | Combos ativos com seus itens. Sem uso no site desde novembro de 2026 |

| GET | `/gallery?kind=` | Imagens ativas, ordenadas |

| POST | `/pricing/quote` | Calcula o valor e valida disponibilidade/estoque sem reservar |



\*\*Auth\*\*



| Método | Rota |

|---|---|

| POST | `/auth/register`, `/auth/login`, `/auth/google`, `/auth/refresh`, `/auth/logout` |

| POST | `/auth/verify-email`, `/auth/resend-verification` |

| POST | `/auth/forgot-password`, `/auth/reset-password` |

| POST | `/auth/change-password` (autenticado, 10.5) |



\*\*Cliente (autenticado)\*\*



| Método | Rota | Descrição |

|---|---|---|

| GET | `/me` | Perfil (com `address` e `hasPassword` desde novembro de 2026) |

| PATCH | `/me` | Nome, telefone e endereço (`address`, ou `null` para apagar) |

| POST | `/bookings` | Cria o pedido de reserva |

| GET | `/bookings/me` | Minhas reservas |

| GET | `/bookings/:id` | Detalhe (só do dono) |

| PATCH | `/bookings/:id/cancel` | Cancela (regras 9.2) |



\*\*Admin (`/admin/\*`, papel `ADMIN`)\*\*



| Recurso | Rotas |

|---|---|

| Reservas | `GET /admin/bookings` (filtros `status`, `from`, `to`, `q`), `GET /admin/bookings/:id`, `POST /admin/bookings` (manual), `PATCH /admin/bookings/:id/status`, `PATCH /admin/bookings/:id/notes` |

| Calendário | `GET /admin/calendar?month=YYYY-MM` (reservas + bloqueios), `POST /admin/blocked-dates`, `DELETE /admin/blocked-dates/:date` |

| Pagamentos (9.11) | `GET`, `PUT` (troca o plano inteiro) e `DELETE /admin/bookings/:id/payments`, `PATCH /admin/payments/:id` (`{ paidOn }` registra ou desfaz o recebimento), `GET /admin/finance?month=YYYY-MM` (vencimentos do mês, atrasados de todos os meses, reservas sem pagamento) |

| Itens | CRUD `/admin/items` (incl. `themeIds` e, desde novembro de 2026, `venuePriceCents`), CRUD `/admin/categories` |

| Combos | CRUD `/admin/combos` |

| Temas | CRUD `/admin/themes` |

| Preços | CRUD `/admin/price-rules`, `GET /admin/price-rules/simulate?from=\&to=` |

| Galeria | CRUD `/admin/gallery`, `PATCH /admin/gallery/order` |

| Clientes | `GET /admin/customers`, `POST /admin/customers` (sem senha), `GET /admin/customers/:id` |

| Config | `GET/PUT /admin/settings` |



Regra de exclusão: item, combo e tema \*\*nunca são apagados se já foram usados\*\*; viram `active = false`. Apagar de verdade só quando não há referência.



\### 11.3 Contratos principais



\*\*`GET /availability?from=2026-12-01\&to=2026-12-31`\*\*



```json

{

&#x20; "days": \[

&#x20;   { "date": "2026-12-01", "status": "free" },

&#x20;   { "date": "2026-12-05", "status": "booked" },

&#x20;   { "date": "2026-12-06", "status": "blocked" }

&#x20; ]

}

```



Nunca inclui nome, e-mail ou detalhe de quem reservou. Cache curto (`Cache-Control: public, max-age=30`).



\*\*`POST /pricing/quote`\*\*



```json

// request

{

&#x20; "startDate": "2026-12-05",

&#x20; "endDate": "2026-12-06",

&#x20; "items": \[{ "itemId": "…", "quantity": 2 }]

}



// response

{

&#x20; "available": true,

&#x20; "issues": \[],

&#x20; "days": \[

&#x20;   { "date": "2026-12-05", "priceCents": 180000, "ruleName": "Fim de semana" },

&#x20;   { "date": "2026-12-06", "priceCents": 180000, "ruleName": "Fim de semana" }

&#x20; ],

&#x20; "dailyTotalCents": 360000,

&#x20; "lines": \[

&#x20;   { "itemId": "…", "name": "Painel de balões", "quantity": 2, "unitPriceCents": 12000, "totalCents": 24000 }

&#x20; ],

&#x20; "itemsTotalCents": 24000,

&#x20; "combos": \[{ "comboId": "…", "name": "Combo Nuvens", "times": 1, "discountCents": 4000 }],

&#x20; "discountTotalCents": 4000,

&#x20; "totalCents": 380000

}

```



`issues` lista problemas sem falhar a requisição: `{ "code": "DATE\_UNAVAILABLE", "dates": \[...] }` ou `{ "code": "STOCK\_INSUFFICIENT", "itemId": "…", "available": 1 }`. `available` é `false` quando há qualquer issue.



\*\*`POST /bookings`\*\*



```json

{

&#x20; "startDate": "2026-12-05",

&#x20; "endDate": "2026-12-06",

&#x20; "eventType": "BABY\_SHOWER",

&#x20; "guestCount": 60,

&#x20; "items": \[{ "itemId": "…", "quantity": 2 }],

&#x20; "customerNotes": "Chegamos na sexta à tarde para montar.",

&#x20; "expectedTotalCents": 380000

}

```



Resposta `201` com a reserva completa (status `PENDING`, `holdExpiresAt`, snapshot financeiro). Exige e-mail verificado e telefone no perfil. (Desde outubro de 2026 o corpo não tem `eventType`, ver seção 8; o exemplo acima ficou como registro.)

Desde novembro de 2026 (9.12), `items` leva no máximo uma decoração, com `quantity: 1`, e o corpo tem `fulfillment`: `PICKUP` ou `DELIVERY` na decoração sozinha, obrigatório, e `null` na chácara. A entrega exige endereço no perfil. A resposta traz `fulfillment` e `deliveryAddress`, a cópia do endereço.

Também desde novembro de 2026, cada linha de `items` da reserva gravada (no cliente e no painel) traz `imageUrl`, a foto da decoração (`bookingLineSchema`, em `packages/shared`). Nome, quantidade e preço são snapshot (2.1); a foto não: é lida do catálogo a cada leitura, então trocar a foto no painel muda a foto das reservas antigas também, e as reservas de antes da mudança já aparecem com foto. É nula quando a decoração não tem foto.

```json

{

&#x20; "kind": "DECORATION",

&#x20; "startDate": "2026-12-05",

&#x20; "endDate": "2026-12-05",

&#x20; "guestCount": null,

&#x20; "items": \[{ "itemId": "…", "quantity": 1 }],

&#x20; "fulfillment": "DELIVERY",

&#x20; "customerNotes": null,

&#x20; "expectedTotalCents": 40000

}

```



\*\*`PATCH /admin/bookings/:id/status`\*\*



```json

{ "status": "CANCELLED", "reason": "Data reservada por engano." }

```



`reason` é obrigatório para `CANCELLED`.



\---



\## 12. Frontend: arquitetura



\### 12.1 Rotas



```

/                        Landing (pública)

/reservar                Wizard de reserva (público até o envio)

/entrar                  Login

/cadastro                Cadastro

/verificar-email         Confirma o token do e-mail

/esqueci-senha           Pede o link de redefinição

/redefinir-senha         Define a nova senha (token na query)

/minhas-reservas         Lista do cliente          \[CLIENT]   (?aba=perfil abre "Meu perfil")

/reservas/:id            Detalhe da reserva        \[CLIENT]

/termos  /privacidade    Páginas estáticas



/admin                   Dashboard                 \[ADMIN]

/admin/calendario

/admin/reservas          /admin/reservas/:id    /admin/reservas/nova

/admin/financeiro

/admin/itens             /admin/combos          /admin/temas

/admin/precos            /admin/galeria

/admin/clientes          /admin/configuracoes

```



\- O bundle do admin é carregado com `React.lazy`. O cliente \*\*não baixa\*\* código de admin.

\- Guardas em `app/guards.tsx`: `RequireAuth` e `RequireRole`. Não logado vai para `/entrar?next=<rota>`. Logado sem papel vai para `/`.

\- A landing e o wizard \*\*não exigem login\*\* até o passo final. O rascunho da reserva persiste em `sessionStorage` (sempre com `try/catch`, seção 12.4) para sobreviver ao desvio por login/cadastro.

\- \*\*O rascunho não é carrinho\*\* (outubro de 2026, a pedido do dono). Só o pedido que \*\*chegou à revisão\*\* vai para o `sessionStorage`, e fica lá até ser enviado, mesmo que a pessoa volte um passo para ajustar. Antes da revisão ele vive só na tela, e sair dela o esquece. Cada escolha vinda da landing (`?item=`, `?data=`) começa um pedido novo e descarta o guardado; sem escolha na URL (botão do hero, "Reservar" do cabeçalho, volta do login), o pedido guardado continua de onde parou. Antes, o item da vitrine somava com o que tinha sobrado da visita anterior. (O `?estilo=` saiu com os estilos, em novembro de 2026: o wizard o tira da URL sem efeito.)

\- \*\*Página nova começa do topo\*\* (`app/ScrollToTop.tsx`). Voltar e avançar do navegador ficam com o navegador, e mudança só na query não conta; a troca de passo do wizard rola para o topo por conta própria.



\### 12.2 Estado



| Tipo | Onde vive |

|---|---|

| Dados do servidor (itens, temas, disponibilidade, reservas) | TanStack Query |

| Sessão (access token, usuário) | Contexto de auth em memória |

| Rascunho do wizard | `useReducer` no componente do wizard + espelho em `sessionStorage` a partir da revisão, até o envio (12.1) |

| Estado de UI (dialog aberto, aba) | `useState` local |



Chaves do Query: arrays hierárquicos (`\['items', { categoryId }]`, `\['bookings', 'me']`, `\['admin', 'bookings', filters]`). Mutations invalidam a chave do recurso e nada além. O estoque livre das decorações mora em `\['availability', 'items', range]`, debaixo da agenda: enviar ou cancelar uma reserva já invalida `\['availability']`, e os dois mudam juntos.



\### 12.3 Cliente HTTP (`api/client.ts`)



Um wrapper de `fetch` (≈ 60 linhas): injeta `Authorization`, trata a resposta de erro padrão em uma classe `ApiError { code, status, details }`, faz o refresh único com trava (seção 10.4) e repete a requisição. Os hooks por módulo (`useItems`, `useQuote`, `useCreateBooking`...) só chamam esse wrapper e usam os schemas de `packages/shared` para tipar.



\### 12.4 Armazenamento do navegador



`localStorage`/`sessionStorage` podem falhar (modo privado, cota, políticas). Sempre via `lib/storage.ts`, que encapsula em `try/catch` e devolve `null` em caso de falha. \*\*Nunca\*\* guarde token ou dado pessoal ali. Só rascunho da reserva e preferências de UI.



\### 12.5 Formulários



`useState` + validação com o mesmo schema Zod do servidor (`packages/shared`). Erro por campo, exibido abaixo do campo, com `aria-describedby`. Erro `VALIDATION\_ERROR` da API é mapeado para os campos. Botão de envio desabilita durante a mutation e mostra o rótulo de progresso ("Enviando pedido…").



\### 12.6 Componentes base (`components/`)



`Button`, `Field` (label + input + erro + ajuda), `Select`, `Dialog`/`Drawer`, `Toast`, `Money`, `StatusBadge`, `EmptyState`, `Skeleton`, `ArchFrame` (moldura em arco, seção 14), `ThemeChip`, `QuantityStepper`, `Thumbnail` (a foto pequena da decoração ao lado do nome, desde novembro de 2026). Cada um com CSS Module próprio, consumindo apenas tokens. Não crie um componente antes de haver \*\*duas\*\* telas que precisem dele.



\---



\## 13. Telas e fluxos



\### 13.1 Landing page



Objetivo: fazer a pessoa \*\*sentir a festa na chácara\*\* e chegar às datas em um gesto. Ordem das seções (a ordem é decisão de produto; mude só com aprovação):



1\. \*\*Hero.\*\* Foto grande da chácara em uso (hora dourada, uma festa montada) ocupando a primeira tela, com o nome, uma frase curta e um botão só, "Reservar uma data", que abre o calendário do wizard. Texto centralizado sobre a foto, com entrada em fade na carga (14.8). Mudou em outubro de 2026, a pedido do dono: era o "Hero com verificação de datas", com a foto na moldura em arco e um seletor "Quando é a festa?" com as próximas datas livres. Desde então a landing não consulta a disponibilidade, e o wizard continua aceitando `?data=` para links antigos. Com o "Reservar" do cabeçalho virando link (ver o cabeçalho, logo abaixo da lista), o botão do hero é o único dourado da primeira tela, como a 14.2 pede. Em novembro de 2026, a pedido do dono, o rótulo do botão passou a usar a letra do texto corrido no celular e não quebra linha; a letra maior fica para o desktop.

2\. \*\*A chácara.\*\* Tour por áreas (salão/área coberta, área verde, cozinha, banheiros, estacionamento etc., com o que existir de verdade): foto + duas linhas cada. Capacidade, horários e endereço em bloco de fatos, sem cara de planilha. (Em novembro de 2026, a pedido do dono: os valores do bloco de fatos usam todos a letra de leitura do endereço, e as áreas viraram um carrossel, `VenueCarousel.tsx`. É rolagem nativa com encaixe no centro, sem biblioteca: a foto da vez inteira, as vizinhas menores nas bordas, setas, pontos e, no desktop, o contador. Também a pedido do dono, o carrossel é infinito, da última foto volta para a primeira, e passa sozinho a cada 2 segundos, com botão de pausar e as regras da exceção registrada na 14.8.)

3\. \*\*Galeria\*\* (removida em outubro de 2026, a pedido do dono). Era o mosaico "Festas que já aconteceram aqui", com fotos reais de festas já realizadas e visualização ampliada com navegação por teclado. A seção saiu da landing, e o painel deixou de oferecer a seção "Eventos" da galeria. O tipo `EVENTS` continua no banco, sem uso: a landing ignora foto dele.

4\. \*\*Pegue e monte, como funciona.\*\* Aqui a numeração é legítima, porque é uma sequência real: escolher os itens, retirar, montar e devolver. Três passos curtos. (Desde outubro de 2026 o texto é o do dono: escolher, montar e devolver, sem o passo de retirar e sem a frase de abertura.)

5\. \*\*Estilos\*\* (removida em novembro de 2026, a pedido do dono). Eram os temas da seção 15 em cartões de arco com paleta e uma foto de kit montado, e o clique levava ao wizard com o filtro de tema aplicado. Cada decoração passou a ser completa (9.12), e o site deixou de filtrar por estilo. Os temas continuam no banco e no painel.

5\.1 \*\*Decoração pegue e monte\*\* (acrescentada em outubro de 2026, a pedido do dono; na página, o título é "Decorações", sem frase de abertura). Os itens ativos com estoque, com foto, nome e preço de tabela, filtráveis por categoria; aparece mesmo sem estilo cadastrado. Mostra oito e revela o resto sob pedido. Clicar leva ao wizard com o item já no pedido (`?item=`) e, também a pedido do dono, com "Só a decoração" já escolhido no primeiro passo; a chácara continua a um toque no seletor, e trocar não tira o item do pedido. Desde novembro de 2026, a pedido do dono: o cartão mostra o preço avulso e, quando é menor, a segunda linha "R$ … com a chácara" (9.12); e o clique abre o pedido só de decoração \*\*sem\*\* o passo do tipo, direto no calendário, que só oferece os dias em que aquela decoração está livre (13.2). Ainda em novembro de 2026, também a pedido do dono, a seção fecha com o aviso "Não achou o que queria?" (`features/booking/CustomDecorationRequest.tsx`), com o link "Pedir pelo WhatsApp" para o WhatsApp da chácara e a mensagem pronta. Sem WhatsApp cadastrado, o aviso não aparece.

6\. \*\*Combos\*\* (removida em novembro de 2026, a pedido do dono). Eram os combos ativos mais vantajosos, com quanto o cliente economizava. O preço com a chácara tomou o lugar deles (9.6, 9.12).

7\. \*\*Depoimentos.\*\* Reais, com nome e tipo de evento. Sem depoimento inventado.

8\. \*\*Perguntas frequentes.\*\* Horário, o que está incluso, pode levar decoração própria, como funciona o cancelamento, forma de pagamento, som/horário limite, animais, capacidade.

9\. \*\*Como chegar.\*\* Endereço, mapa (link para o Maps, sem embed pesado por padrão) e botão de WhatsApp. (Desde outubro de 2026, a pedido do dono, a seção também embute o mapa do Google, sem chave de API e com `loading="lazy"`; as ações têm ícone. A política de privacidade avisa que o mapa conecta o navegador ao Google. Em novembro de 2026 o mapa passou a ser a ficha da Donna Belle no Google, incorporada com endereço fixo em `DirectionsSection.tsx`, em vez da busca pelo endereço cadastrado; com isso saíram o link "Abrir no mapa" da landing e o campo "Link do mapa" das configurações. O `mapsUrl` continua no banco e na API, sem uso na tela.)

10\. \*\*Rodapé.\*\* Contato, redes, termos e privacidade. (O Instagram da marca, `@donnabelle.decor`, está fixo no `PublicLayout`: `VenueSettings` não tem campo de rede social. Em novembro de 2026, a pedido do dono, saiu do rodapé o "Você entrou como". Os links dos termos e da privacidade saíram junto enquanto o dono revisava os textos, e voltaram com a revisão pronta, numa terceira coluna no desktop, 10.8.)



Cabeçalho fixo e discreto: logo, "Reservar" (botão principal), "Entrar"/"Minhas reservas". No celular, o botão "Reservar" fica sempre acessível.

> \*\*Registro (outubro de 2026).\*\* A pedido do dono, o cabeçalho mudou:
>
> - \*\*No desktop\*\* (a partir de 760 px), as ações são links alinhados, cada um com o seu ícone: "Reservar", "Minhas reservas" (por extenso) e "Sair" para quem entrou, ou "Entrar" para quem não entrou. O "Reservar" deixou de ser botão dourado.
> - \*\*No celular\*\*, as mesmas ações ficam num menu lateral (`app/layout/SiteMenu.tsx`), aberto pelo botão "Menu". O menu é um `<dialog>` modal, com as regras de gaveta da 14.11: prende o foco, fecha com Escape, pelo fundo ou ao escolher uma opção, e devolve o foco ao botão.
> - O "Reservar" do celular ficou a um toque, dentro do menu; o caminho imediato na landing é o botão do hero.
> - Desde novembro de 2026, quem entrou como `ADMIN` vê também "Painel admin" (para `/admin`), no cabeçalho e no menu lateral. O cliente não vê o atalho; quem protege o painel continua sendo o `RequireRole` e a API (10.6).



\### 13.2 Wizard de reserva (`/reservar`)



Passo na URL (`?step=tipo|data|convidados|decoracao|revisao`) para o botão voltar do navegador funcionar. Rodapé fixo com "Voltar" e "Continuar". O total aparece só na revisão, e é o do orçamento. (A barra de progresso com os passos e as dicas abaixo dos títulos saíram em novembro de 2026, nos ajustes de texto do dono.)

> \*\*Registro (novembro de 2026).\*\* A pedido do dono, o wizard virou uma pergunta por passo. Eram três passos (`datas`, `itens`, `revisao`): o tipo, as datas e os convidados juntos no primeiro; os itens com filtro por estilo, quantidade e aba de combos no segundo; e a estimativa dos itens no rodapé. Os estilos, os combos, a quantidade e a estimativa saíram. Os links antigos `?step=datas` e `?step=itens` caem em `data` e `decoracao`.



Os passos dependem do pedido (`stepsFor`, em `features/booking/steps.ts`):



| Pedido | Passos |

|---|---|

| Chácara | tipo, data, convidados, decoração, revisão |

| Só a decoração | tipo, data, decoração, revisão |

| Decoração vinda da landing (`?item=`) | data, decoração, revisão. Quem clicou numa decoração está alugando a decoração, e o tipo não é perguntado |



| Passo | Conteúdo | Regras |

|---|---|---|

| \*\*Tipo\*\* | "O que você quer reservar?": a chácara (escolhida de início) ou só a decoração, em cartões de rádio | Trocar para a decoração encolhe as datas para o primeiro dia e não apaga o resto |

| \*\*Data\*\* | Calendário (`react-day-picker`): intervalo na chácara, um dia na decoração. Dias `booked`/`blocked`/`past` desabilitados e legenda. Num pedido de decoração com a decoração já escolhida, a agenda é a dela (`?itemId=`, 9.12). (Os cartões de tipo de evento saíram em outubro de 2026, ver seção 8.) | Respeita `minDays`/`maxDays`. Dia indisponível no meio do intervalo é explicado pelo nome, com a agenda exata do período escolhido. Os dois casos seguram o "Continuar" |

| \*\*Convidados\*\* | Só na chácara. Número de convidados | O teto é o `maxGuests`: acima dele o aviso aparece na hora e o "Continuar" não anda |

| \*\*Decoração\*\* | Uma decoração, em cartões de rádio com foto, categoria, descrição, dica de montagem e preço, e filtro por categoria. Na chácara, "Sem decoração" é uma das opções e o preço é o com a chácara, com o avulso riscado quando é maior. Na decoração sozinha, a escolha é obrigatória e o preço é o avulso | A que já saiu para outra festa nessas datas aparece esmaecida, sem poder ser escolhida, com "Em uso nessa data" (`GET /items/availability`). A escolhida que ficou em uso segura o "Continuar". Decoração sem estoque nenhum não aparece. Com a decoração fechada no período, o passo explica isso em vez de mostrar o catálogo |

| \*\*Revisão\*\* | Resumo: datas, convidados, diárias por dia, a decoração (com a foto e a etiqueta "preço com a chácara" quando vale) e o total. Na decoração sozinha, "Como a decoração chega à festa?": retirada na chácara ou entrega no endereço, sem escolha pronta. Campo de observações. Regras da casa e política de cancelamento em texto curto | Chama `POST /pricing/quote` (com \*debounce\* de 300 ms) e mostra `issues`. Na entrega, mostra o endereço do perfil com "Alterar endereço" e diz que a taxa é combinada com a chácara |

| \*\*Envio\*\* | Se não logado, mostra entrar/cadastrar/Google \*\*sem perder o rascunho\*\*. Na entrega sem endereço salvo, o cadastro do endereço (diálogo com busca do CEP) fica no lugar do botão. Botão \*\*"Solicitar reserva"\*\* | Envia `expectedTotalCents` e `fulfillment`. Sem retirada nem entrega escolhida, não envia e diz o que falta. Trata `PRICE\_CHANGED`, `DATE\_UNAVAILABLE`, `STOCK\_INSUFFICIENT` (voltando ao passo certo com a mensagem) |

| \*\*Confirmação\*\* | "Pedido enviado". Explica: as datas ficam seguras por até X horas, a chácara confirma por e-mail, e há um botão de WhatsApp para agilizar. Na decoração, diz como ela chega e, na entrega, o endereço e que a taxa é combinada | Mostra `holdExpiresAt` em linguagem humana |



Comportamentos obrigatórios:



\- Não dá para pular pergunta. O passo pedido na URL só abre com os anteriores respondidos (`reachableStep`, em `features/booking/draft.ts`): um link para a revisão com o pedido pela metade cai no primeiro passo que falta.

\- O passo da decoração fecha com o mesmo "Não achou o que queria?" da landing (13.1, item 5.1), e a mensagem do WhatsApp já leva a data do pedido.

\- O servidor decide. O front nunca soma preço para exibir o total oficial: usa o `quote`. (Desde novembro de 2026 não há estimativa antes da revisão.)

\- Tratamento otimista \*\*proibido\*\* para reserva. Só confirma depois da resposta `201`.

\- Conta criada por cadastro próprio precisa confirmar o e-mail antes de enviar: o wizard explica e oferece reenviar, guardando o rascunho.



\### 13.3 Minhas reservas



Lista por status (próximas, passadas, canceladas) com `StatusBadge`. Detalhe com datas, itens, combos aplicados, valores (snapshot), observações e o botão "Cancelar reserva" quando permitido, com explicação do prazo quando não. Reserva `PENDING` mostra contagem de quando as datas deixam de ficar seguras. Na decoração, o detalhe diz como ela chega e, na entrega, o endereço copiado e que a taxa é combinada. Desde novembro de 2026, cada decoração do pedido aparece com a foto ao lado do nome (11.3).

\*\*Duas abas\*\* (novembro de 2026, a pedido do dono), seguindo o padrão de abas da WAI-ARIA, com a aba aberta na URL (`?aba=perfil`):

\- \*\*Minhas reservas:\*\* a lista de sempre.

\- \*\*Meu perfil:\*\* "Seus dados", com nome e WhatsApp para editar e o e-mail só para leitura, com o aviso de que a troca vai pedir um código (seção 22); "Endereço de entrega", com "Cadastrar endereço" ou "Alterar endereço" (o mesmo diálogo do pedido, 9.12); "Senha", com a troca da 10.5, ou o aviso de que a conta entra com o Google, sem senha; e, no fim, "Sua conta", com a remoção da 10.8.



\### 13.4 Admin



Ambiente mais denso e funcional que o da landing, com a mesma identidade (tokens), mas sem a moldura em arco e sem ornamento. Navegação lateral no desktop e menu inferior/gaveta no celular (o dono vai usar no celular). No desktop, a navegação lateral fica fixa enquanto o conteúdo rola, e o item da seção atual não muda no hover (outubro de 2026: o hover pintava o fundo de branco por baixo do texto claro do item ativo, e ele sumia). No celular, ela abre numa gaveta pela esquerda, por cima da tela (`components/Drawer`, a mesma do menu do site), em vez de entrar no meio da página e empurrar o conteúdo para baixo, a pedido do dono.



| Tela | Conteúdo |

|---|---|

| \*\*Dashboard\*\* | Pedidos aguardando confirmação (com tempo restante do hold), próximos eventos (7/30 dias), ocupação do mês. Cada card leva à tela do recurso |

| \*\*Calendário\*\* | Grade mensal. Dias coloridos por status (ver StatusBadge). Clicar num dia abre gaveta com as reservas do dia, e ações "Bloquear dia"/"Desbloquear" (com motivo) |

| \*\*Reservas\*\* | Tabela com busca (nome, e-mail, telefone), filtro de status e período. Detalhe: cliente (com botão de WhatsApp), datas, itens, totais, observações do cliente, \*\*notas internas\*\*, histórico de status e ações "Confirmar", "Cancelar" (motivo obrigatório). Na decoração, o cartão "Como a decoração chega", com a retirada ou a entrega e, na entrega, o endereço copiado e o lembrete de combinar a taxa (9.12). Cada decoração dos valores aparece com a foto ao lado do nome (11.3). Logo depois dos valores, o cartão \*\*Pagamento\*\* (9.11): o sinal e as parcelas com a situação de cada um, o recebido e o que falta, "Registrar pagamento"/"Editar pagamento" (o editor do plano), "Registrar recebimento", "Desfazer" e "Excluir plano" (só sem recebimento) |

| \*\*Financeiro\*\* | Números do mês pelo vencimento (previsto, recebido, a receber) e o total em atraso de todos os meses. Grade mensal com os dias que têm sinal ou parcela, marcados por cor, ícone e texto (a receber, em atraso, recebido); tocar num dia filtra a lista de vencimentos logo abaixo. Cada vencimento tem "Registrar recebimento" (com o dia, hoje por padrão), "Desfazer", o link da reserva e "Cobrar pelo WhatsApp" com mensagem pronta. Depois vêm "Em atraso" e as reservas fechadas do mês sem pagamento registrado |

| \*\*Reserva manual\*\* | Escolher/criar cliente (nome + telefone), datas, itens, opção de já confirmar. Mesmo cálculo de preço do cliente, com campo de \*\*ajuste manual de desconto\*\* opcional (fase 6). A decoração lançada aqui sai como retirada (9.12). Desde novembro de 2026, cada decoração da lista tem a foto ao lado do nome e mostra o preço que vale para o que a reserva contrata: com a chácara, o preço com a chácara; só a decoração, o avulso |

| \*\*Itens\*\* | Tabela com foto, categoria, temas, preço, estoque, ativo. Formulário com upload/URL da imagem, temas (multi-seleção), dica de montagem. Desde novembro de 2026, dois preços, os dois obrigatórios: "Preço avulso" e "Preço com a chácara", que não pode passar do avulso (9.12) |

| \*\*Combos\*\* | Selecionar itens e quantidades, tipo e valor do desconto, tema. \*\*Prévia da economia\*\* ("soma dos itens R$ X, o cliente paga R$ Y") |

| \*\*Temas\*\* | Nome, tagline, descrição, paleta (lista de cor + nome), imagem de capa, ordem |

| \*\*Preços\*\* | Lista de regras (nome, dias, período, valor, prioridade). \*\*Simulador\*\*: escolher um período e ver o valor de cada dia e qual regra venceu |

| \*\*Galeria\*\* | Upload/URL, texto alternativo obrigatório, legenda, ordem por arrastar (ou botões subir/descer), seção (hero, chácara). A seção "eventos" saiu em outubro de 2026, com a galeria da landing (13.1, item 3) |

| \*\*Clientes\*\* | Lista, contato, histórico de reservas, criação sem senha |

| \*\*Configurações\*\* | Todos os campos de `VenueSettings` |



> \*\*Registro (outubro de 2026).\*\* Combos e Temas (no menu, "Estilos") saíram do menu do painel a pedido do dono. As telas e as rotas continuam funcionando em `/admin/combos` e `/admin/temas`, e o que está cadastrado continua valendo no site e no preço; só não há mais atalho para elas. (Desde novembro de 2026, não vale mais: o site não filtra por estilo e o orçamento não aplica combo, 9.6 e 9.12. Os cadastros continuam no banco.)

Toda ação destrutiva pede confirmação em diálogo com o resultado explicado ("Isso cancela a reserva e avisa o cliente por e-mail").



\---



\## 14. Identidade visual e design system



> \*\*Registro da troca de identidade (outubro de 2026).\*\* O que esta seção descreve — paleta verde de mata, papel claro, amarelo de ipê, Young Serif + Figtree, moldura em \*\*arco\*\* — foi a identidade provisória do MVP, feita antes de haver cliente. Com a chácara real contratada, o site passou a usar a \*\*identidade da Donna Belle\*\*: ameixa `#913271` como marca, dourado `#D9A441` na ação, rosa seco `#B5656F` no que é chácara, magenta `#D14BA8` no que é decoração, fundo rosado `#FDF3F0`, Parisienne (marca) + Cormorant Garamond (títulos) + Montserrat (texto), e \*\*passe-partout com fio dourado\*\* no lugar do arco (o hexágono do logo é a marca, não recorte de foto).
>
> \*\*Registro da landing de outubro de 2026.\*\* A pedido do dono, a landing ganhou um acabamento de convite, todo com os elementos que a identidade já tinha:
>
> - \*\*Hero:\*\* o nome composto como no logo ("Espaço" na serifada, "Donna Belle" na manuscrita) e um fio dourado por dentro da borda da foto, o passe-partout em tamanho de tela.
> - \*\*Ornamento da marca\*\* (fio, hexágono, fio; token `--ornament-mask`) embaixo de todo título de seção e entre o nome e a frase do hero. Fica embaixo do título e não é texto, então não é o "rótulo acima do título" da 14.12.
> - \*\*"Pegue e monte, como funciona"\*\* virou a faixa de ameixa do meio da página: cada número no hexágono dourado, com um fio ligando os passos.
> - \*\*Fotos de áreas e de itens\*\* na `PhotoFrame`. Os itens ficaram sem caixa em volta, e nenhum cartão se mexe no hover (14.8).
> - \*\*FAQ\*\* com o título numa coluna que acompanha a rolagem e as perguntas com "+" no fio dourado.
> - \*\*"Como chegar"\*\* com o mapa na moldura, e o rodapé com contato e Instagram.
>
> Os tokens novos são `--hairline-soft`, `--ornament-mask` e `--header-height`.

> O texto abaixo fica como registro do que foi decidido e por quê. \*\*A fonte da verdade da paleta, da tipografia e da forma-assinatura é `apps/web/src/styles/tokens.css`\*\*, que documenta de onde cada cor vem e quais pares de contraste foram conferidos. As \*\*regras\*\* desta seção continuam valendo todas: componente nunca usa hex direto, a cor da festa vem de `Theme.palette` e não dos tokens, status nunca depende só de cor, o painel é seco.



\### 14.1 Ponto de partida



O produto é um \*\*quintal de festa\*\*: sombra de árvore, mesa comprida ao ar livre, luz de fim de tarde, decoração feita à mão. O público é misto (mães organizando aniversário e chá de bebê, noivas, grupos de amigos e empresas), quase todo no celular. A identidade precisa ser \*\*calorosa e confiável\*\*, sem parecer infantil (senão casamento e aniversário adulto se afastam) e sem parecer corporativa.



\*\*Ideia central:\*\* a marca fica quieta e natural (verde de mata, papel claro, um amarelo de ipê); \*\*quem traz a cor da festa é o estilo escolhido\*\* (seção 15). A única forma-assinatura é o \*\*arco\*\* (a moldura arqueada dos arcos de balões e de flores, o ornamento mais reconhecível de uma festa ao ar livre). Todo o resto é discreto, para a foto e o tema brilharem.



\### 14.2 Cores (marca)



Tokens em `styles/tokens.css`. Os nomes em comentário são só referência de conversa.



```css

:root {

&#x20; /\* Marca \*/

&#x20; --forest-900: #12291F;  /\* Mata profunda: rodapé, superfícies escuras \*/

&#x20; --forest-700: #1F4A38;  /\* Mata: cor de marca, títulos de destaque, botão secundário \*/

&#x20; --sage-300:   #A9BFA5;  /\* Sálvia: bordas de destaque, ilustrações \*/

&#x20; --sage-100:   #E4ECDF;  /\* Sálvia clara: fundos de seção alternados \*/

&#x20; --paper:      #FCFCF9;  /\* Papel: fundo padrão \*/

&#x20; --ipe-400:    #F2B71F;  /\* Ipê: ação principal (botão), destaques pontuais \*/

&#x20; --ipe-800:    #8A5F00;  /\* Ipê escuro: texto/ícone amarelo sobre fundo claro \*/

&#x20; --guava-500:  #E0606B;  /\* Goiaba: selo de desconto, coração, avisos leves \*/

&#x20; --ink:        #1D2A24;  /\* Tinta: texto principal \*/

&#x20; --ink-soft:   #5F6B63;  /\* Texto secundário (contraste AA sobre --paper) \*/

&#x20; --wood-600:   #7B5B45;  /\* Madeira: ícones e detalhes neutros \*/

&#x20; --line:       #DDE3DA;  /\* Bordas e divisórias \*/



&#x20; /\* Semânticos: use estes nos componentes \*/

&#x20; --bg: var(--paper);

&#x20; --bg-alt: var(--sage-100);

&#x20; --fg: var(--ink);

&#x20; --fg-soft: var(--ink-soft);

&#x20; --brand: var(--forest-700);

&#x20; --action: var(--ipe-400);

&#x20; --action-fg: var(--ink);       /\* texto sobre o botão de ação \*/

&#x20; --danger: #A32E3A;

&#x20; --focus: #1B6FD1;              /\* anel de foco visível, distinto da marca \*/



&#x20; /\* Status de reserva (fundo, texto). Sempre acompanhados de texto/ícone \*/

&#x20; --st-pending-bg:   #FCEFC7; --st-pending-fg:   #7A5500;

&#x20; --st-confirmed-bg: #DCEBDD; --st-confirmed-fg: #1F4A38;

&#x20; --st-cancelled-bg: #F8DDDF; --st-cancelled-fg: #8E2B35;

&#x20; --st-completed-bg: #E4E9EE; --st-completed-fg: #3E4B58;

}

```



Regras de uso:



\- Fundo padrão é `--paper`; seções alternadas usam `--bg-alt`. Superfícies escuras (`--forest-900`) só no rodapé e em faixas de destaque.

\- \*\*Ação principal = `--action` com texto `--ink`.\*\* Ação secundária = contorno `--brand`. Só há \*\*um\*\* botão de ação principal visível por tela.

\- `--guava-500` é raro: selo de economia de combo, estados de perigo leves. Nunca como cor de botão.

\- Não use gradientes decorativos. Cor é chapada.

\- Contraste mínimo WCAG AA (4.5:1 para texto normal). Nunca use cor sozinha para informar status.



\### 14.3 Cores de estilo (tema)



O tema é \*\*dado do banco\*\* (`Theme.palette`), não CSS fixo. O componente que renderiza um tema aplica a paleta como variáveis locais:



```tsx

<div style={{ '--t1': p\[0].hex, '--t2': p\[1].hex, '--t3': p\[2].hex, '--t4': p\[3].hex, '--t5': p\[4].hex } as CSSProperties}>

```



Regras:



\- A cor do tema aparece \*\*só em componentes ligados ao tema\*\*: cartão do estilo, `ThemeChip` (pontinhos de paleta ao lado do nome do item), filtro selecionado, borda do arco do cartão. \*\*Nunca\*\* sobrescreve a marca (botões, cabeçalho, links).

\- Texto sobre cor de tema: use o helper `readableOn(hex)` (escolhe `--ink` ou `--paper` conforme o contraste). Não coloque texto direto sobre paleta pastel sem passar por ele.

\- Itens com vários temas mostram até 3 pontinhos; o filtro por tema é a forma principal de descoberta.



\### 14.4 Tipografia



| Papel | Fonte | Uso |

|---|---|---|

| \*\*Display\*\* | \*\*Young Serif\*\* (peso 400) | Títulos da landing e do wizard, números grandes de preço no resumo |

| \*\*Corpo e interface\*\* | \*\*Figtree\*\* (400, 500, 600, 700) | Texto corrido, formulários, botões, tabelas, todo o admin |



\- \*\*Self-host\*\* os arquivos `woff2` (subset latino) em `apps/web/public/fonts` com `font-display: swap` e `preload` da fonte de corpo. Isso evita salto de layout e dispensa requisição a terceiros (privacidade). Fallbacks: `'Young Serif', Georgia, 'Times New Roman', serif` e `'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif`.

\- \*\*Admin usa só Figtree\*\* (mais denso e neutro). Young Serif é linguagem da landing/wizard.

\- Escala modular 1.25 sobre 16 px: `0.8 / 0.875 / 1 / 1.25 / 1.563 / 1.953 / 2.441 / 3.052 rem`. O título do hero usa `clamp()` entre 2.441 e 3.815 rem.

\- Corpo: `line-height` 1.55, largura máxima \*\*65 caracteres\*\* (`max-width: 65ch`). Títulos serifados: `line-height` 1.15, `letter-spacing: -0.01em`.

\- \*\*Sentence case\*\* em toda a interface. Nada de texto em caixa-alta com espaçamento entre letras, nem para rótulos.

\- Não destaque uma única palavra do título com cor ou itálico. Não coloque "rótulos" decorativos acima de títulos.



\### 14.5 Espaçamento, forma e profundidade



\- Espaçamento em múltiplos de 4 px (`4, 8, 12, 16, 24, 32, 48, 64, 96, 128`). Seções da landing: 96 px no desktop, 64 px no celular.

\- Container máximo 1200 px; texto corrido em coluna de 65ch; grade de 12 colunas no desktop.

\- \*\*Raios por hierarquia\*\* (não um raio único em tudo): `--r-sm: 6px` (campos, selos), `--r-md: 12px` (cartões de item, diálogos), \*\*arco\*\* (moldura-assinatura, abaixo). Botões: `--r-sm`.

\- \*\*Sem sombra por padrão\*\*; a separação vem de borda de 1 px (`--line`) e de fundo alternado. Elevação só em diálogo, gaveta e barra fixa: `box-shadow: 0 8px 24px rgb(29 42 36 / 0.14)`.

\- Ícones: SVG inline próprios em `components/icons.tsx`, traço de 1.75 px, grade de 24 px, cor herdada (`currentColor`). Sem biblioteca de ícones.



\### 14.6 A forma-assinatura: o arco



`ArchFrame` é uma moldura com o topo em semicírculo e a base reta:



```css

.arch {

&#x20; border-top-left-radius: 999px;

&#x20; border-top-right-radius: 999px;

&#x20; border-bottom-left-radius: var(--r-md);

&#x20; border-bottom-right-radius: var(--r-md);

&#x20; overflow: hidden;

&#x20; aspect-ratio: 4 / 5;      /\* hero \*/

}

.arch--tall { aspect-ratio: 3 / 4; }  /\* cartão de estilo \*/

```



Onde usar (e só aí): a foto do hero, os cartões de estilo, o detalhe de um combo em destaque e a ilustração de estado vazio. \*\*Não\*\* use o arco em botões, campos, tabelas, admin ou em toda imagem: a graça é ele ser raro.



\### 14.7 Layout: conceito



Alinhamento \*\*à esquerda\*\* para títulos e texto (centralizar só uma frase curta de chamada, se precisar). Fotos grandes, muito respiro, duas colunas alternando texto e imagem no desktop, coluna única no celular.



Hero (desktop):



```

┌────────────────────────────────────────────────────────────────┐

│ logo                        Estilos  Galeria    Entrar \[Reservar]│

│                                                                │

│  Sua festa no                             ╭───────────────╮    │

│  nosso quintal                            │               │    │

│  (uma frase de apoio, 2 linhas)           │  foto real    │    │

│                                           │  da chácara   │    │

│  ┌ Quando é a festa? ────────────────┐    │  em uso       │    │

│  │ \[sáb 05 dez] \[sáb 12 dez] \[sáb 19]│    │  (arco)       │    │

│  │ Ver o calendário completo         │    └───────────────┘    │

│  └───────────────────────────────────┘                         │

└────────────────────────────────────────────────────────────────┘

```



(O título acima é só um exemplo de tom; o texto final é aprovado pelo dono.)

> \*\*Registro (outubro de 2026).\*\* O hero de hoje não segue este desenho: a foto ocupa a primeira tela inteira, e o nome, a frase e o botão "Reservar uma data" ficam centralizados sobre ela, a pedido do dono (13.1, item 1). É a exceção ao alinhamento à esquerda.



Wizard no celular:



```

┌──────────────────────┐

│ ← Reservar     1 de 3│

│ ──●────────○────────○│

│                      │

│  Escolha as datas    │

│  \[   calendário   ]  │

│                      │

│  Convidados          │

│  (número)            │

├──────────────────────┤

│ Total parcial R$ 0   │  ← barra fixa

│ \[ Continuar ]        │

└──────────────────────┘

```

> \*\*Registro (novembro de 2026).\*\* O wizard de hoje tem um passo por pergunta (13.2): os convidados ganharam passo próprio, e a barra fixa só tem "Voltar" e "Continuar" até a revisão, que é onde o total aparece.



\### 14.8 Movimento



\- \*\*Um\*\* momento orquestrado, na carga da landing: a foto do hero aparece em fade e o nome, a frase e o botão sobem em sequência (\~700 ms cada, uma vez). O resto da página fica estático. (A especificação original revelava a moldura em arco por `clip-path`/`transform`; mudou com o hero de outubro de 2026.)

\- Movimento \*\*em resposta à ação\*\* é bem-vindo e curto (120 a 200 ms): seleção de datas no calendário, abrir/fechar diálogo e gaveta, incremento de quantidade, troca de passo do wizard (fade), toast.

\- \*\*Proibido:\*\* entrada com fade-and-slide em cada seção, hover animado em todo cartão, parallax, carrossel automático.

> \*\*Registro (outubro de 2026): exceção pedida pelo dono.\*\* Na landing, os blocos entram com o mesmo movimento do hero ao aparecer na tela, contrariando a proibição acima: títulos de seção, fatos, fotos das áreas, passos, cartões, perguntas e mapa sobem 16 px e acendem em 700 ms, uma vez cada, e os que entram juntos saem em sequência de 90 ms. Fica em `features/landing/reveal.ts` e `reveal.css`, com cinco garantias:
>
> - Nada fica escondido sem JavaScript, no HTML pré-renderizado ou em navegador sem `IntersectionObserver`.
> - Só se esconde o que está fora da tela: bloco que já está à vista quando aparece fica como está, e quem recarrega no meio da página não vê nada piscar.
> - Com `prefers-reduced-motion: reduce`, tudo aparece de uma vez.
> - O foco do teclado nunca cai num bloco invisível.
> - Revelado, o bloco não some de novo.
>
> Não vale para o wizard, a área do cliente nem o painel.

> \*\*Registro (novembro de 2026): segunda exceção pedida pelo dono.\*\* O carrossel das áreas da chácara (13.1, item 2; `features/landing/VenueCarousel.tsx`) é automático, contrariando a proibição acima: passa para a foto seguinte a cada 2 segundos e é infinito, da última volta para a primeira. A volta usa três cópias das fotos e, quando a faixa para numa cópia das pontas, pula sem animação para a mesma foto na cópia do meio. As cópias das pontas são `inert` e `aria-hidden`, e o HTML pré-renderizado tem uma cópia só. As garantias:
>
> - Um botão pausa e retoma ("Pausar as fotos", "Passar as fotos sozinhas"), e a escolha vale enquanto a página estiver aberta (WCAG 2.2.2).
> - Só passa com o carrossel na tela. Sem `IntersectionObserver`, não passa.
> - Para enquanto o ponteiro está em cima, o foco do teclado está dentro, o dedo está na faixa e até um segundo depois de a pessoa rolá-la.
> - Com `prefers-reduced-motion: reduce`, não passa sozinho, e o botão de pausa nem aparece.
> - O anúncio "Foto 2 de 5" ao leitor de tela fica desligado enquanto passa sozinho, para não falar a cada 2 segundos.

\- Respeitar `prefers-reduced-motion: reduce` (desliga o momento do hero e reduz os demais a troca instantânea).



\### 14.9 Imagens



\- A \*\*fotografia real\*\* é o principal ativo. Hero e galeria usam fotos da chácara em uso, luz natural, sem banco de imagens genérico. Enquanto não houver foto, use um bloco chapado com a paleta do tema (nunca gradiente nem imagem de banco).

\- Proporções reservadas via `aspect-ratio` (evita salto de layout): hero em arco 4:5, cartão de estilo em arco 3:4, item 1:1, galeria em proporções variadas.

\- Formatos: WebP (ou AVIF), com `srcset` em 480/960/1600 px e `sizes` corretos. Servir por CDN com transformação por URL (ex.: Cloudinary) ou gerar variantes no upload. Imagem do hero: `fetchpriority="high"`, sem `loading="lazy"`. As demais: `loading="lazy"`, `decoding="async"`.

\- \*\*Texto alternativo descritivo obrigatório\*\* (campo `alt` não pode ser vazio no admin). Foto decorativa usa `alt=""`.

\- Fotos de kits montados devem mostrar o \*\*item que o cliente vai receber\*\*, para a expectativa bater com a entrega.



\### 14.10 Admin



Mesma paleta e tipografia (só Figtree), mais denso: tabelas com linhas de 44 a 48 px, filtros no topo, ações na linha. Sem arco, sem ornamento. Destaques por status usam os tokens `--st-\*` (sempre com texto). No celular: tabelas viram lista de cartões simples, com as ações principais visíveis.



\### 14.11 Componentes: comportamento esperado



| Componente | Regras |

|---|---|

| \*\*Button\*\* | 44 px de altura mínima (toque). Estados: normal, hover, foco visível, desabilitado, carregando (rótulo de progresso, sem spinner isolado) |

| \*\*Field\*\* | Rótulo sempre visível (nada de placeholder como rótulo), ajuda e erro ligados por `aria-describedby`, `autocomplete` correto (`name`, `email`, `tel`, `new-password`) |

| \*\*Calendário\*\* | Dias `booked`/`blocked`/`past` desabilitados com diferença \*\*visual e textual\*\* (legenda), navegação por teclado, faixa selecionada destacada por preenchimento (não só cor de texto) |

| \*\*QuantityStepper\*\* | Botões − e + de 44 px, valor editável, respeita o máximo pelo estoque, anuncia mudança (`aria-live="polite"`) |

| \*\*StatusBadge\*\* | Texto do status + ícone, cores dos tokens `--st-\*` |

| \*\*Dialog/Drawer\*\* | Foco preso dentro, `Esc` fecha, foco volta ao gatilho, título obrigatório. A gaveta é `components/Drawer.tsx` (`<dialog>` modal presa a uma borda): fecha também pelo fundo e ao escolher uma opção, e trava a rolagem da página enquanto aberta. É o menu do site e o do painel no celular |

| \*\*Toast\*\* | Confirma a ação com o mesmo verbo do botão ("Pedido enviado" após "Solicitar reserva"). Erro persiste até o usuário dispensar |

| \*\*Money\*\* | Sempre `<Money cents />`. Alinhado à direita em tabelas, com `font-variant-numeric: tabular-nums` |



\### 14.12 O que evitar (padrões genéricos)



Este projeto \*\*não\*\* deve parecer um template. Evite, mesmo que "fique bonito":



\- Fundo creme com serifa de alto contraste e acento terracota.

\- Fundo quase preto com um único acento neon.

\- Layout de jornal com filetes finos, zero de raio e colunas densas.

\- "Kit SaaS": tudo em cartões idênticos, mesmo raio e a mesma sombra cinza, gradientes de fundo.

\- Rótulo em CAIXA-ALTA espaçada acima de todo título, textos com pontos-médios (`A · B · C`), setas `→` em todo botão, numeração `01 / 02 / 03` onde não há sequência real.

\- Banco de imagens de "festa feliz" e ícones de confete.

\- Animação de entrada em cada bloco. (Exceção da landing, pedida pelo dono em outubro de 2026: ver o registro na 14.8.)



\---



\## 15. Catálogo de estilos de festa (temas)



Um \*\*estilo\*\* é a linha estética de uma festa: paleta, materiais, motivos e clima. É o principal filtro de descoberta do "pegue e monte" (a pessoa raramente pensa em "mesa redonda", pensa em "quero algo rústico" ou "chá de bebê de nuvens"). No sistema:



\- `Theme` guarda nome, tagline, descrição, paleta (5 cores) e capa.

\- `ItemTheme` liga itens a estilos (um item pode ter vários; ex.: cadeira de madeira serve a Rústico Boho e a Jardim).

\- `Combo.themeId` associa um combo a \*\*um\*\* estilo (o "kit" do estilo).

\- `/reservar?tema=<slug>` abre o wizard já filtrado. Os cartões da landing usam esse link.

\- \*\*Os 12 temas abaixo entram no seed.\*\* O admin pode editar, desativar e criar outros. Fotos e itens reais vêm do dono.

> \*\*Registro (novembro de 2026).\*\* Os estilos saíram do site a pedido do dono: cada item virou uma decoração completa (9.12), a landing não tem mais a seção de estilos e o wizard não filtra por estilo nem aceita `?estilo=`. Os temas, as ligações com os itens e a tela do painel continuam, sem efeito no site. Esta seção fica como registro do catálogo.



> Regra de conteúdo: \*\*sem personagens ou marcas licenciadas.\*\* Os estilos falam de cores, temas e materiais genéricos (circo, safári, fundo do mar), nunca de personagens específicos.



\### 15.1 Sugestão de estilo por tipo de evento



> \*\*Removida em outubro de 2026\*\*, junto com o tipo de evento (seção 8): o passo de itens lista os estilos na ordem do admin. A tabela abaixo fica como registro.

Constante em `packages/shared` (`SUGGESTED\_THEMES\_BY\_EVENT`). Depois que o cliente escolhe o tipo de evento no passo 1, o passo 2 mostra primeiro os estilos sugeridos (os demais continuam acessíveis).



| Tipo de evento | Estilos sugeridos (em ordem) |

|---|---|

| Aniversário infantil | `circo-carrossel`, `safari-selva`, `fundo-do-mar`, `cores-doces`, `tropical` |

| Aniversário adulto | `elegante-esmeralda`, `boteco-churrasco`, `tropical`, `rustico-boho` |

| Chá de bebê | `nuvens-e-estrelas`, `rustico-boho`, `safari-selva`, `cores-doces` |

| Chá revelação | `cha-revelacao`, `nuvens-e-estrelas` |

| Chá de panela / lingerie | `jardim-provencal`, `rustico-boho`, `cores-doces` |

| Casamento, noivado | `jardim-provencal`, `rustico-boho`, `elegante-esmeralda` |

| Formatura | `elegante-esmeralda`, `tropical` |

| Confraternização | `boteco-churrasco`, `festa-junina`, `tropical` |

| Outro | todos, na ordem do admin |



`festa-junina` ganha destaque automático na landing de maio a julho (regra de exibição opcional, configurável).



\### 15.2 Os estilos



Cada estilo traz: \*\*para quê\*\*, \*\*clima\*\*, \*\*paleta\*\*, \*\*itens típicos\*\*, \*\*motivos\*\* (o que aparece em fotos e ilustrações) e \*\*sugestão de combo\*\*.



\#### Rústico boho — `rustico-boho`

\- \*\*Para:\*\* chá de bebê neutro, chá de panela, aniversário adulto, casamento no campo.

\- \*\*Clima:\*\* acolhedor, artesanal, tons naturais e suaves, sensação de "feito à mão".

\- \*\*Paleta:\*\* Palha `#D8C7A3`, Madeira `#8C6A4F`, Sálvia `#A7B8A1`, Rosa seco `#C9A29A`, Branco cru `#F2EEE6`.

\- \*\*Itens típicos:\*\* painel de madeira ou ripado, macramê, capim-dos-pampas e flores secas (artificiais), mesas de madeira, cestos, tapetes de fibra, puffs, luzes de varal, velas.

\- \*\*Motivos:\*\* trama de palha, folhas de eucalipto, arcos naturais, linhas orgânicas.

\- \*\*Combo sugerido:\*\* "Mesa do bolo boho" (painel + mesa + arranjos + cestos), com desconto percentual.



\#### Jardim branco e verde — `jardim-provencal`

\- \*\*Para:\*\* casamento, noivado, chá de panela, aniversário de 15 anos, batizado.

\- \*\*Clima:\*\* romântico, leve, clássico ao ar livre.

\- \*\*Paleta:\*\* Branco `#FFFFFF`, Verde névoa `#DDE6D5`, Eucalipto `#7F9A82`, Dourado suave `#C8A96A`, Verde floresta `#2F4A3B`.

\- \*\*Itens típicos:\*\* arco de treliça ou de flores, floreiras, mesa com toalha branca e caminho de mesa, cadeiras brancas, lousas para cardápio e boas-vindas, castiçais dourados, gaiolas decorativas.

\- \*\*Motivos:\*\* folhagem fina, tramas de treliça, moldura em arco, dourado como toque (nunca dominante).

\- \*\*Combo sugerido:\*\* "Cerimônia no jardim" (arco + cadeiras + placa de boas-vindas).



\#### Tropical — `tropical`

\- \*\*Para:\*\* aniversário infantil e adulto, formatura, confraternização de verão.

\- \*\*Clima:\*\* vibrante, alegre, cores saturadas, calor e piscina.

\- \*\*Paleta:\*\* Verde folha `#1E7F4F`, Rosa flamingo `#F2557B`, Amarelo abacaxi `#FFD23F`, Turquesa `#26B5B0`, Branco coco `#FBF7EE`.

\- \*\*Itens típicos:\*\* folhagens grandes (costela-de-adão, palmeiras) artificiais, flamingos e abacaxis decorativos, painel de folhas, mesas de bambu, luminárias de fibra, boias decorativas.

\- \*\*Motivos:\*\* folhas largas, listras, frutas, formas geométricas orgânicas.

\- \*\*Combo sugerido:\*\* "Verão na chácara" (painel de folhas + mesa + flamingos).



\#### Safári e selva — `safari-selva`

\- \*\*Para:\*\* aniversário infantil (principalmente o primeiro ano), chá de bebê.

\- \*\*Clima:\*\* aventura suave, terrosa, divertida sem ser berrante.

\- \*\*Paleta:\*\* Areia `#CDB68A`, Oliva `#6C7A3F`, Terra `#6B4A2E`, Laranja savana `#D9822B`, Verde mata `#2F5D3A`.

\- \*\*Itens típicos:\*\* painel de folhagens, animais decorativos genéricos (leão, girafa, zebra, sem personagem), mesas de madeira, tendas pequenas, caixotes, tapetes de fibra.

\- \*\*Motivos:\*\* folhas, pegadas, estampas de animais, tons de savana.

\- \*\*Combo sugerido:\*\* "Mesa da selva" (painel + mesa + animais + caixotes).



\#### Circo e carrossel — `circo-carrossel`

\- \*\*Para:\*\* aniversário infantil, festa de parque.

\- \*\*Clima:\*\* festivo, colorido, nostálgico, cara de feira e parque de diversões.

\- \*\*Paleta:\*\* Vermelho `#D7263D`, Azul `#1F5FA8`, Amarelo `#F6C445`, Branco `#FFFFFF`, Céu `#BFDDF5`.

\- \*\*Itens típicos:\*\* tenda listrada, bandeirolas, painel de listras, mesas com toalhas listradas, balões, carrossel decorativo, painel de nuvens.

\- \*\*Motivos:\*\* listras verticais, bandeirolas, estrelas, lâmpadas.

\- \*\*Combo sugerido:\*\* "Tenda e bolo" (tenda + mesa + painel + bandeirolas).



\#### Fundo do mar — `fundo-do-mar`

\- \*\*Para:\*\* aniversário infantil, festa de piscina.

\- \*\*Clima:\*\* fresco, fantasioso, brilhante, azul e coral.

\- \*\*Paleta:\*\* Turquesa `#2BB3B3`, Azul profundo `#14567A`, Coral `#FF7F6E`, Areia `#EAD9B5`, Madrepérola `#F1E8F5`.

\- \*\*Itens típicos:\*\* painel de ondas, conchas e estrelas-do-mar decorativas, redes de pesca, mesas com toalha azul, balões em tons de mar, arco de bolhas.

\- \*\*Motivos:\*\* ondas, conchas, bolhas, estrelas-do-mar.

\- \*\*Combo sugerido:\*\* "Recife" (painel + arco de balões + mesa + conchas).



\#### Nuvens e estrelas (chá de bebê) — `nuvens-e-estrelas`

\- \*\*Para:\*\* chá de bebê, chá de fraldas, primeiro aniversário, chá revelação suave.

\- \*\*Clima:\*\* sonhador, delicado, pastéis leves, sensação de céu de manhã.

\- \*\*Paleta:\*\* Azul céu `#BFD9EE`, Rosa bebê `#F4CBD3`, Menta `#CDE8DA`, Manteiga `#F8E7A4`, Branco nuvem `#FFFFFF`.

\- \*\*Itens típicos:\*\* painel de nuvens, arco de balões pastel, mesa de doces com toalha branca, estrelas e luas decorativas, cadeira de balanço, urso de pelúcia decorativo genérico, móbile.

\- \*\*Motivos:\*\* nuvens, estrelas, luas, balões de ar quente, linhas suaves.

\- \*\*Combo sugerido:\*\* "Céu de chá" (painel + arco de balões + mesa + móbile).



\#### Chá revelação — `cha-revelacao`

\- \*\*Para:\*\* chá revelação de sexo do bebê.

\- \*\*Clima:\*\* curioso, festivo, o suspense é o assunto; rosa e azul convivem sem antecipar o resultado.

\- \*\*Paleta:\*\* Rosa `#F29BB0`, Azul `#8EC5F0`, Dourado `#E6C36A`, Branco `#FFFFFF`, Cinza pérola `#D9DDE3`.

\- \*\*Itens típicos:\*\* painel duplo (rosa/azul), balões gigantes, caixa surpresa, letreiro "Menino ou menina?" genérico, mesa de doces em duas cores, arco de balões bicolor.

\- \*\*Motivos:\*\* interrogação, balões, confete dourado, duas cores lado a lado.

\- \*\*Combo sugerido:\*\* "Grande revelação" (painel + arco bicolor + caixa surpresa + mesa).



\#### Arraial (festa junina) — `festa-junina`

\- \*\*Para:\*\* festa junina e julina, confraternização, aniversário infantil ou adulto no clima caipira.

\- \*\*Clima:\*\* alegre, caipira, convidativo, cheiro de milho e fogueira.

\- \*\*Paleta:\*\* Vermelho quadrilha `#C8352B`, Amarelo milho `#F2C230`, Verde bandeirola `#3E8E41`, Azul `#2D5DA8`, Palha `#D5B77A`.

\- \*\*Itens típicos:\*\* bandeirolas, painel de xadrez, fardos de palha, mesas de madeira, lampiões, barraquinhas de jogos, balões de festa junina, toalhas quadriculadas.

\- \*\*Motivos:\*\* xadrez, bandeirolas, milho, fogueira.

\- \*\*Combo sugerido:\*\* "Arraial completo" (bandeirolas + barraca + mesa + fardos).

\- \*\*Sazonalidade:\*\* destaque de maio a julho.



\#### Elegante esmeralda — `elegante-esmeralda`

\- \*\*Para:\*\* aniversário adulto, bodas, formatura, jantar em grupo, casamento noturno.

\- \*\*Clima:\*\* sofisticado, noturno, acolhedor com luz baixa.

\- \*\*Paleta:\*\* Esmeralda `#0F5C4D`, Dourado `#C9A24B`, Marfim `#F5EFE0`, Vinho `#6E1F2E`, Carvão `#2B2B2B`.

\- \*\*Itens típicos:\*\* painéis de espelho ou veludo, mesas com toalha escura e detalhes dourados, castiçais e velas, arranjos altos, cadeiras estofadas, iluminação quente.

\- \*\*Motivos:\*\* dourado, veludo, brilho de velas, linhas retas e limpas.

\- \*\*Combo sugerido:\*\* "Jantar de gala" (mesa + castiçais + arranjos + iluminação).



\#### Boteco e churrasco — `boteco-churrasco`

\- \*\*Para:\*\* aniversário adulto informal, confraternização, "churras" de fim de semana.

\- \*\*Clima:\*\* descontraído, de bar de esquina, cheiro de brasa.

\- \*\*Paleta:\*\* Tijolo `#A5442F`, Âmbar `#E0A030`, Verde garrafa `#23573F`, Carvão `#2B2B2B`, Kraft `#C9A87C`.

\- \*\*Itens típicos:\*\* painel de tijolinho, lousas de cardápio, mesas altas e banquetas, luzes de varal, engradados, toalhas xadrez, caixas de som decorativas.

\- \*\*Motivos:\*\* tijolinho, lousa com giz, xadrez, néon quente.

\- \*\*Combo sugerido:\*\* "Bar da chácara" (painel de tijolinho + lousas + mesas altas + luzes).



\#### Cores doces (macaron) — `cores-doces`

\- \*\*Para:\*\* aniversário infantil (fadas, princesas e unicórnios genéricos, sem personagens licenciados), chá de panela, chá de bebê colorido.

\- \*\*Clima:\*\* doce, alegre, pastéis vivos, cara de confeitaria.

\- \*\*Paleta:\*\* Lilás `#CDB4E8`, Rosa `#F7B6D2`, Menta `#BDE8D3`, Azul bebê `#B7D7F5`, Limão claro `#FFF0A8`.

\- \*\*Itens típicos:\*\* arco de balões em tons pastel, painéis coloridos, mesas com toalhas pastel, cúpulas de doces, guirlandas de papel, tapetes fofos.

\- \*\*Motivos:\*\* macarons, nuvens, bolinhas, guirlandas, arco-íris suave.

\- \*\*Combo sugerido:\*\* "Mesa de macarons" (arco de balões + mesa + painel + guirlandas).



\### 15.3 Como criar um estilo novo



1\. Admin → Temas → Novo. Nome, tagline (uma frase), descrição (2 a 3 linhas), \*\*5 cores\*\* com nome, imagem de capa.

2\. Conferir o contraste do texto sobre cada cor (`readableOn` cuida, mas revise a aparência no cartão).

3\. Ligar os itens ao estilo (no cadastro de cada item) e criar o combo do estilo.

4\. Adicionar o slug em `SUGGESTED\_THEMES\_BY\_EVENT` (em `packages/shared`) para os tipos de evento que fazem sentido.

5\. Nada de código de CSS novo: o cartão e o chip leem a paleta dos dados.



\---



\## 16. Voz, copy e microcopy



\### 16.1 Voz



Calorosa, direta e prática, como quem recebe bem na porteira e explica sem enrolar. Fala com a pessoa por \*\*"você"\*\*, em frases curtas, com verbos de ação e \*\*sentence case\*\*. Sem gíria forçada, sem diminutivo em excesso, sem ponto de exclamação em série (no máximo um, em confirmações). Clareza vale mais que graça.



Escreva do ponto de vista de \*\*quem está organizando a festa\*\*: fale de datas, itens e valores, não de "registros", "payloads" ou "entidades".



\### 16.2 Vocabulário fixo



| Use | Evite |

|---|---|

| Reserva, pedido de reserva | Booking, agendamento (na UI use "reserva"; "agendar" só em texto corrido) |

| Diária | Locação, taxa de uso |

| Itens do pegue e monte | Produtos, mercadorias |

| Combo | Kit, pacote (um único nome em todo o sistema) |

| Estilo | Tema (na UI; "tema" é só termo técnico) |

| Solicitar reserva | Comprar, finalizar compra |

| Aguardando confirmação | Pendente |



Uma ação mantém o \*\*mesmo nome em todo o fluxo\*\*: o botão "Solicitar reserva" gera o aviso "Pedido enviado" e o e-mail "Recebemos seu pedido de reserva".



\### 16.3 Rótulos de status



| Status | Rótulo (cliente) | Rótulo (admin) |

|---|---|---|

| `PENDING` | Aguardando confirmação | Aguardando confirmação |

| `CONFIRMED` | Confirmada | Confirmada |

| `CANCELLED` | Cancelada | Cancelada |

| `COMPLETED` | Concluída | Concluída |



Situação de um recebimento do plano de pagamento (9.11), só no painel. No masculino, porque o sujeito é o pagamento. "Pendente" fica de fora pela 16.2: a mesma tela mostra o status da reserva ao lado, e "a receber" diz, do ponto de vista do dono, o que ainda falta entrar.



| Situação | Rótulo |

|---|---|

| `PENDING` | A receber |

| `OVERDUE` | Em atraso |

| `PAID` | Recebido |

| `CANCELLED` | Cancelado (o valor em aberto de reserva cancelada, que deixou de ser cobrado) |



Rótulos de `EventType` viviam em `packages/shared/labels.ts` (Aniversário infantil, Aniversário adulto, Chá de bebê, Chá revelação, Chá de panela, Casamento ou noivado, Formatura, Confraternização, Outro) até o tipo de evento sair do sistema, em outubro de 2026 (seção 8).



\### 16.4 Mensagens de erro



Erro diz \*\*o que aconteceu e o que fazer\*\*, no tom da interface (sem pedir desculpa, sem culpar a pessoa, sem termo técnico).



| Código | Mensagem |

|---|---|

| `DATE\_UNAVAILABLE` | O dia 24/12 acabou de ser reservado. Escolha outra data para continuar. |

| `STOCK\_INSUFFICIENT` | Só temos 1 unidade de "Painel de balões" nessas datas. Ajuste a quantidade. |

| `PRICE\_CHANGED` | O valor mudou de R$ 3.800,00 para R$ 3.950,00. Confira o novo total antes de enviar. |

| `EMAIL\_NOT\_VERIFIED` | Confirme seu e-mail para entrar. Enviamos um link para maria@exemplo.com. |

| `INVALID\_CREDENTIALS` | E-mail ou senha incorretos. Confira e tente de novo. |

| `INVALID\_TOKEN` | Este link expirou ou já foi usado. Peça um novo. |

| `CANCEL\_WINDOW\_CLOSED` | O prazo para cancelar pelo site terminou. Fale com a gente pelo WhatsApp. |

| `TOO\_MANY\_PENDING` | Você já tem 3 pedidos aguardando confirmação. Espere a resposta da chácara para enviar outro. |

| `PAYMENT\_PLAN\_LOCKED` | Esta reserva foi cancelada: o plano de pagamento não pode mais ser alterado. Ao excluir: Há recebimentos registrados neste plano. Desfaça-os antes de excluir. |

| `RATE\_LIMITED` | Muitas tentativas. Tente de novo em alguns minutos. |

| `INTERNAL` | Algo deu errado do nosso lado. Tente de novo em instantes. |

Desde novembro de 2026 (9.12), com uma decoração por pedido, a falta de estoque vira "“Painel de nuvens” não está mais livre nessas datas. Volte à decoração e escolha outra, ou siga sem decoração." Mensagens do wizard que não são código da API, e sim da própria tela:

| Situação | Mensagem |

|---|---|

| Convidados acima do `maxGuests` | São mais pessoas do que a chácara recebe. O máximo é 120. |

| Decoração escolhida em uso nas datas | A decoração escolhida não está livre nessa data. Escolha outra ou siga sem decoração. |

| Decoração sozinha sem decoração | Escolha a decoração da festa. |

| Decoração sozinha sem retirada nem entrega | Escolha se você retira a decoração na chácara ou se ela vai até você. |

| Cartão de decoração indisponível | Em uso nessa data |

| Troca de senha com a senha atual errada | A senha atual não confere. |



\### 16.5 Estados vazios e carregando



Estado vazio convida a agir e diz o próximo passo:



\- Sem reservas: "Você ainda não tem reservas. Veja as datas livres e escolha o estilo da sua festa." + botão "Ver datas".

\- Sem itens no filtro: "Nenhum item desse estilo está livre nessas datas. Tente outro estilo ou ajuste as datas." (Sem estilos desde novembro de 2026: o passo da decoração mostra a que está em uso, desabilitada, e só fica vazio sem decoração nenhuma no catálogo, com "Nenhuma decoração para escolher" e o convite para falar pelo WhatsApp.)

\- Admin sem pedidos: "Nenhum pedido aguardando confirmação."



Carregamento: use \*skeleton\* com o formato do conteúdo. Botão em progresso troca o rótulo ("Enviando pedido…").



\### 16.6 Landing: orientação de conteúdo



Todo texto da landing acima é \*\*provisório\*\* até o dono aprovar. Ao escrever, ancore em fatos verificáveis (capacidade, o que está incluso, horários, endereço) e não invente números, depoimentos, prêmios ou quantidade de festas realizadas. Títulos descrevem o que a pessoa encontra ("Quando é a festa?", "Escolha o estilo da sua festa"), não slogans vagos.



\---



\## 17. E-mails transacionais



| E-mail | Gatilho | Para | Conteúdo essencial |

|---|---|---|---|

| Confirme seu e-mail | Cadastro / reenvio | Cliente | Botão com link do token (24 h), link em texto puro como alternativa |

| Você já tem conta | Cadastro com e-mail existente | Dono do e-mail | Link para entrar e para redefinir senha |

| Redefinir senha | `forgot-password` | Cliente | Botão com link (1 h). "Se não foi você, ignore" |

| Recebemos seu pedido de reserva | `PENDING` criada | Cliente | Datas, itens, total, até quando as datas ficam seguras, link para a reserva |

| Novo pedido de reserva | `PENDING` criada | Admin | Cliente, datas, total, link direto para `/admin/reservas/:id` |

| Reserva confirmada | `CONFIRMED` | Cliente | Datas, horários de entrada e saída, endereço, regras da casa, valor |

| Reserva cancelada | `CANCELLED` | Cliente | Motivo (quando informado), como falar com a chácara |

| Pedido expirou | Job `expire-holds` | Cliente | As datas foram liberadas, link para refazer o pedido |

| Lembrete | (fase futura) 3 dias antes | Cliente | Horário, endereço, dicas de montagem |



Regras:



\- Template em funções TypeScript simples (`lib/mail/templates.ts`), sem motor de template. Coluna única de 560 px, CSS inline, estrutura em tabela, fonte `Georgia` nos títulos e sistema no corpo (as fontes da web não carregam bem em e-mail).

\- Sempre \*\*versão em texto puro\*\* e \*preheader\*. Botão principal em `--ipe-400` com texto `--ink`, cabeçalho em `--forest-700`.

\- Assunto direto e específico ("Confirme seu e-mail para acessar sua conta"). Nada de assunto em caixa-alta.

\- Falha ao enviar e-mail \*\*não desfaz\*\* cadastro nem reserva: registra o erro no log e segue. Para a confirmação de e-mail, o usuário sempre pode pedir reenvio.

\- No domínio de envio, configure SPF, DKIM e DMARC antes de ir para produção.

\- Desde novembro de 2026 (9.12), os três e-mails da reserva de decoração (recebemos, novo pedido e confirmada) têm a linha de como ela chega: "Retirada na chácara" ou "Entrega em <endereço>. A taxa de entrega é combinada com a chácara.", e mandam combinar a retirada ou a entrega, conforme o caso.



\---



\## 18. Acessibilidade, performance e SEO



\### 18.1 Acessibilidade (piso de qualidade, não opcional)



\- Contraste AA. Foco visível em todo elemento interativo (`outline: 3px solid var(--focus)` com `outline-offset: 2px`). Nunca remova o outline sem substituir.

\- Navegação completa por teclado: calendário, galeria ampliada, diálogos, gavetas, tabelas.

\- Semântica correta (`button` é `button`, `a` é `a`, `nav`, `main`, títulos em ordem). Um `h1` por página.

\- Campos com rótulo visível, erros anunciados (`role="alert"` no resumo de erros do formulário).

\- Alvos de toque de pelo menos 44 × 44 px.

\- `prefers-reduced-motion` respeitado (14.8). Nada depende só de cor.

\- Idioma do documento `lang="pt-BR"`.



\### 18.2 Performance



\- Metas na landing (mobile, rede 4G): LCP abaixo de 2,5 s, CLS abaixo de 0,1, INP abaixo de 200 ms.

\- Bundle: rotas com `React.lazy` (admin sempre separado), imagens com `srcset`, fonte com `preload`, sem biblioteca pesada na landing.

\- Consultas da API com `select` do necessário e índices nas colunas de filtro (`Booking(status, startDate)`). Sem N+1 (use `include` ou consultas em lote).

\- Disponibilidade e catálogo com cache HTTP curto; o TanStack Query com `staleTime` de 30 s para disponibilidade.



\### 18.3 SEO



O SPA renderiza no cliente, o que \*\*prejudica\*\* a busca por "chácara para festa em \[cidade]". Mitigação em camadas:



1\. `index.html` com `title`, `description`, Open Graph, `canonical` e JSON-LD `LocalBusiness` (nome, endereço, telefone, imagens).

2\. `robots.txt` e `sitemap.xml` estáticos, bloqueando `/admin`, `/minhas-reservas` e `/reservas`.

3\. \*\*Fase 6:\*\* pré-renderização estática da landing no build (script simples de prerender ou ferramenta de SSG). Só então avalie se ainda precisa de algo maior.

4\. Páginas do wizard e do admin com `noindex`.



\---



\## 19. Testes



| Nível | Ferramenta | O que cobrir |

|---|---|---|

| Unidade (API) | Vitest | `applyCombos`/`computeQuote`, resolução de `PriceRule`, helpers de data e dinheiro |

| Integração (API) | Vitest + `app.inject` + Postgres de teste | Auth completo, criação de reserva, conflito de datas, estoque, transições de status, permissões |

| Concorrência | Vitest | N reservas simultâneas para o mesmo dia: \*\*exatamente uma\*\* passa; N pedidos disputando estoque limitado |

| Front | Vitest + Testing Library | Só o que tem lógica: reducer do wizard, mapeamento de erros, `readableOn`, formatadores |

| E2E | Playwright | \*\*Um\*\* caminho feliz: landing → tipo, data, convidados e decoração → cadastro/login → solicitar reserva → admin confirma |



Casos de preço que \*\*precisam\*\* existir como teste (cada um com o resultado esperado em centavos):



1\. Diária de dia útil vs. fim de semana (regra por dia da semana).

2\. Regra por período (Réveillon) com prioridade maior sobrepondo a de fim de semana.

3\. Empate de prioridade: vence a mais específica, depois o menor id.

4\. Sem regra aplicável: usa `baseDailyPriceCents`.

5\. Combo `PERCENT` aplicado uma vez.

6\. Combo `FIXED\_PRICE` com preço fechado maior que a soma (desconto zero, nada negativo).

7\. Mesmo combo aplicado duas vezes quando a quantidade permite.

8\. Dois combos disputando o mesmo item: aplica o de maior economia, e o outro só se sobrar saldo.

9\. Item em quantidade insuficiente para o combo: combo não aplica.

10\. Total nunca negativo.



Casos do plano de pagamento (9.11) que \*\*precisam\*\* existir como teste (em `apps/api/test/admin-finance.test.ts`):



1\. Soma diferente do total da reserva é recusada, e o plano anterior fica como estava.

2\. As parcelas são numeradas pelo vencimento, venham na ordem que vierem.

3\. Recebimento com data depois de hoje é recusado.

4\. Reserva cancelada não aceita plano novo, mas aceita anotar recebimento; o que estava em aberto vira `CANCELLED` e sai do financeiro, e o recebido continua contando.

5\. Plano com recebimento anotado não pode ser excluído.

6\. Salvamentos simultâneos do mesmo plano terminam todos, e o último vence.

7\. O financeiro conta o mês pelo vencimento e junta os atrasados de todos os meses.



Casos da decoração completa, da retirada ou entrega e do perfil (9.12, 10.5) que \*\*precisam\*\* existir como teste (na API, em `booking-fulfillment`, `decoration-availability`, `profile-address` e `auth-change-password`; no site, em `features/booking` e `features/account`):



1\. Na chácara, a decoração sai pelo preço com a chácara; na decoração sozinha, pelo avulso; e o orçamento não aplica combo.

2\. O pedido do cliente com duas decorações, ou com quantidade 2, é recusado. O lançamento do painel não tem esse limite.

3\. Decoração sem retirada nem entrega é recusada; na chácara, o que vier é ignorado.

4\. Entrega sem endereço no perfil é recusada. Com endereço, a reserva guarda a cópia, e mudar o perfil depois não muda a reserva.

5\. A agenda de uma decoração fica `booked` no dia em que todo o estoque dela já saiu, por reserva de qualquer produto, e `blocked` no dia em que a decoração está fechada.

6\. O estoque livre do período é o do pior dia, e zero com a decoração fechada.

7\. Na troca de senha, a senha atual errada responde 400 no campo `currentPassword`, e a troca certa derruba as outras sessões.

8\. O wizard não deixa pular pergunta, trava os convidados no `maxGuests` e não deixa escolher a decoração em uso nas datas.



Regras: testes de integração usam banco próprio (`DATABASE\_URL` de teste), migrations aplicadas e limpeza entre testes. Nada de mock do Prisma, o valor está em testar a constraint e a transação de verdade.



\---



\## 20. Deploy, CI e operação



\### 20.1 Ambientes



| Ambiente | Onde | Observações |

|---|---|---|

| Local | Docker (Postgres) + `pnpm dev` | `.env` local, e-mail em modo log (imprime o link no console) |

| Produção | SPA na \*\*Vercel\*\*; API e Postgres na \*\*Render\*\*; Cron Jobs da Render | Segredos só nas variáveis do painel |



Se houver ambiente de homologação, ele espelha a produção com banco separado.



\### 20.2 API na Render



\- Build: `pnpm i --frozen-lockfile \&\& pnpm --filter api build`.

\- Antes de subir: `pnpm --filter api prisma migrate deploy` (comando de \*pre-deploy\* ou parte do start). \*\*Nunca\*\* `migrate dev` em produção.

\- Health check em `/api/health` (retorna 200 e confere a conexão com o banco).

\- Instância que "dorme" por inatividade causa demora na primeira requisição: em produção use um plano sempre ativo.

\- `trustProxy: true`. Logs em JSON (pino) para a plataforma coletar.

\- Conferir no painel as opções de backup do Postgres para o plano contratado e \*\*testar uma restauração\*\* antes de depender delas.



\### 20.3 SPA na Vercel



\- Projeto apontando para `apps/web`. Build `pnpm --filter web build`, saída `dist`.

\- `vercel.json`:



```json

{

&#x20; "rewrites": \[

&#x20;   { "source": "/api/:path\*", "destination": "https://SUA-API.onrender.com/api/:path\*" },

&#x20;   { "source": "/((?!api/).\*)", "destination": "/index.html" }

&#x20; ]

}

```



\- Cabeçalhos de segurança (CSP, `X-Content-Type-Options`, `Referrer-Policy`) configurados aqui. A CSP libera apenas o próprio domínio, o Google Identity, o CDN de imagens usado, em `frame-src` o mapa do Google (`https://www.google.com`, ver 10.7) e, em `connect-src`, o ViaCEP (`https://viacep.com.br`), que a busca do CEP chama direto do navegador (9.12).



\### 20.4 CI (GitHub Actions)



Um workflow simples: instala, `typecheck`, `lint`, sobe Postgres como \*service container\*, aplica migrations e roda `test`. Bloqueia merge se falhar. Sem pipeline complexo.



\### 20.5 Observabilidade



\- Logs estruturados (pino, já nativo no Fastify) com `reqId` por requisição. Redigir campos sensíveis.

\- Captura de erros do front e da API com uma ferramenta gerenciada (ex.: Sentry) \*\*quando\*\* houver tráfego real. Não antes.

\- Métricas de negócio no dashboard do admin (pedidos aguardando, ocupação), sem ferramenta externa no MVP.



\---



\## 21. Roadmap por fases



Cada fase termina com o que está pronto e \*\*critérios de aceite verificáveis\*\*.



\*\*Fase 1: Base\*\*

\- Monorepo, Prisma, schema e migrations (incluindo a constraint de sobreposição), seed (admin, settings, temas), CI, deploy inicial (API + banco + SPA "hello").

\- \*Aceite:\* `pnpm dev` sobe tudo do zero; `pnpm test` roda no CI; `/api/health` responde em produção.



\*\*Fase 2: Autenticação\*\*

\- Cadastro com confirmação por e-mail, login, refresh com rotação, logout, esqueci a senha, Google.

\- \*Aceite:\* fluxo completo em produção com e-mail real; reuso de refresh token revoga a família (teste); login bloqueado sem confirmação.



\*\*Fase 3: Catálogo e preço\*\*

\- Itens, categorias, temas, combos, regras de preço, `pricing/quote`, telas admin correspondentes.

\- \*Aceite:\* os 10 casos de preço da seção 19 passam; admin cria item, tema, combo e regra sem ajuda de dev.



\*\*Fase 4: Reservas\*\*

\- Disponibilidade, criação transacional com constraint e estoque, cancelamento, jobs de expiração/conclusão, e-mails de status.

\- \*Aceite:\* teste de concorrência passa; reserva `PENDING` expirada libera a data; e-mails chegam em cada transição.



\*\*Fase 5: Admin de reservas\*\*

\- Dashboard, calendário, bloqueio de datas, lista e detalhe de reservas, confirmação/cancelamento, reserva manual, clientes, configurações.

\- \*Aceite:\* o dono opera o dia a dia inteiro só pelo admin, no celular.



\*\*Fase 6: Landing e polimento\*\*

\- Landing completa com fotos reais, wizard refinado, galeria, FAQ, prerender, LGPD (`DELETE /me`), acessibilidade e performance nas metas, E2E.

\- \*Aceite:\* metas de LCP/CLS atingidas; Lighthouse de acessibilidade sem falhas críticas; E2E verde.



\---



\## 22. Fora do escopo e extensões futuras



Fora do MVP (não implemente sem pedido explícito):



\- \*\*Pagamento online\*\* (sinal via Pix/cartão). A reserva nasce `PENDING` e o dono combina o sinal por fora. Desde novembro de 2026 o painel \*\*anota\*\* o sinal e as parcelas combinados por fora (9.11), sem cobrar nada pelo site.

\- \*\*Notificações por WhatsApp\*\* automáticas (o MVP usa link para conversa manual).

\- \*\*Reserva só de itens\*\*, sem a chácara (pegue e monte avulso), com datas de retirada e devolução. O modelo foi pensado para receber isso depois, com um tipo de reserva.

\- \*\*Dia de montagem\*\* com preço próprio (o dia anterior à festa).

\- Entrega e montagem pela equipe, frete. (Desde novembro de 2026 a decoração sozinha pode ser \*\*entregue\*\* no endereço do cliente, com a taxa combinada por fora, 9.12. Calcular o frete no site e a montagem pela equipe continuam fora.)

\- \*\*Troca de e-mail pelo cliente\*\*, com código de confirmação no e-mail novo (pedido do dono em novembro de 2026, para uma etapa seguinte). Até lá, o e-mail aparece em "Meu perfil" só para leitura.

\- \*\*Mais de uma decoração por pedido\*\* do site. Desde novembro de 2026 cada item é uma decoração completa e o pedido leva uma (9.12); o painel continua lançando mais de uma.

\- Multiunidade (mais de uma chácara) e multi-empresa.

\- Avaliações de clientes dentro do sistema.

\- Cupom de desconto, programa de fidelidade.

\- Assinatura digital de contrato.



\---



\## 23. Decisões em aberto e suposições



Suposições atuais (adotadas para poder construir; confirmar com o dono):



| # | Tema | Suposição |

|---|---|---|

| 1 | Pagamento | Fora do MVP; o dono confirma a reserva e combina o sinal por fora |

| 2 | Tipo de reserva | Por \*\*dia inteiro\*\*, com intervalo de dias (`minDays`/`maxDays` configuráveis). Se houver turnos ou horários, o modelo de conflito muda |

| 3 | Aprovação | \*\*Manual\*\* pelo admin. Aprovação automática é uma configuração futura |

| 4 | Segurar datas | `PENDING` segura por `holdHours` (48 h) e depois libera sozinha |

| 5 | Preço dos itens | \*\*Por reserva\*\* (uma vez no período), não por dia. Se o dono cobrar por dia, `itemsTotal` passa a multiplicar pelo número de dias |

| 6 | Estoque | `stock` do item vale \*\*por dia\*\*; item só é aceito se houver estoque em todos os dias |

| 7 | Cancelamento | Cliente cancela sem custo até `freeCancelUntilDays` (7) antes; depois, só o admin |

| 8 | Login social | \*\*Google\*\* (via `id\_token`). Outros provedores só se o dono pedir |

| 9 | Imagens | Admin informa \*\*URLs\*\* de um CDN/storage (ex.: Cloudinary). Upload direto pela API é fase futura |

| 10 | Combos | Não acumulam sobre o mesmo item; escolha gulosa pela maior economia |

| 11 | Limites | `maxDays = 3`, `maxPendingPerUser = 3`, antecedência mínima de 2 dias |

| 12 | Cadastro | E-mail e telefone obrigatórios para reservar; conta criada pelo admin pode não ter e-mail |



Quando uma decisão for confirmada ou mudar, \*\*atualize esta tabela\*\* no mesmo PR que muda o código.



\---



\## 24. Definition of Done



Uma tarefa só está pronta quando \*\*todos\*\* os itens aplicáveis estão verdadeiros:



\- \[ ] Segue as regras da seção 2 (nada da lista "Nunca").

\- \[ ] `pnpm typecheck \&\& pnpm lint \&\& pnpm test` passam.

\- \[ ] Toda rota nova valida entrada e saída com Zod e usa o formato de erro padrão.

\- \[ ] Mudança de schema tem \*\*nova\*\* migration (com SQL manual comentado, se for o caso).

\- \[ ] Regra de negócio nova ou alterada tem teste e está descrita neste arquivo.

\- \[ ] Dinheiro em centavos, datas como `YYYY-MM-DD`, preço calculado só no servidor.

\- \[ ] UI usa tokens (sem hex solto), textos em pt-BR conforme a seção 16, foco visível e navegação por teclado funcionando.

\- \[ ] Testado em tela de celular (\~375 px) e desktop.

\- \[ ] Nenhum segredo, token ou dado pessoal em código, log ou commit.

\- \[ ] `.env.example` e este `AGENTS.md` atualizados quando necessário.

\- \[ ] Nenhuma dependência nova sem justificativa no PR.

