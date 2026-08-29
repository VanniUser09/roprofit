# Market Intelligence — backend

Painel administrativo de análise de mercado de Limiteds. Ferramenta de
inteligência: **não executa compras nem vendas**, só lê dados públicos e calcula.

## Como o dado atravessa o sistema

```
sources/      HTTP + rate limit. Trocar de API mexe SÓ aqui.
   ↓
normalizer/   schemas zod → formato canônico (types.ts)
   ↓
collectors/   orquestração, filas, tiers, dirty-check
   ↓
repository/   única camada que conhece o Firestore
   ↓
analytics/    velocidade, volatilidade, percentis, sanidade de preço
   ↓
liquidity/    componentes, pesos, confiança → score
   ↓
opportunity/  filtros, simulador, montador de lotes
   ↓
api/          HTTP + requireAdmin + auditoria
```

Regra que sustenta tudo: **nada acima de `sources/` sabe o nome de nenhuma API
externa.**

## APIs externas — estado verificado em 28/08/2026

| Endpoint | Auth | Limite medido | Uso |
|---|---|---|---|
| `apis.roblox.com/marketplace-items/v1/items/details` (POST) | não | 60/60s · 70k/dia | preço, estoque, revendedores — em lote |
| `apis.roblox.com/marketplace-sales/v1/item/{ciid}/resale-data` | não | 50/60s · 70k/dia | série diária de preço e volume |
| `apis.roblox.com/marketplace-sales/v1/item/{ciid}/resellers` | não | 50/60s | book de ofertas completo |
| `catalog.roblox.com/v1/catalog/items/{id}/details` | não | **429 com rajada** | mapeamento assetId → collectibleItemId |
| `thumbnails.roblox.com/v1/assets` | não | 50/s | thumbnails em lote |
| `www.rolimons.com/itemapi/itemdetails` | não | 1/min · crawl-delay 2 | catálogo, Value, Demand, Trend |

### Não usar

- **`economy.roblox.com/v1/assets/{id}/resale-data`** — responde 200 mas as
  séries estão congeladas em **30/01/2025** e o RAP diverge ~8% do real.
  Depreciado pela Roblox. Usar isso é ler janeiro de 2025 achando que é hoje.
- **`economy.roblox.com/v1/assets/{id}/resellers`** — 401 sem cookie de sessão.
- **`POST catalog.roblox.com/v1/catalog/items/details`** (lote) — 403, exige
  XSRF de sessão autenticada.
- **Qualquer uma delas do navegador** — não enviam header CORS, e o limite é por
  IP: cada usuário queimaria a cota. Toda coleta é server-side.

## Coletores

| Function | Agenda | Por quê essa cadência |
|---|---|---|
| `scheduledRolimons` | 10 min | a fonte limita a 1 req/min |
| `scheduledMarketplaceItems` | 15 min | 26 requisições cobrem ~2.500 itens |
| `scheduledResellers` | 15 min | o book muda o tempo todo — é a janela intradiária |
| `scheduledDailySales` | 6 h | **a fonte é diária**: buscar mais traria o mesmo número |
| `scheduledBackfill` | 1 min | fila priorizada; o catalog 429 com rajada |
| `scheduledMetrics` | 15 min | Analytics + Liquidity Engine |
| `scheduledTiers` | diário 04h | reavalia quem entra na coleta cara |
| `scheduledAlerts` | 15 min | aplica as regras |

Orçamento projetado: **~24.400 requisições/dia de 70.000** permitidas.

## Rodando localmente

Requer JDK para o emulador do Firestore. `firebase-tools@14` é o que funciona
aqui: a 15 exige JDK 21+, e a 13 quebra com `firebase-functions@7`
(chama `functions.config()`, removido na v7).

```bash
npm --prefix functions run build
npm run emulators
```

## Verificações

Todas rodam contra as APIs reais ou os emuladores — nenhuma usa dado fictício.

```bash
npm --prefix functions run check:contract   # as 6 fontes respondem no formato esperado
npm --prefix functions run check:score      # Liquidity Score em Limiteds reais
npm --prefix functions run check:sim        # simulador confere com o exemplo do plano
npm --prefix functions run check:e2e        # API + claims + validação (precisa dos emuladores)
npm --prefix functions run check:pipeline   # coleta → Firestore → métricas (precisa dos emuladores)
npm --prefix functions run check:batches    # montador de lotes sobre universo real
```

## Primeiro admin

O primeiro admin não pode ser criado por outro admin — não existe nenhum. Duas saídas:

```bash
# 1. Allowlist de bootstrap (permite auto-promoção uma vez)
firebase functions:secrets:set ADMIN_BOOTSTRAP_EMAILS
# valor: email1@dominio.com,email2@dominio.com

# 2. Direto pelo Admin SDK, para recuperar acesso perdido
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
  node --experimental-strip-types functions/scripts/grant-admin.ts email@dominio.com
```

Depois de promovido, o usuário precisa sair e entrar de novo — a claim só entra
no token na renovação.

## Decisões que valem registrar

**`item_metrics` é coleção raiz, não subcoleção.** Ranking e Oportunidades
ordenam *entre* itens; como subcoleção exigiria collection group query com
índices frágeis. Plana, cabe inteira na memória de uma Function (~2 MB) e
permite filtro multi-critério sem a limitação de desigualdades do Firestore.

**Snapshot só é gravado se algo mudou.** Sem o dirty-check seriam ~240 mil
escritas/dia, quase todas idênticas à anterior.

**O score é reduzido de propósito quando o histórico é curto.** O fator de
confiança sobe ao longo de 14 dias. Exibir um score cheio sem histórico próprio
seria afirmar precisão que não temos.

**Ofertas irreais são descartadas antes de virar preço.** O Domino Crown tem uma
oferta a 68 bilhões de Robux; sem `analytics/sanity.ts` ela vira "preço atual" e
o item lidera a página de Oportunidades como estando 1.199.446% acima do RAP.

**O token bucket começa com um crédito, não cheio.** Descoberto na prática: com
o balde cheio, a primeira ação de um coletor é disparar `burst` requisições de
uma vez, e o catalog devolve 429 já no oitavo item mesmo com a média por minuto
dentro do limite.

## Limitações conhecidas

- A Roblox só publica **volume diário**. Vendas/hora e o intervalo entre vendas
  são derivados dos nossos snapshots do book (resolução de 15 min), não da fonte.
- Vemos ofertas abertas, não vendas fechadas. Uma listagem removida pelo
  vendedor produz o mesmo sinal de uma venda — por isso exigimos duas condições
  (menos ofertas **e** mínima subindo) antes de contar como venda.
- Os endpoints da Roblox usados aqui são internos e sem contrato público; o
  Rolimons não tem API oficial. O sistema é desenhado para **degradar**, não
  quebrar, quando uma fonte sai do ar — a página `/admin/mercado/coletores`
  mostra quando isso acontece.
- Firestore não é banco de série temporal. TTL de 90 dias nos snapshots; se o
  histórico crescer além disso, exportar para BigQuery.
