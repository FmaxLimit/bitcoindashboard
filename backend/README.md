# Bitcoin Dashboard Backend

Node.js API and Binance market-data collector for the dashboard.

## Setup

1. Create a PostgreSQL database named `bitcoin_dashboard`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Run `schema.sql` against the database.
4. Install dependencies with `npm install`.
5. Start the server with `npm start`.

The dashboard is then available at `http://localhost:3000`.

## Endpoints

- `GET /api/health` reports server, database configuration, and Binance status.
- `GET /api/market/latest` returns the latest live Binance ticker.
- `GET /api/market/history?range=1h|24h|7d|30d|1y` returns persisted one-minute candles.
- `GET /api/signals/latest` returns the latest persisted signal snapshot when available.

## Current collection behavior

The first backend slice connects to Binance's BTCUSDT ticker stream and aggregates ticks into one-minute candles. Candles are persisted when PostgreSQL is configured. The existing browser collectors remain as a temporary fallback for CoinGecko and the other market signals while those collectors are moved server-side.
