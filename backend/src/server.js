"use strict";

require("dotenv").config();

const path = require("node:path");
const Fastify = require("fastify");
const cors = require("@fastify/cors");
const fastifyStatic = require("@fastify/static");
const { Pool } = require("pg");
const WebSocket = require("ws");
const { z } = require("zod");

const config = {
    port: Number(process.env.PORT || 3000),
    databaseUrl: process.env.DATABASE_URL,
    binanceWsUrl: process.env.BINANCE_WS_URL || "wss://stream.binance.com:9443/ws/btcusdt@ticker",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    coinGeckoApiKey: process.env.COINGECKO_API_KEY || "",
    marketInterval: Number(process.env.MARKET_INTERVAL_MS || 120000),
    coinGeckoUrl: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,php&include_24hr_change=true&include_market_cap=true",
    futuresUrl: "https://fapi.binance.com/fapi/v1",
    fearGreedUrl: "https://api.alternative.me/fng/?limit=1",
    blockchainUrl: "https://api.blockchain.info/q"
};

const app = Fastify({ logger: true });
const pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl }) : null;
if (pool) {
    pool.on("error", error => app.log.error(error, "Unexpected PostgreSQL pool error"));
}
const latest = { market: null, signals: null, connected: false, lastTickAt: null };
let socket;
let reconnectTimer;
let reconnectDelay = 2000;
let currentCandle;
let marketTimer;
let signalsTimer;
let shuttingDown = false;
const pendingWrites = new Set();
let marketRetryAt = 0;

const rangeSchema = z.enum(["1h", "24h", "7d", "30d", "1y"]);

async function query(text, values = []) {
    if (!pool) {
        throw new Error("DATABASE_URL is not configured");
    }
    return pool.query(text, values);
}

async function fetchJson(url) {
    const headers = { Accept: "application/json" };
    if (config.coinGeckoApiKey && url.startsWith("https://api.coingecko.com/")) {
        headers["x-cg-demo-api-key"] = config.coinGeckoApiKey;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        const error = new Error(`HTTP ${response.status} from ${url}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.text();
}

function minuteBucket(date) {
    return new Date(Math.floor(date.getTime() / 60000) * 60000);
}

async function saveCandle(candle) {
    await query(
        `INSERT INTO candles_1m (bucket, symbol, open, high, low, close, volume, trade_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (bucket) DO UPDATE SET
           high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close,
           volume = EXCLUDED.volume, trade_count = EXCLUDED.trade_count,
           updated_at = now()`,
        [candle.bucket, "BTCUSDT", candle.open, candle.high, candle.low, candle.close, candle.volume, candle.tradeCount]
    );
}

function queueCandleWrite(candle) {
    if (!pool || shuttingDown || !candle) return;
    const write = saveCandle(candle)
        .catch(error => app.log.error(error, "Candle persistence failed"))
        .finally(() => pendingWrites.delete(write));
    pendingWrites.add(write);
}

function handleTicker(payload) {
    const price = Number(payload.c);
    if (!Number.isFinite(price)) return;

    const now = new Date(Number(payload.E) || Date.now());
    const bucket = minuteBucket(now);
    latest.connected = true;
    latest.lastTickAt = now.toISOString();
    latest.market = {
        ...(latest.market || {}),
        btcUsd: price,
        change24h: Number(payload.P),
        high24h: Number(payload.h),
        low24h: Number(payload.l),
        volume24h: Number(payload.q),
        tradeCount24h: Number(payload.n),
        bestBid: Number(payload.b),
        bestAsk: Number(payload.a),
        updatedAt: now.toISOString()
    };

    if (!currentCandle || currentCandle.bucket.getTime() !== bucket.getTime()) {
        queueCandleWrite(currentCandle);
        currentCandle = { bucket, open: price, high: price, low: price, close: price, volume: Number(payload.v) || 0, tradeCount: Number(payload.n) || 0 };
    } else {
        currentCandle.high = Math.max(currentCandle.high, price);
        currentCandle.low = Math.min(currentCandle.low, price);
        currentCandle.close = price;
        currentCandle.volume = Number(payload.v) || currentCandle.volume;
        currentCandle.tradeCount = Number(payload.n) || currentCandle.tradeCount;
    }
}

async function collectMarketSnapshot() {
    if (Date.now() < marketRetryAt) return;
    try {
        const data = await fetchJson(config.coinGeckoUrl);
        const bitcoin = data.bitcoin || {};
        const market = {
            ...(latest.market || {}),
            btcPhp: Number(bitcoin.php),
            usdPhp: Number(bitcoin.php) / Number(bitcoin.usd),
            marketCap: Number(bitcoin.usd_market_cap),
            updatedAt: new Date().toISOString()
        };
        latest.market = market;
        if (pool) {
            await query(
                `INSERT INTO market_snapshots
                 (btc_usd, btc_php, usd_php, high_24h, low_24h, volume_24h, market_cap, trade_count_24h, best_bid, best_ask, source)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [market.btcUsd, market.btcPhp, market.usdPhp, market.high24h, market.low24h, market.volume24h, market.marketCap, market.tradeCount24h, market.bestBid, market.bestAsk, "coingecko+binance"]
            );
        }
    } catch (error) {
        if (error.status === 429) {
            marketRetryAt = Date.now() + Math.max(config.marketInterval, 300000);
        }
        app.log.warn(error, "Market snapshot collection failed");
    }
}

async function collectSignalSnapshot() {
    try {
        const [premium, openInterest, fearGreed, txCount, hashRate] = await Promise.all([
            fetchJson(`${config.futuresUrl}/premiumIndex?symbol=BTCUSDT`),
            fetchJson(`${config.futuresUrl}/openInterest?symbol=BTCUSDT`),
            fetchJson(config.fearGreedUrl),
            fetchText(`${config.blockchainUrl}/24hrtransactioncount`),
            fetchText(`${config.blockchainUrl}/hashrate`)
        ]);
        const sentiment = fearGreed && fearGreed.data && fearGreed.data[0];
        latest.signals = {
            fundingRate: Number(premium.lastFundingRate),
            nextFundingTime: Number(premium.nextFundingTime),
            openInterestBtc: Number(openInterest.openInterest),
            fearGreedValue: sentiment ? Number(sentiment.value) : null,
            fearGreedLabel: sentiment ? sentiment.value_classification : null,
            networkTxCount24h: Number(txCount),
            networkHashRateGHs: Number(hashRate),
            capturedAt: new Date().toISOString()
        };
        if (pool) {
            await query(
                `INSERT INTO signal_snapshots
                 (funding_rate, next_funding_time, open_interest_btc, fear_greed_value, fear_greed_label, network_tx_count_24h, network_hash_rate_ghs, source)
                 VALUES ($1,to_timestamp($2 / 1000.0),$3,$4,$5,$6,$7,$8)`,
                [latest.signals.fundingRate, latest.signals.nextFundingTime, latest.signals.openInterestBtc, latest.signals.fearGreedValue, latest.signals.fearGreedLabel, latest.signals.networkTxCount24h, latest.signals.networkHashRateGHs, "binance+alternative.me+blockchain.info"]
            );
        }
    } catch (error) {
        app.log.warn(error, "Signal collection failed");
    }
}

function connectBinance() {
    socket = new WebSocket(config.binanceWsUrl);
    socket.on("open", () => {
        reconnectDelay = 2000;
        latest.connected = true;
        app.log.info("Connected to Binance ticker stream");
    });
    socket.on("message", data => {
        try { handleTicker(JSON.parse(data.toString())); } catch (error) { app.log.error(error); }
    });
    socket.on("close", () => {
        latest.connected = false;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectBinance, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    });
    socket.on("error", error => app.log.error(error));
}

app.register(cors, { origin: config.corsOrigin });
app.register(fastifyStatic, { root: path.join(__dirname, "../.."), wildcard: false });

app.get("/api/health", async () => ({ ok: true, databaseConfigured: Boolean(pool), binanceConnected: latest.connected, lastTickAt: latest.lastTickAt }));

app.get("/api/market/latest", async () => {
    const result = pool ? await query("SELECT * FROM market_snapshots ORDER BY captured_at DESC LIMIT 1") : { rows: [] };
    const stored = result.rows[0] || {};
    const market = {
        ...latest.market,
        btcPhp: latest.market?.btcPhp ?? Number(stored.btc_php),
        usdPhp: latest.market?.usdPhp ?? Number(stored.usd_php),
        marketCap: latest.market?.marketCap ?? Number(stored.market_cap),
        tradeCount24h: latest.market?.tradeCount24h ?? Number(stored.trade_count_24h),
        bestBid: latest.market?.bestBid ?? Number(stored.best_bid),
        bestAsk: latest.market?.bestAsk ?? Number(stored.best_ask)
    };
    return { market: Object.keys(market).length ? market : null, source: latest.market ? "binance-live" : "database" };
});

app.get("/api/signals/latest", async () => {
    const result = pool ? await query("SELECT * FROM signal_snapshots ORDER BY captured_at DESC LIMIT 1") : { rows: [] };
    return result.rows[0] || latest.signals || null;
});

app.get("/api/market/history", async (request, reply) => {
    const parsed = rangeSchema.safeParse(request.query?.range || "24h");
    if (!parsed.success) return reply.code(400).send({ error: "range must be 1h, 24h, 7d, 30d, or 1y" });
    if (!pool) return { points: [], source: "database-not-configured" };
    const intervals = { "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days", "1y": "1 year" };
    const result = await query(
        "SELECT bucket AS time, open, high, low, close, volume FROM candles_1m WHERE bucket >= now() - $1::interval ORDER BY bucket ASC",
        [intervals[parsed.data]]
    );
    return { points: result.rows, source: "postgresql" };
});

async function start() {
    try {
        if (pool) {
            await query("SELECT 1");
            app.log.info("Connected to PostgreSQL");
        } else {
            app.log.warn("DATABASE_URL is not configured; persistence is disabled");
        }
        await app.listen({ port: config.port, host: "0.0.0.0" });
        connectBinance();
        await collectMarketSnapshot();
        await collectSignalSnapshot();
        marketTimer = setInterval(collectMarketSnapshot, config.marketInterval);
        signalsTimer = setInterval(collectSignalSnapshot, 15 * 60 * 1000);
    } catch (error) {
        app.log.error(error);
        process.exitCode = 1;
    }
}

async function shutdown() {
    shuttingDown = true;
    clearTimeout(reconnectTimer);
    clearInterval(marketTimer);
    clearInterval(signalsTimer);
    if (socket) socket.close();
    queueCandleWrite(currentCandle);
    await Promise.allSettled([...pendingWrites]);
    await app.close();
    if (pool) await pool.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
start();
