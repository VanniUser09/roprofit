# RoProfit

Plataforma de trading de Limiteds/Robux da Roblox, com um módulo admin de
**Market Intelligence** que analisa a liquidez dos Limiteds para achar itens
compráveis baratos e revendidos rápido — a base da operação: comprar Limited →
revender no Marketplace → receber Robux líquido (após a taxa de 30%) → vender os
Robux.

- **Frontend:** Vite + React + TypeScript + Tailwind, login com Firebase Auth.
- **Backend:** Node + Express + Postgres, com coletores (node-cron) puxando
  dados reais da Roblox e do Rolimon's. Pensado para rodar de graça na Oracle
  Cloud Always Free — ver [`server/DEPLOY.md`](server/DEPLOY.md).

## Rodar localmente

Sem Docker nem Postgres instalado (usa um Postgres embarcado):

```bash
# 1) Backend — dentro de server/ (sobe em :8080, dados em server/.localdb)
cd server && node scripts/local-dev.mjs

# 2) Frontend — na raiz, noutro terminal (Vite em :5173)
npm run dev
```

Acesse `http://localhost:5173/admin/mercado`.

Quem loga com um e-mail listado em `ADMIN_BOOTSTRAP_EMAILS` vira admin no
primeiro acesso.

## Estrutura

- `src/` — frontend (painel, telas, auth).
- `server/` — backend self-hosted (API, coletores, banco). Ver `server/DEPLOY.md`.
- `functions/` — backend antigo em Firebase (mantido só como referência).

---

# Últimas alterações

Do mais recente para o mais antigo. Abra ao voltar ao projeto para saber onde as
coisas pararam.

## 2026-08-29 — Dev local sem Docker (`693a6c7`)

Dá para rodar o backend inteiro na sua máquina sem instalar Docker nem Postgres.

- **`server/scripts/local-dev.mjs`**: sobe um Postgres embarcado (PGlite) num
  socket TCP e importa o backend já compilado. Um comando só. Os dados ficam em
  `server/.localdb` (fora do Git), então reiniciar não perde o que já coletou.
- **`vite.config.ts`**: proxy `/api` e `/health` para o backend local, evitando
  CORS no desenvolvimento.
- **`.gitignore`**: ignora `server/.localdb`.

## 2026-08-29 — Módulo de Market Intelligence + backend self-hosted (`044a7ac`)

Painel admin real (não mockup) de análise de liquidez de Limiteds, e migração do
backend do Firebase para uma stack gratuita (Node + Express + Postgres).

- **Painel** `/admin/mercado`: ranking de liquidez, oportunidades, simulador de
  lucro, montador de lotes e monitor de coletores.
- **Score de liquidez** com 6 componentes ponderados, penalidade para dados
  projetados e fator de confiança que amadurece em 14 dias.
- **Coletores** puxando dados reais da Roblox (resale-data, resellers, batch de
  itens, catálogo, thumbnails) e Rolimon's.
- **Filtro de sanidade** que descarta anúncios-piada (>10× ou <5% do RAP).
- **Dirty-check** para minimizar escritas no banco.
- **Auth** por verificação de token do Firebase + papel de admin no Postgres.

## 2026-08-27 — Autenticação com Firebase e telas de estado (`03a7891`)

Login com Firebase Auth e as telas de estado (carregando, erro, vazio).
