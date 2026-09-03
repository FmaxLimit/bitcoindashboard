CREATE TABLE IF NOT EXISTS candles_1m (
    bucket TIMESTAMPTZ PRIMARY KEY,
    symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
    open NUMERIC(20, 8) NOT NULL,
    high NUMERIC(20, 8) NOT NULL,
    low NUMERIC(20, 8) NOT NULL,
    close NUMERIC(20, 8) NOT NULL,
    volume NUMERIC(30, 8),
    trade_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candles_1m_bucket_idx ON candles_1m (bucket DESC);

CREATE TABLE IF NOT EXISTS market_snapshots (
    id BIGSERIAL PRIMARY KEY,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    btc_usd NUMERIC(20, 8),
    btc_php NUMERIC(20, 8),
    usd_php NUMERIC(20, 8),
    high_24h NUMERIC(20, 8),
    low_24h NUMERIC(20, 8),
    volume_24h NUMERIC(30, 8),
    market_cap NUMERIC(30, 2),
    trade_count_24h BIGINT,
    best_bid NUMERIC(20, 8),
    best_ask NUMERIC(20, 8),
    source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS market_snapshots_captured_at_idx
    ON market_snapshots (captured_at DESC);

CREATE TABLE IF NOT EXISTS signal_snapshots (
    id BIGSERIAL PRIMARY KEY,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    funding_rate NUMERIC(20, 12),
    next_funding_time TIMESTAMPTZ,
    open_interest_btc NUMERIC(30, 8),
    fear_greed_value INTEGER,
    fear_greed_label TEXT,
    network_tx_count_24h BIGINT,
    network_hash_rate_ghs NUMERIC(30, 8),
    source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS signal_snapshots_captured_at_idx
    ON signal_snapshots (captured_at DESC);

ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS trade_count_24h BIGINT;
ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS best_bid NUMERIC(20, 8);
ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS best_ask NUMERIC(20, 8);
