# Últimas alterações

Resumo do que mudou no projeto, do mais recente para o mais antigo. Abra este
arquivo ao voltar ao repositório para saber onde as coisas pararam.

---

## 2026-08-29 — Dev local sem Docker (`693a6c7`)

Agora dá para rodar o backend inteiro na sua máquina sem instalar Docker nem
Postgres.

- **`server/scripts/local-dev.mjs`**: sobe um Postgres embarcado (PGlite) num
  socket TCP e importa o backend já compilado. Um comando só. Os dados ficam em
  `server/.localdb` (fora do Git), então reiniciar não perde o que já coletou.
- **`vite.config.ts`**: proxy `/api` e `/health` apontando para o backend local,
  evitando CORS no desenvolvimento.
- **`.gitignore`**: ignora `server/.localdb`.

**Como rodar localhost:**
1. Backend: dentro de `server/`, `node scripts/local-dev.mjs` (sobe em :8080).
2. Frontend: na raiz, `npm run dev` (Vite em :5173).
3. Acesse `http://localhost:5173/admin/mercado`.

Admin: quem loga com um e-mail listado em `ADMIN_BOOTSTRAP_EMAILS` vira admin no
primeiro acesso (hoje: `marlon@athaydeadvogados.com.br`, `gabrielvanni52@gmail.com`).

---

## 2026-08-29 — Módulo de Market Intelligence + backend self-hosted (`044a7ac`)

Painel admin real (não mockup) que analisa a liquidez de Limiteds para achar
itens compráveis baratos e revendidos rápido, e migração do backend do Firebase
para uma stack gratuita (Node + Express + Postgres), pensada para rodar de graça
na Oracle Cloud Always Free (ver `server/DEPLOY.md`).

- **Painel** `/admin/mercado`: ranking de liquidez, oportunidades, simulador de
  lucro, montador de lotes e monitor de coletores.
- **Score de liquidez** com 6 componentes ponderados, penalidade para dados
  projetados e fator de confiança que amadurece em 14 dias.
- **Coletores** (node-cron) puxando dados reais da Roblox (resale-data,
  resellers, batch de itens, catálogo, thumbnails) e Rolimon's.
- **Filtro de sanidade** que descarta anúncios-piada (>10× ou <5% do RAP).
- **Dirty-check** para minimizar escritas no banco.
- **Auth** por verificação de token do Firebase + papel de admin no Postgres.

---

## 2026-08-27 — Autenticação com Firebase e telas de estado (`03a7891`)

Login com Firebase Auth e as telas de estado (carregando, erro, vazio).
