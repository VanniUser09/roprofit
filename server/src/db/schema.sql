-- RoProfit — Market Intelligence · esquema Postgres
--
-- Substitui as coleções do Firestore. Duas mudanças de fundo em relação ao
-- desenho anterior, ambas a favor:
--
--  1. Não há custo por escrita. O dirty-check continua existindo (evita I/O e
--     ruído), mas deixou de ser uma questão de fatura.
--  2. Janela móvel, percentil e agregação viram SQL, em vez de varrer documentos
--     em JavaScript. A leitura de 241 mil documentos/dia que o Firestore cobrava
--     simplesmente deixa de acontecer.
--
-- Idempotente: pode rodar de novo sem quebrar (IF NOT EXISTS em tudo).

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo. Muda raramente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS limiteds (
  asset_id             BIGINT PRIMARY KEY,
  collectible_item_id  TEXT,
  name                 TEXT NOT NULL,
  acronym              TEXT,
  asset_type           INTEGER,
  thumbnail_url        TEXT,
  total_quantity       INTEGER,
  created_utc          TIMESTAMPTZ,
  tier                 TEXT NOT NULL DEFAULT 'B' CHECK (tier IN ('A', 'B')),
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  needs_mapping        BOOLEAN NOT NULL DEFAULT TRUE,
  mapping_priority     INTEGER NOT NULL DEFAULT 10,
  source_roblox        BOOLEAN NOT NULL DEFAULT FALSE,
  source_rolimons      BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at         TIMESTAMPTZ,
  resellers_checked_at TIMESTAMPTZ,
  daily_checked_at     TIMESTAMPTZ
);

-- Fila do backfill: parcial, então o índice só cobre o que falta mapear.
CREATE INDEX IF NOT EXISTS idx_limiteds_unmapped
  ON limiteds (mapping_priority DESC)
  WHERE needs_mapping;

-- Rodízio do coletor de book: Tier A ativo, mais velho primeiro.
CREATE INDEX IF NOT EXISTS idx_limiteds_resellers
  ON limiteds (resellers_checked_at ASC NULLS FIRST)
  WHERE active AND tier = 'A';

CREATE INDEX IF NOT EXISTS idx_limiteds_daily
  ON limiteds (daily_checked_at ASC NULLS FIRST)
  WHERE active;

-- ─────────────────────────────────────────────────────────────────────────────
-- Nossa série própria, a cada 15 min. É a maior tabela — a retenção é
-- controlada por TTL na aplicação (config.snapshotTtlDays).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snapshots (
  asset_id            BIGINT NOT NULL REFERENCES limiteds(asset_id) ON DELETE CASCADE,
  t                   TIMESTAMPTZ NOT NULL,
  rap                 BIGINT,
  value               BIGINT,
  demand              SMALLINT,
  trend               SMALLINT,
  projected           BOOLEAN NOT NULL DEFAULT FALSE,
  hyped               BOOLEAN NOT NULL DEFAULT FALSE,
  rare                BOOLEAN NOT NULL DEFAULT FALSE,
  lowest_resale_price BIGINT,
  second_lowest_price BIGINT,
  reseller_count      INTEGER,
  book_depth_10       INTEGER,
  units_available     INTEGER,
  asset_stock         INTEGER,
  spread_pct          DOUBLE PRECISION,
  source              TEXT NOT NULL,
  PRIMARY KEY (asset_id, t)
);

-- Consultas são sempre "deste item, desta janela para cá".
CREATE INDEX IF NOT EXISTS idx_snapshots_asset_time
  ON snapshots (asset_id, t DESC);

-- Varredura do TTL: "tudo mais velho que X", entre todos os itens.
CREATE INDEX IF NOT EXISTS idx_snapshots_time
  ON snapshots (t);

-- ─────────────────────────────────────────────────────────────────────────────
-- Série diária da Roblox. Permanente e magra. Id = data, então reprocessar é
-- idempotente (ON CONFLICT).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_points (
  asset_id  BIGINT NOT NULL REFERENCES limiteds(asset_id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  avg_price BIGINT,
  volume    INTEGER,
  PRIMARY KEY (asset_id, date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Métricas derivadas. Uma linha por item. É o que o painel consome.
-- Colunas escalares onde o Firestore tinha um documento; os componentes do
-- score, que são um objeto pequeno e sempre lido junto, ficam em JSONB.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_metrics (
  asset_id            BIGINT PRIMARY KEY REFERENCES limiteds(asset_id) ON DELETE CASCADE,
  collectible_item_id TEXT,
  name                TEXT NOT NULL,
  acronym             TEXT,
  thumbnail_url       TEXT,
  tier                TEXT NOT NULL DEFAULT 'B',
  active              BOOLEAN NOT NULL DEFAULT TRUE,

  liquidity_score     INTEGER NOT NULL DEFAULT 0,
  components          JSONB NOT NULL DEFAULT '{}',
  confidence          DOUBLE PRECISION NOT NULL DEFAULT 0,

  sales_per_hour      DOUBLE PRECISION,
  sales_per_day_24h   DOUBLE PRECISION,
  sales_per_day_7d    DOUBLE PRECISION,
  sales_per_day_30d   DOUBLE PRECISION,
  sales_total_7d      DOUBLE PRECISION,
  sales_total_30d     DOUBLE PRECISION,

  median_gap_hours    DOUBLE PRECISION,
  p25_gap_hours       DOUBLE PRECISION,
  p75_gap_hours       DOUBLE PRECISION,

  rap                 BIGINT,
  value               BIGINT,
  demand              SMALLINT,
  trend               SMALLINT,
  projected           BOOLEAN NOT NULL DEFAULT FALSE,
  lowest_resale_price BIGINT,
  avg_price_7d        DOUBLE PRECISION,
  avg_price_30d       DOUBLE PRECISION,
  min_price_7d        BIGINT,
  max_price_7d        BIGINT,
  rap_discount_pct    DOUBLE PRECISION,
  volatility_30d      DOUBLE PRECISION,
  price_trend_7d      DOUBLE PRECISION,
  spread_pct          DOUBLE PRECISION,
  book_depth_10       INTEGER,
  reseller_count      INTEGER,
  asset_stock         INTEGER,

  history_days        INTEGER NOT NULL DEFAULT 0,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_age_hours      DOUBLE PRECISION
);

-- Ranking de liquidez: só itens ativos, do maior score para o menor.
CREATE INDEX IF NOT EXISTS idx_metrics_liquidity
  ON item_metrics (liquidity_score DESC)
  WHERE active;

-- Faixa de preço do montador de lotes e da página de Oportunidades.
CREATE INDEX IF NOT EXISTS idx_metrics_price
  ON item_metrics (lowest_resale_price)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_metrics_discount
  ON item_metrics (rap_discount_pct)
  WHERE active;

-- ─────────────────────────────────────────────────────────────────────────────
-- Agregados globais do Market Overview. Série própria, para variação 24h.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_snapshots (
  t     TIMESTAMPTZ PRIMARY KEY,
  data  JSONB NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Alertas configuráveis.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id             TEXT PRIMARY KEY,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  label          TEXT NOT NULL,
  metric         TEXT NOT NULL,
  operator       TEXT NOT NULL CHECK (operator IN ('gt', 'lt')),
  threshold      DOUBLE PRECISION NOT NULL,
  min_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  price_min      BIGINT,
  price_max      BIGINT,
  severity       TEXT NOT NULL DEFAULT 'info',
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id            BIGSERIAL PRIMARY KEY,
  rule_id       TEXT NOT NULL,
  rule_label    TEXT NOT NULL,
  asset_id      BIGINT NOT NULL,
  item_name     TEXT NOT NULL,
  thumbnail_url TEXT,
  metric        TEXT NOT NULL,
  value         DOUBLE PRECISION NOT NULL,
  threshold     DOUBLE PRECISION NOT NULL,
  severity      TEXT NOT NULL,
  message       TEXT NOT NULL,
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Caixa de alertas: não lidos primeiro, mais recentes no topo.
CREATE INDEX IF NOT EXISTS idx_alerts_unread
  ON alerts (created_at DESC)
  WHERE NOT read;

-- Cooldown por item+regra: a última vez que cada par disparou.
CREATE INDEX IF NOT EXISTS idx_alerts_rule_asset
  ON alerts (rule_id, asset_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Observabilidade e segurança.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collector_runs (
  id              BIGSERIAL PRIMARY KEY,
  collector       TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,
  status          TEXT NOT NULL DEFAULT 'running',
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_written   INTEGER NOT NULL DEFAULT 0,
  request_count   INTEGER NOT NULL DEFAULT 0,
  errors          JSONB NOT NULL DEFAULT '[]',
  quota_remaining INTEGER,
  notes           TEXT
);

-- Última execução de cada coletor, para a página de saúde.
CREATE INDEX IF NOT EXISTS idx_runs_collector
  ON collector_runs (collector, started_at DESC);

-- Papéis e auditoria. `users` substitui a coleção homônima; a claim de admin
-- passa a viver aqui (ver auth.ts).
CREATE TABLE IF NOT EXISTS users (
  uid             TEXT PRIMARY KEY,
  email           TEXT,
  role            TEXT,
  role_updated_at TIMESTAMPTZ,
  role_updated_by TEXT
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id     BIGSERIAL PRIMARY KEY,
  uid    TEXT NOT NULL,
  email  TEXT,
  method TEXT NOT NULL,
  path   TEXT NOT NULL,
  query  JSONB,
  ip     TEXT,
  at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
