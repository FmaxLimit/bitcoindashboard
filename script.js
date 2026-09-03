/* =========================================================
   BITCOIN LIVE DASHBOARD
   JAVASCRIPT - FIXED VERSION
========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {

    BACKEND_API_BASE:
        "http://localhost:3000/api",

    API_BASE:
        "https://api.coingecko.com/api/v3",

    /*
     * Optional: put a free CoinGecko "Demo" API key here
     * (https://www.coingecko.com/en/developers/dashboard)
     * to raise the rate limit from ~5-15 calls/min to a
     * stable 100 calls/min. Leave as "" to use the public,
     * keyless endpoint. Only used for the PHP price /
     * market cap lookup below, not the live USD price.
     */

    API_KEY:
        "",

    COIN_ID:
        "bitcoin",

    /*
     * Live BTC/USD price + 24h stats come from Binance's
     * public WebSocket ticker stream, which pushes a fresh
     * update about once per second - no polling, no API
     * key, no rate limit for a single connection.
     */

    BINANCE_WS_URL:
        "wss://stream.binance.com:9443/ws/btcusdt@ticker",

    /*
     * BTC/PHP and USD market cap aren't available from
     * Binance, so those are still pulled from CoinGecko on
     * a slow timer - this doesn't need second-by-second
     * accuracy the way the live price does.
     */

    PERIODIC_INTERVAL:
        30000,

    RECONNECT_BASE_DELAY:
        2000,

    RECONNECT_MAX_DELAY:
        30000,

    /*
     * At roughly 1 tick/second this keeps about an hour
     * of live history in memory for the 1H view.
     */

    MAX_LIVE_POINTS:
        3600,

    MAX_TICKER_ROWS:
        20,

    /*
     * Binance USD-M Futures REST base - used for funding
     * rate + open interest on the BTCUSDT perpetual. Both
     * are free and keyless, but only available via REST
     * (no public push stream for open interest), so they're
     * polled on the same slow timer as PHP/market cap.
     */

    FUTURES_API_BASE:
        "https://fapi.binance.com/fapi/v1",

    FUTURES_SYMBOL:
        "BTCUSDT",

    /*
     * Fear & Greed Index only actually changes about once a
     * day, so there's no reason to poll it often.
     */

    FEAR_GREED_API:
        "https://api.alternative.me/fng/?limit=1",

    FEAR_GREED_INTERVAL:
        15 * 60 * 1000,

    /*
     * blockchain.info's simple keyless /q/ endpoints -
     * network-wide (not exchange-specific) transaction
     * count and hash rate. These change slowly, so they're
     * polled infrequently.
     */

    BLOCKCHAIN_API_BASE:
        "https://api.blockchain.info/q",

    NETWORK_STATS_INTERVAL:
        15 * 60 * 1000

};


/* =========================================================
   APPLICATION STATE
========================================================= */

const state = {

    btcUsd: null,

    btcPhp: null,

    previousUsd: null,

    previousPhp: null,

    change24h: null,

    volume24h: null,

    high24h: null,

    low24h: null,

    marketCap: null,

    usdPhpRate: null,

    fundingRate: null,

    nextFundingTime: null,

    openInterestBtc: null,

    fearGreedValue: null,

    fearGreedLabel: null,

    tradeCount24h: null,

    bestBid: null,

    bestAsk: null,

    networkTxCount24h: null,

    networkHashRateGHs: null,

    lastApiUpdate: null,

    connection: false,

    selectedRange:
        "live",

    selectedTickerRange:
        "live",

    livePoints: [],

    historical: {},

    chartYRanges: {},

    chart: null,

    socket: null,

    reconnectTimer: null,

    reconnectAttempts: 0,

    periodicTimer: null,

    signalsTimer: null,

    fearGreedTimer: null,

    networkStatsTimer: null,

    fetching: false

};


/* =========================================================
   DOM ELEMENTS
========================================================= */

const elements = {

    btcUsdPrice:
        document.getElementById(
            "btcUsdPrice"
        ),

    btcPhpPrice:
        document.getElementById(
            "btcPhpPrice"
        ),

    usdChange:
        document.getElementById(
            "usdChange"
        ),

    phpChange:
        document.getElementById(
            "phpChange"
        ),

    btcPhpRate:
        document.getElementById(
            "btcPhpRate"
        ),

    high24:
        document.getElementById(
            "high24"
        ),

    low24:
        document.getElementById(
            "low24"
        ),

    volume24:
        document.getElementById(
            "volume24"
        ),

    marketCap:
        document.getElementById(
            "marketCap"
        ),

    lastUpdated:
        document.getElementById(
            "lastUpdated"
        ),

    apiSync:
        document.getElementById(
            "apiSync"
        ),

    liveClock:
        document.getElementById(
            "liveClock"
        ),

    tickerRows:
        document.getElementById(
            "tickerRows"
        ),

    chartLoading:
        document.getElementById(
            "chartLoading"
        ),

    connectionDot:
        document.getElementById(
            "connectionDot"
        ),

    connectionText:
        document.getElementById(
            "connectionText"
        ),

    apiDot:
        document.getElementById(
            "apiDot"
        ),

    chartDot:
        document.getElementById(
            "chartDot"
        ),

    updateDot:
        document.getElementById(
            "updateDot"
        ),

    apiStatus:
        document.getElementById(
            "apiStatus"
        ),

    chartStatus:
        document.getElementById(
            "chartStatus"
        ),

    updateStatus:
        document.getElementById(
            "updateStatus"
        ),

    momentum5m:
        document.getElementById(
            "momentum5m"
        ),

    momentum5mChange:
        document.getElementById(
            "momentum5mChange"
        ),

    momentum15m:
        document.getElementById(
            "momentum15m"
        ),

    momentum15mChange:
        document.getElementById(
            "momentum15mChange"
        ),

    momentum1h:
        document.getElementById(
            "momentum1h"
        ),

    momentum1hChange:
        document.getElementById(
            "momentum1hChange"
        ),

    fundingRateValue:
        document.getElementById(
            "fundingRateValue"
        ),

    fundingRateNext:
        document.getElementById(
            "fundingRateNext"
        ),

    openInterestValue:
        document.getElementById(
            "openInterestValue"
        ),

    openInterestUsd:
        document.getElementById(
            "openInterestUsd"
        ),

    fearGreedValue:
        document.getElementById(
            "fearGreedValue"
        ),

    fearGreedLabel:
        document.getElementById(
            "fearGreedLabel"
        ),

    tradeCountValue:
        document.getElementById(
            "tradeCountValue"
        ),

    spreadValue:
        document.getElementById(
            "spreadValue"
        ),

    spreadSub:
        document.getElementById(
            "spreadSub"
        ),

    networkTxValue:
        document.getElementById(
            "networkTxValue"
        ),

    hashRateValue:
        document.getElementById(
            "hashRateValue"
        ),

    periodHigh:
        document.getElementById(
            "periodHigh"
        ),

    periodLow:
        document.getElementById(
            "periodLow"
        ),

    periodCurrent:
        document.getElementById(
            "periodCurrent"
        ),

    periodPosition:
        document.getElementById(
            "periodPosition"
        ),

    intervalStrip:
        document.getElementById(
            "intervalStrip"
        ),

    backtestStart:
        document.getElementById(
            "backtestStart"
        ),

    backtestPick:
        document.getElementById(
            "backtestPick"
        ),

    backtestEnd:
        document.getElementById(
            "backtestEnd"
        ),

    runBacktestBtn:
        document.getElementById(
            "runBacktestBtn"
        ),

    backtestError:
        document.getElementById(
            "backtestError"
        ),

    backtestRounds:
        document.getElementById(
            "backtestRounds"
        ),

    backtestWins:
        document.getElementById(
            "backtestWins"
        ),

    backtestLosses:
        document.getElementById(
            "backtestLosses"
        ),

    backtestWinRate:
        document.getElementById(
            "backtestWinRate"
        ),

    backtestWarning:
        document.getElementById(
            "backtestWarning"
        )

};


/* =========================================================
   NUMBER FORMATTERS
========================================================= */

const usdFormatter =
    new Intl.NumberFormat(
        "en-US",
        {
            style:
                "currency",

            currency:
                "USD",

            maximumFractionDigits:
                2
        }
    );


const phpFormatter =
    new Intl.NumberFormat(
        "en-PH",
        {
            style:
                "currency",

            currency:
                "PHP",

            maximumFractionDigits:
                2
        }
    );


const compactFormatter =
    new Intl.NumberFormat(
        "en-US",
        {
            notation:
                "compact",

            maximumFractionDigits:
                2
        }
    );


/* =========================================================
   FORMAT HELPERS
========================================================= */

function formatUSD(value) {

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
            Number(value)
        )
    ) {

        return "$--";

    }


    return usdFormatter.format(
        Number(value)
    );

}


function formatPHP(value) {

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
            Number(value)
        )
    ) {

        return "₱--";

    }


    return phpFormatter.format(
        Number(value)
    );

}


function formatCompactUSD(value) {

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
            Number(value)
        )
    ) {

        return "$--";

    }


    return (
        "$" +
        compactFormatter.format(
            Number(value)
        )
    );

}


function formatPercent(value) {

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
            Number(value)
        )
    ) {

        return "--%";

    }


    const sign =
        value >= 0
            ? "+"
            : "";


    return (
        sign +
        Number(value).toFixed(2) +
        "%"
    );

}


function formatTime(date) {

    return date.toLocaleTimeString(
        "en-PH",
        {
            hour:
                "2-digit",

            minute:
                "2-digit",

            second:
                "2-digit",

            hour12:
                false
        }
    );

}


function formatShortTime(date) {

    return date.toLocaleTimeString(
        "en-PH",
        {
            hour:
                "2-digit",

            minute:
                "2-digit",

            second:
                "2-digit",

            hour12:
                false
        }
    );

}


/* =========================================================
   SAFE DOM TEXT UPDATE
========================================================= */

function setText(
    element,
    value
) {

    if (element) {

        element.textContent =
            value;

    }

}


/* =========================================================
   CLOCK
========================================================= */

function updateClock() {

    if (
        !elements.liveClock
    ) {

        return;

    }


    const now =
        new Date();


    elements.liveClock.textContent =
        formatTime(
            now
        );

}


setInterval(
    updateClock,
    1000
);


/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnectionStatus(
    online
) {

    state.connection =
        online;


    if (
        elements.connectionDot
    ) {

        elements.connectionDot
            .className =
            online
                ? "status-dot online"
                : "status-dot offline";

    }


    setText(
        elements.connectionText,
        online
            ? "Connected"
            : "Disconnected"
    );


    if (
        elements.apiDot
    ) {

        elements.apiDot
            .className =
            online
                ? "small-status online"
                : "small-status offline";

    }


    setText(
        elements.apiStatus,
        online
            ? "Connected"
            : "Connection failed"
    );

}


/* =========================================================
   SAFE FETCH
========================================================= */

async function fetchJSON(
    url
) {

    const controller =
        new AbortController();


    const timeout =
        setTimeout(
            () => {
                controller.abort();
            },
            10000
        );


    try {

        const headers = {
            Accept:
                "application/json"
        };


        if (
            CONFIG.API_KEY
        ) {

            headers["x-cg-demo-api-key"] =
                CONFIG.API_KEY;

        }


        const response =
            await fetch(
                url,
                {
                    cache:
                        "no-store",

                    signal:
                        controller.signal,

                    headers:
                        headers
                }
            );


        if (
            response.status ===
            429
        ) {

            throw new Error(
                "RATE_LIMITED"
            );

        }


        if (
            !response.ok
        ) {

            throw new Error(
                "HTTP " +
                response.status
            );

        }


        return await response.json();

    } finally {

        clearTimeout(
            timeout
        );

    }

}


/* =========================================================
   FETCH PLAIN TEXT
   Some endpoints (blockchain.info's simple /q/ stats) just
   return a raw number as plain text, not JSON.
========================================================= */

async function fetchText(
    url
) {

    const controller =
        new AbortController();


    const timeout =
        setTimeout(
            () => {

                controller.abort();

            },
            10000
        );


    try {

        const response =
            await fetch(
                url,
                {
                    cache:
                        "no-store",

                    signal:
                        controller.signal
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                "HTTP " +
                response.status
            );

        }


        const text =
            await response.text();


        return text.trim();

    } finally {

        clearTimeout(
            timeout
        );

    }

}


/* =========================================================
   LIVE PRICE STREAM (BINANCE WEBSOCKET)
========================================================= */

function connectPriceStream() {

    /*
     * Avoid piling up duplicate sockets if this
     * gets called again while one is still open.
     */

    if (
        state.socket &&
        (
            state.socket.readyState === WebSocket.OPEN ||
            state.socket.readyState === WebSocket.CONNECTING
        )
    ) {

        return;

    }


    let socket;


    try {

        socket =
            new WebSocket(
                CONFIG.BINANCE_WS_URL
            );

    } catch (error) {

        console.error(
            "WebSocket creation failed:",
            error
        );

        scheduleReconnect();

        return;

    }


    state.socket =
        socket;


    socket.onopen =
        () => {

            state.reconnectAttempts =
                0;


            setConnectionStatus(
                true
            );


            setText(
                elements.apiStatus,
                "Connected (Binance live)"
            );


            setText(
                elements.updateStatus,
                "Streaming"
            );


            if (
                elements.updateDot
            ) {

                elements.updateDot
                    .className =
                    "small-status online";

            }

        };


    socket.onmessage =
        event => {

            try {

                const payload =
                    JSON.parse(
                        event.data
                    );


                handleTickerMessage(
                    payload
                );

            } catch (error) {

                console.error(
                    "Failed to parse ticker message:",
                    error
                );

            }

        };


    socket.onerror =
        event => {

            console.error(
                "Price stream error:",
                event
            );

        };


    socket.onclose =
        () => {

            setConnectionStatus(
                false
            );


            setText(
                elements.apiStatus,
                "Reconnecting..."
            );


            setText(
                elements.updateStatus,
                "Reconnecting..."
            );


            if (
                elements.updateDot
            ) {

                elements.updateDot
                    .className =
                    "small-status offline";

            }


            scheduleReconnect();

        };

}


/* =========================================================
   RECONNECT WITH BACKOFF
========================================================= */

function scheduleReconnect() {

    if (
        state.reconnectTimer
    ) {

        return;

    }


    const delay =
        Math.min(
            CONFIG.RECONNECT_BASE_DELAY *
            Math.pow(
                2,
                state.reconnectAttempts
            ),
            CONFIG.RECONNECT_MAX_DELAY
        );


    state.reconnectAttempts =
        state.reconnectAttempts + 1;


    state.reconnectTimer =
        setTimeout(
            () => {

                state.reconnectTimer =
                    null;


                connectPriceStream();

            },
            delay
        );

}


/* =========================================================
   HANDLE INCOMING TICKER MESSAGE
========================================================= */

function handleTickerMessage(
    payload
) {

    /*
     * Binance's 24hrTicker payload:
     * c = last price, P = 24h % change,
     * h = 24h high, l = 24h low,
     * q = 24h quote (USDT) volume.
     */

    const price =
        Number(
            payload.c
        );


    if (
        !Number.isFinite(
            price
        )
    ) {

        return;

    }


    state.previousUsd =
        state.btcUsd;


    state.btcUsd =
        price;


    /*
     * Recompute BTC/PHP on every live tick using the
     * last-known exchange rate, so it moves in step
     * with BTC/USD instead of only refreshing every
     * 30 seconds.
     */

    if (
        state.usdPhpRate !== null
    ) {

        state.previousPhp =
            state.btcPhp;


        state.btcPhp =
            price *
            state.usdPhpRate;

    }


    state.change24h =
        Number(
            payload.P
        );


    state.high24h =
        Number(
            payload.h
        );


    state.low24h =
        Number(
            payload.l
        );


    state.volume24h =
        Number(
            payload.q
        );


    /*
     * n = number of trades executed in the 24h window.
     * b/a = best bid/ask price at the top of the book.
     */

    state.tradeCount24h =
        Number(
            payload.n
        );


    state.bestBid =
        Number(
            payload.b
        );


    state.bestAsk =
        Number(
            payload.a
        );


    state.lastApiUpdate =
        new Date();


    setText(
        elements.apiSync,
        formatTime(
            state.lastApiUpdate
        )
    );


    updateDashboard();


    updateMarketSignalsUI();


    addLivePoint();


    updateMomentumSignals();


    renderTickerRows();


    const isLiveDrivenRange =
        state.selectedRange === "live" ||
        state.selectedRange === "1m" ||
        state.selectedRange === "5m" ||
        state.selectedRange === "15m" ||
        state.selectedRange === "30m" ||
        state.selectedRange === "1h";


    if (
        isLiveDrivenRange
    ) {

        updateChart();

    }


    if (
        elements.chartLoading &&
        isLiveDrivenRange
    ) {

        elements.chartLoading.style.display =
            "none";

    }

}


/* =========================================================
   PERIODIC: BTC/PHP + USD MARKET CAP (COINGECKO)
========================================================= */

async function fetchPeriodicMarketData() {

    if (
        state.fetching
    ) {

        return;

    }


    state.fetching =
        true;


    const url =
        CONFIG.BACKEND_API_BASE +
        "/market/latest";


    try {

        const response =
            await fetchJSON(
                url
            );


        const market =
            response &&
            response.market;


        if (
            !market
        ) {

            throw new Error(
                "Invalid PHP/market-cap response"
            );

        }


        /*
         * Derive the USD -> PHP exchange rate from
         * CoinGecko's own usd/php quotes, rather than
         * using its BTC/PHP price directly. The rate
         * barely moves minute to minute, so refreshing
         * it every 30s is plenty - the actual BTC/PHP
         * price shown on screen is then recomputed on
         * every live USD tick (see handleTickerMessage)
         * so it never looks stuck.
         */

        if (Number.isFinite(Number(market.usdPhp))) {

            state.usdPhpRate =
                Number(market.usdPhp);


            state.previousPhp =
                state.btcPhp;


            if (
                state.btcUsd !== null
            ) {

                state.btcPhp =
                    state.btcUsd *
                    state.usdPhpRate;

            } else {

                state.btcPhp =
                    Number(
                        market.btcPhp
                    );

            }

        }


        if (Number.isFinite(Number(market.marketCap))) {

            state.marketCap =
                Number(
                    market.marketCap
                );

        }


        updateDashboard();


    } catch (error) {

        /*
         * Do not destroy the dashboard if this
         * slow secondary lookup temporarily fails -
         * the live USD price keeps streaming
         * regardless.
         */

        console.warn(
            "PHP/market-cap API error:",
            error
        );

    } finally {

        state.fetching =
            false;

    }

}


/* =========================================================
   MARKET SIGNALS: FUNDING RATE + OPEN INTEREST (BINANCE)
   Raw context data, not combined into any score. Both are
   free/keyless REST endpoints on Binance's USD-M futures
   API, polled every 30s alongside the PHP/market-cap call.
========================================================= */

async function fetchMarketSignals() {


    try {

        const data =
            await fetchJSON(
                CONFIG.BACKEND_API_BASE +
                "/signals/latest"
            );


        if (
            data &&
            Number.isFinite(Number(data.funding_rate))
        ) {

            state.fundingRate =
                Number(
                    data.funding_rate
                );


            state.nextFundingTime =
                Number(
                    new Date(data.next_funding_time).getTime()
                );

        }


        if (
            data &&
            Number.isFinite(Number(data.open_interest_btc))
        ) {

            state.openInterestBtc =
                Number(
                    data.open_interest_btc
                );

        }


        updateMarketSignalsUI();


    } catch (error) {

        /*
         * Same principle as the PHP/market-cap
         * fetch - a failure here shouldn't touch
         * the live price stream at all.
         */

        console.warn(
            "Market signals API error:",
            error
        );

    }

}


/* =========================================================
   FEAR & GREED INDEX (ALTERNATIVE.ME)
   Only actually changes about once a day.
========================================================= */

async function fetchFearGreed() {

    try {

        const data =
            await fetchJSON(
                CONFIG.BACKEND_API_BASE +
                "/signals/latest"
            );


        if (
            data &&
            Number.isFinite(Number(data.fear_greed_value))
        ) {

            state.fearGreedValue =
                Number(
                    data.fear_greed_value
                );


            state.fearGreedLabel =
                data.fear_greed_label ||
                null;

        }


        updateMarketSignalsUI();


    } catch (error) {

        console.warn(
            "Fear & Greed API error:",
            error
        );

    }

}


/* =========================================================
   NETWORK STATS (BLOCKCHAIN.INFO)
   Network-wide transaction count and hash rate - both
   change slowly, so they're polled infrequently.
========================================================= */

async function fetchNetworkStats() {

    try {

        const data =
            await fetchJSON(
                CONFIG.BACKEND_API_BASE +
                "/signals/latest"
            );


        const txCount =
            Number(data && data.network_tx_count_24h);


        const hashRateGHs =
            Number(data && data.network_hash_rate_ghs);

        if (
            Number.isFinite(
                txCount
            )
        ) {

            state.networkTxCount24h =
                txCount;

        }

        if (
            Number.isFinite(
                hashRateGHs
            )
        ) {

            state.networkHashRateGHs =
                hashRateGHs;

        }


        updateMarketSignalsUI();


    } catch (error) {

        console.warn(
            "Network stats API error:",
            error
        );

    }

}


/* =========================================================
   RENDER MARKET SIGNALS
========================================================= */

function updateMarketSignalsUI() {

    /*
     * FUNDING RATE
     * Positive = longs paying shorts (long-heavy
     * positioning). Negative = the reverse. This is
     * positioning data, not a forecast.
     */

    if (
        state.fundingRate !== null &&
        elements.fundingRateValue
    ) {

        const ratePct =
            state.fundingRate * 100;


        const sign =
            ratePct > 0
                ? "+"
                : "";


        setText(
            elements.fundingRateValue,
            sign +
            ratePct.toFixed(4) +
            "%"
        );


        elements.fundingRateValue.className =
            "signal-value " +
            (
                ratePct > 0
                    ? "up"
                    : ratePct < 0
                        ? "down"
                        : "neutral"
            );

    }


    if (
        state.nextFundingTime &&
        elements.fundingRateNext
    ) {

        const msLeft =
            state.nextFundingTime -
            Date.now();


        if (
            msLeft > 0
        ) {

            const hours =
                Math.floor(
                    msLeft /
                    3600000
                );

            const minutes =
                Math.floor(
                    (
                        msLeft %
                        3600000
                    ) /
                    60000
                );


            setText(
                elements.fundingRateNext,
                "Next in " +
                hours +
                "h " +
                minutes +
                "m"
            );

        }

    }


    /*
     * OPEN INTEREST
     * Total value currently committed to BTCUSDT
     * perpetual futures contracts.
     */

    if (
        state.openInterestBtc !== null &&
        elements.openInterestValue
    ) {

        setText(
            elements.openInterestValue,
            Math.round(
                state.openInterestBtc
            ).toLocaleString(
                "en-US"
            ) +
            " BTC"
        );


        if (
            state.btcUsd !== null &&
            elements.openInterestUsd
        ) {

            const usdValue =
                state.openInterestBtc *
                state.btcUsd;


            setText(
                elements.openInterestUsd,
                "\u2248 " +
                usdFormatter.format(
                    usdValue
                )
            );

        }

    }


    /*
     * FEAR & GREED INDEX
     * A sentiment survey/composite from alternative.me,
     * 0 (extreme fear) to 100 (extreme greed).
     */

    if (
        state.fearGreedValue !== null &&
        elements.fearGreedValue
    ) {

        setText(
            elements.fearGreedValue,
            String(
                state.fearGreedValue
            )
        );


        let signalClass =
            "neutral";


        if (
            state.fearGreedValue >= 60
        ) {

            signalClass =
                "up";

        } else if (
            state.fearGreedValue <= 40
        ) {

            signalClass =
                "down";

        }


        elements.fearGreedValue.className =
            "signal-value " +
            signalClass;


        setText(
            elements.fearGreedLabel,
            state.fearGreedLabel ||
            "--"
        );

    }


    /*
     * 24H TRADE COUNT
     * Number of individual executions on Binance's
     * BTCUSDT market in the last 24 hours.
     */

    if (
        state.tradeCount24h !== null &&
        elements.tradeCountValue
    ) {

        setText(
            elements.tradeCountValue,
            Math.round(
                state.tradeCount24h
            ).toLocaleString(
                "en-US"
            )
        );

    }


    /*
     * BID/ASK SPREAD
     * Gap between the best live buy and sell offers -
     * tighter usually means more liquid trading.
     */

    if (
        state.bestBid !== null &&
        state.bestAsk !== null &&
        elements.spreadValue
    ) {

        const spread =
            state.bestAsk -
            state.bestBid;


        setText(
            elements.spreadValue,
            formatUSD(
                spread
            )
        );


        if (
            elements.spreadSub &&
            state.bestBid > 0
        ) {

            const spreadPct =
                (
                    spread /
                    state.bestBid
                ) *
                100;


            setText(
                elements.spreadSub,
                spreadPct.toFixed(4) +
                "% of price"
            );

        }

    }


    /*
     * NETWORK TRANSACTIONS (24H)
     * Blockchain-wide transaction count - every BTC
     * transaction network-wide, not just one exchange.
     */

    if (
        state.networkTxCount24h !== null &&
        elements.networkTxValue
    ) {

        setText(
            elements.networkTxValue,
            Math.round(
                state.networkTxCount24h
            ).toLocaleString(
                "en-US"
            )
        );

    }


    /*
     * HASH RATE
     * Network-wide computing power securing Bitcoin.
     * A slow-moving fundamental, not a short-term signal.
     */

    if (
        state.networkHashRateGHs !== null &&
        elements.hashRateValue
    ) {

        const exahashes =
            state.networkHashRateGHs /
            1e9;


        setText(
            elements.hashRateValue,
            exahashes.toFixed(1) +
            " EH/s"
        );

    }

}


/* =========================================================
   UPDATE DASHBOARD
========================================================= */

function updateDashboard() {

    if (
        state.btcUsd !== null
    ) {

        setText(
            elements.btcUsdPrice,
            formatUSD(
                state.btcUsd
            )
        );

    }


    if (
        state.btcPhp !== null
    ) {

        setText(
            elements.btcPhpPrice,
            formatPHP(
                state.btcPhp
            )
        );

    }


    if (
        state.usdPhpRate !== null
    ) {

        setText(
            elements.btcPhpRate,
            formatPHP(
                state.usdPhpRate
            ) +
            " / $1"
        );

    }


    setText(
        elements.usdChange,
        formatPercent(
            state.change24h
        )
    );


    setText(
        elements.phpChange,
        formatPercent(
            state.change24h
        )
    );


    updateChangeClass(
        elements.usdChange,
        state.change24h
    );


    updateChangeClass(
        elements.phpChange,
        state.change24h
    );


    setText(
        elements.high24,
        formatUSD(
            state.high24h
        )
    );


    setText(
        elements.low24,
        formatUSD(
            state.low24h
        )
    );


    setText(
        elements.volume24,
        formatCompactUSD(
            state.volume24h
        )
    );


    setText(
        elements.marketCap,
        formatCompactUSD(
            state.marketCap
        )
    );


    if (
        state.lastApiUpdate
    ) {

        setText(
            elements.lastUpdated,
            formatTime(
                state.lastApiUpdate
            )
        );

    }

}


/* =========================================================
   CHANGE COLOR
========================================================= */

function updateChangeClass(
    element,
    value
) {

    if (!element) {
        return;
    }


    element.classList.remove(
        "positive",
        "negative",
        "neutral"
    );


    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
            Number(value)
        )
    ) {

        element.classList.add(
            "neutral"
        );

        return;

    }


    if (
        Number(value) > 0
    ) {

        element.classList.add(
            "positive"
        );

    } else if (
        Number(value) < 0
    ) {

        element.classList.add(
            "negative"
        );

    } else {

        element.classList.add(
            "neutral"
        );

    }

}


/* =========================================================
   ADD LIVE POINT
========================================================= */

function addLivePoint() {

    if (
        state.btcUsd === null ||
        !Number.isFinite(
            state.btcUsd
        )
    ) {

        return;

    }


    let change =
        0;


    if (
        state.previousUsd !== null &&
        state.previousUsd !== 0
    ) {

        change =
            (
                (
                    state.btcUsd -
                    state.previousUsd
                ) /
                state.previousUsd
            ) *
            100;

    }


    state.livePoints.push({

        time:
            new Date(),

        price:
            state.btcUsd,

        php:
            state.btcPhp,

        change:
            change

    });


    while (
        state.livePoints.length >
        CONFIG.MAX_LIVE_POINTS
    ) {

        state.livePoints.shift();

    }

}


/* =========================================================
   MOMENTUM SIGNAL (TREND HEURISTIC - NOT A PREDICTION)
   Looks at how price actually moved over a recent window
   and labels the direction. This describes the past, it
   does not forecast the future.
========================================================= */

function computeMomentum(
    minutes
) {

    if (
        state.livePoints.length < 2
    ) {

        return null;

    }


    const cutoff =
        Date.now() -
        minutes * 60 * 1000;


    const windowPoints =
        state.livePoints.filter(
            point =>
                point.time.getTime() >=
                cutoff
        );


    if (
        windowPoints.length < 2
    ) {

        return null;

    }


    const first =
        windowPoints[0];

    const last =
        windowPoints[
            windowPoints.length - 1
        ];


    const elapsedMs =
        last.time.getTime() -
        first.time.getTime();


    /*
     * Require we've actually been collecting live
     * data for at least half of the window before
     * showing a signal - otherwise a few seconds of
     * data right after page load could look like a
     * confident reading when it's really just noise.
     */

    const requiredMs =
        minutes * 60 * 1000 * 0.5;


    if (
        elapsedMs < requiredMs
    ) {

        return null;

    }


    const pctChange =
        (
            (
                last.price -
                first.price
            ) /
            first.price
        ) *
        100;


    return {

        pctChange:
            pctChange

    };

}


function updateMomentumSignals() {

    const horizons = [

        {
            minutes: 5,
            arrowEl: elements.momentum5m,
            changeEl: elements.momentum5mChange
        },

        {
            minutes: 15,
            arrowEl: elements.momentum15m,
            changeEl: elements.momentum15mChange
        },

        {
            minutes: 60,
            arrowEl: elements.momentum1h,
            changeEl: elements.momentum1hChange
        }

    ];


    const neutralThreshold =
        0.05;


    horizons.forEach(
        horizon => {

            if (
                !horizon.arrowEl
            ) {

                return;

            }


            const result =
                computeMomentum(
                    horizon.minutes
                );


            if (
                !result
            ) {

                horizon.arrowEl.className =
                    "momentum-signal neutral";

                horizon.arrowEl.innerHTML =
                    '<span class="momentum-arrow">&rarr;</span>' +
                    '<span class="momentum-text">Gathering data...</span>';

                setText(
                    horizon.changeEl,
                    "--"
                );

                return;

            }


            let signalClass =
                "neutral";

            let arrow =
                "&rarr;";

            let label =
                "Sideways";


            if (
                result.pctChange >
                neutralThreshold
            ) {

                signalClass =
                    "up";

                arrow =
                    "&uarr;";

                label =
                    "Leaning Up";

            } else if (
                result.pctChange <
                -neutralThreshold
            ) {

                signalClass =
                    "down";

                arrow =
                    "&darr;";

                label =
                    "Leaning Down";

            }


            horizon.arrowEl.className =
                "momentum-signal " +
                signalClass;

            horizon.arrowEl.innerHTML =
                '<span class="momentum-arrow">' +
                arrow +
                '</span><span class="momentum-text">' +
                label +
                "</span>";


            setText(
                horizon.changeEl,
                formatPercent(
                    result.pctChange
                ) +
                " over window"
            );

        }
    );

}


/* =========================================================
   RENDER TICKER ROWS
   Driven straight from state.livePoints (which already
   carries usd/php/change on every tick), filtered by
   whichever range is selected in the ticker's own time
   buttons - independent of the chart's selected range.
========================================================= */

function renderTickerRows() {

    if (
        !elements.tickerRows
    ) {

        return;

    }


    const range =
        state.selectedTickerRange;


    let rows;


    if (
        range === "live" ||
        !WINDOW_MINUTES[range]
    ) {

        /*
         * LIVE: just the most recent ticks,
         * scrolling by every second.
         */

        rows =
            state.livePoints
                .slice(
                    -CONFIG.MAX_TICKER_ROWS
                )
                .slice()
                .reverse();

    } else {

        const filtered =
            filterPointsByRange(
                state.livePoints,
                range
            );


        /*
         * If the window holds more ticks than we
         * have room to show, spread the sample
         * evenly across the whole window instead
         * of just showing the tail - otherwise a
         * 1H window would look identical to LIVE,
         * since both would just be "the last 20
         * seconds."
         */

        let sampled =
            filtered;


        if (
            filtered.length >
            CONFIG.MAX_TICKER_ROWS
        ) {

            const step =
                Math.ceil(
                    filtered.length /
                    CONFIG.MAX_TICKER_ROWS
                );


            sampled =
                filtered.filter(
                    (
                        _,
                        index
                    ) =>
                        index %
                        step ===
                        0
                );


            const latest =
                filtered[
                    filtered.length - 1
                ];


            if (
                sampled[
                    sampled.length - 1
                ] !==
                latest
            ) {

                sampled =
                    sampled.concat(
                        [
                            latest
                        ]
                    );

            }

        }


        rows =
            sampled
                .slice()
                .reverse();

    }


    if (
        !rows.length
    ) {

        elements.tickerRows.innerHTML =
            `
            <div class="empty-ticker">
                Waiting for live data...
            </div>
            `;

        return;

    }


    elements.tickerRows.innerHTML =
        rows
            .map(
                item => {

                    const changeClass =
                        item.change >= 0
                            ? "ticker-positive"
                            : "ticker-negative";


                    return `
                        <div class="ticker-row">

                            <span>
                                ${formatShortTime(item.time)}
                            </span>

                            <span class="${changeClass}">
                                ${formatUSD(item.price)}
                            </span>

                            <span class="${changeClass}">
                                ${formatPHP(item.php)}
                            </span>

                            <span class="${changeClass}">
                                ${formatPercent(item.change)}
                            </span>

                        </div>
                    `;

                }
            )
            .join("");

}


/* =========================================================
   CROSSHAIR PLUGIN
   Draws a vertical line at whatever point on the chart is
   currently being hovered/touched, so it's easy to line up
   a price with its exact time on the axis. Works for
   whichever range is currently selected via the time
   buttons - it just follows the data that's on screen.
========================================================= */

const crosshairPlugin = {

    id:
        "crosshair",

    afterDraw(
        chart
    ) {

        const active =
            chart.getActiveElements();


        if (
            !active ||
            !active.length
        ) {

            return;

        }


        const point =
            active[0].element;


        if (
            !point
        ) {

            return;

        }


        const ctx =
            chart.ctx;

        const area =
            chart.chartArea;


        ctx.save();


        ctx.beginPath();


        ctx.moveTo(
            point.x,
            area.top
        );


        ctx.lineTo(
            point.x,
            area.bottom
        );


        ctx.lineWidth =
            1;


        ctx.setLineDash(
            [
                4,
                4
            ]
        );


        ctx.strokeStyle =
            "rgba(255,255,255,0.35)";


        ctx.stroke();


        ctx.restore();

    }

};


/* =========================================================
   PRICE TAG HELPER
   Draws a small rounded label near the right edge of the
   chart at a given y-value, like the floating price/"Start"
   tags on trading-app charts.
========================================================= */

function drawPriceTag(
    ctx,
    rightEdge,
    y,
    text,
    bgColor,
    areaTop,
    areaBottom
) {

    ctx.save();


    ctx.font =
        "700 11px Inter, system-ui, sans-serif";


    const paddingX =
        8;

    const boxHeight =
        20;

    const textWidth =
        ctx.measureText(
            text
        ).width;

    const boxWidth =
        textWidth +
        paddingX * 2;


    /*
     * Keep the tag fully inside the chart's drawable
     * area, even when the price it's pointing at sits
     * right at the very top or bottom of the visible
     * range - otherwise it gets clipped or overlaps
     * whatever sits just outside the chart (like the
     * axis's own gridline labels).
     */

    const clampedY =
        (
            areaTop !== undefined &&
            areaBottom !== undefined
        )
            ? Math.max(
                areaTop + (boxHeight / 2),
                Math.min(
                    areaBottom - (boxHeight / 2),
                    y
                )
            )
            : y;


    const boxX =
        rightEdge -
        boxWidth -
        10;

    const boxY =
        clampedY -
        boxHeight / 2;

    const radius =
        4;


    ctx.beginPath();

    ctx.moveTo(
        boxX + radius,
        boxY
    );

    ctx.lineTo(
        boxX + boxWidth - radius,
        boxY
    );

    ctx.quadraticCurveTo(
        boxX + boxWidth,
        boxY,
        boxX + boxWidth,
        boxY + radius
    );

    ctx.lineTo(
        boxX + boxWidth,
        boxY + boxHeight - radius
    );

    ctx.quadraticCurveTo(
        boxX + boxWidth,
        boxY + boxHeight,
        boxX + boxWidth - radius,
        boxY + boxHeight
    );

    ctx.lineTo(
        boxX + radius,
        boxY + boxHeight
    );

    ctx.quadraticCurveTo(
        boxX,
        boxY + boxHeight,
        boxX,
        boxY + boxHeight - radius
    );

    ctx.lineTo(
        boxX,
        boxY + radius
    );

    ctx.quadraticCurveTo(
        boxX,
        boxY,
        boxX + radius,
        boxY
    );

    ctx.closePath();


    ctx.fillStyle =
        bgColor;

    ctx.fill();


    ctx.fillStyle =
        "#ffffff";

    ctx.textBaseline =
        "middle";

    ctx.fillText(
        text,
        boxX + paddingX,
        boxY + boxHeight / 2
    );


    ctx.restore();

}


/* =========================================================
   PRICE LABELS PLUGIN
   Floating "Current" and "Start" price tags anchored to
   the two dashed/dotted reference lines.
========================================================= */

const priceLabelsPlugin = {

    id:
        "priceLabels",

    afterDraw(
        chart
    ) {

        const yScale =
            chart.scales &&
            chart.scales.y;


        if (
            !yScale
        ) {

            return;

        }


        const area =
            chart.chartArea;

        const ctx =
            chart.ctx;


        const currentSeries =
            chart.data.datasets[1] &&
            chart.data.datasets[1].data;

        const startSeries =
            chart.data.datasets[2] &&
            chart.data.datasets[2].data;


        if (
            startSeries &&
            startSeries.length
        ) {

            const startValue =
                startSeries[0];

            const y =
                yScale.getPixelForValue(
                    startValue
                );


            drawPriceTag(
                ctx,
                area.right,
                y,
                "Start " +
                formatUSD(
                    startValue
                ),
                "rgba(23,29,37,0.92)",
                area.top,
                area.bottom
            );

        }


        if (
            currentSeries &&
            currentSeries.length
        ) {

            const currentValue =
                currentSeries[
                    currentSeries.length - 1
                ];

            const y =
                yScale.getPixelForValue(
                    currentValue
                );


            drawPriceTag(
                ctx,
                area.right,
                y,
                formatUSD(
                    currentValue
                ),
                "#f7931a",
                area.top,
                area.bottom
            );

        }

    }

};


/* =========================================================
   INITIALIZE CHART
========================================================= */

function initializeChart() {

    const canvas =
        document.getElementById(
            "bitcoinChart"
        );


    /*
     * IMPORTANT:
     * Check canvas before using getContext().
     */

    if (!canvas) {

        console.error(
            "Bitcoin chart error: #bitcoinChart was not found."
        );


        setText(
            elements.chartStatus,
            "Chart canvas not found"
        );


        if (
            elements.chartDot
        ) {

            elements.chartDot
                .className =
                "small-status offline";

        }


        return false;

    }


    /*
     * IMPORTANT:
     * Check Chart.js before creating chart.
     */

    if (
        typeof Chart ===
        "undefined"
    ) {

        console.error(
            "Bitcoin chart error: Chart.js is not loaded."
        );


        setText(
            elements.chartStatus,
            "Chart.js not loaded"
        );


        if (
            elements.chartDot
        ) {

            elements.chartDot
                .className =
                "small-status offline";

        }


        return false;

    }


    const context =
        canvas.getContext(
            "2d"
        );


    if (!context) {

        console.error(
            "Bitcoin chart error: Canvas context unavailable."
        );


        return false;

    }


    try {

        state.chart =
            new Chart(
                context,
                {

                    type:
                        "line",

                    data: {

                        labels:
                            [],

                        datasets: [

                            {

                                label:
                                    "BTC/USD",

                                data:
                                    [],

                                borderColor:
                                    "#f7931a",

                                backgroundColor:
                                    "rgba(247,147,26,0.10)",

                                borderWidth:
                                    2,

                                pointRadius:
                                    0,

                                pointHoverRadius:
                                    5,

                                tension:
                                    0.25,

                                /*
                                 * Prevents the curve-smoothing
                                 * from overshooting past nearby
                                 * points on a sharp reversal
                                 * (the small "bump" right before
                                 * a steep drop/rise) - monotone
                                 * interpolation stays within the
                                 * bounds of the surrounding data.
                                 */

                                cubicInterpolationMode:
                                    "monotone",

                                fill:
                                    true,

                                order:
                                    1

                            },

                            {

                                label:
                                    "Current price",

                                data:
                                    [],

                                borderColor:
                                    "rgba(255,255,255,0.35)",

                                borderWidth:
                                    1,

                                borderDash:
                                    [
                                        6,
                                        4
                                    ],

                                pointRadius:
                                    0,

                                pointHoverRadius:
                                    0,

                                fill:
                                    false,

                                tension:
                                    0,

                                order:
                                    2

                            },

                            {

                                label:
                                    "Start of period",

                                data:
                                    [],

                                borderColor:
                                    "rgba(247,147,26,0.45)",

                                borderWidth:
                                    1,

                                borderDash:
                                    [
                                        2,
                                        3
                                    ],

                                pointRadius:
                                    0,

                                pointHoverRadius:
                                    0,

                                fill:
                                    false,

                                tension:
                                    0,

                                order:
                                    3

                            }

                        ]

                    },


                    options: {

                        responsive:
                            true,

                        maintainAspectRatio:
                            false,


                        /*
                         * Animation off entirely. The real
                         * fix for axis "blinking" is the y-
                         * range hysteresis in applyChartSeries
                         * (it keeps the axis stable so it
                         * rarely needs to rescale at all) -
                         * animating the rescale just caused a
                         * different bug: since live data gets
                         * replaced wholesale on every tick,
                         * Chart.js can't interpolate cleanly
                         * and instead animates new points up
                         * from the bottom of the chart every
                         * time, which is the "growing"/
                         * "wiggling" effect on fast-updating
                         * ranges like 1M/5M.
                         */

                        animation:
                            false,


                        interaction: {

                            intersect:
                                false,

                            mode:
                                "index"

                        },


                        plugins: {

                            legend: {

                                display:
                                    false

                            },


                            tooltip: {

                                backgroundColor:
                                    "#11161d",

                                borderColor:
                                    "rgba(255,255,255,.1)",

                                borderWidth:
                                    1,

                                padding:
                                    12,

                                displayColors:
                                    false,

                                filter:
                                    function(context) {

                                        /*
                                         * Only show the price
                                         * line in the tooltip -
                                         * the dashed reference
                                         * line is just visual.
                                         */

                                        return (
                                            context.datasetIndex ===
                                            0
                                        );

                                    },

                                callbacks: {

                                    label:
                                        function(context) {

                                            return (
                                                "BTC: " +
                                                formatUSD(
                                                    context.parsed.y
                                                )
                                            );

                                        }

                                }

                            }

                        },


                        scales: {

                            x: {

                                grid: {

                                    display:
                                        false

                                },

                                ticks: {

                                    color:
                                        "#6f7885",

                                    autoSkip:
                                        false,

                                    maxRotation:
                                        0,

                                    font: {

                                        size:
                                            10

                                    },

                                    /*
                                     * Only the points we've
                                     * explicitly marked (see
                                     * buildMarkedSeries) carry
                                     * a non-empty label - hide
                                     * every other tick so the
                                     * axis isn't cluttered.
                                     */

                                    callback:
                                        function(value) {

                                            const label =
                                                this.getLabelForValue(
                                                    value
                                                );

                                            return label ||
                                                null;

                                        }

                                }

                            },


                            y: {

                                position:
                                    "right",

                                grid: {

                                    color:
                                        "rgba(255,255,255,.05)"

                                },

                                ticks: {

                                    color:
                                        "#6f7885",

                                    font: {

                                        size:
                                            10

                                    },

                                    callback:
                                        function(value) {

                                            return formatCompactUSD(
                                                value
                                            );

                                        }

                                }

                            }

                        }

                    },

                    plugins: [
                        crosshairPlugin,
                        priceLabelsPlugin
                    ]

                }
            );


        if (
            elements.chartDot
        ) {

            elements.chartDot
                .className =
                "small-status online";

        }


        setText(
            elements.chartStatus,
            "Ready"
        );


        return true;

    } catch (error) {

        console.error(
            "Chart initialization error:",
            error
        );


        state.chart =
            null;


        setText(
            elements.chartStatus,
            "Chart initialization failed"
        );


        if (
            elements.chartDot
        ) {

            elements.chartDot
                .className =
                "small-status offline";

        }


        return false;

    }

}


/* =========================================================
   CHART MARK INTERVALS
   How often a point gets a visible dot + axis label,
   per selected range. Everything in between still draws
   as part of the line, just without a marker/label.
========================================================= */

const MARK_INTERVAL_MS = {

    live:
        15 * 1000,

    "1m":
        5 * 1000,

    "5m":
        20 * 1000,

    "15m":
        60 * 1000,

    "30m":
        2 * 60 * 1000,

    "1h":
        5 * 60 * 1000,

    "24h":
        60 * 60 * 1000,

    "7d":
        12 * 60 * 60 * 1000,

    "30d":
        2 * 24 * 60 * 60 * 1000,

    "1y":
        30 * 24 * 60 * 60 * 1000

};


/* =========================================================
   BUILD MARKED CHART SERIES
========================================================= */

function buildMarkedSeries(
    points,
    range,
    formatLabel
) {

    const intervalMs =
        MARK_INTERVAL_MS[range] ||
        0;


    let lastBucket =
        null;


    const labels =
        [];

    const prices =
        [];

    const pointRadii =
        [];


    points.forEach(
        point => {

            prices.push(
                point.price
            );


            let isMark =
                true;


            if (
                intervalMs > 0
            ) {

                const bucket =
                    Math.floor(
                        point.time.getTime() /
                        intervalMs
                    );


                isMark =
                    bucket !==
                    lastBucket;


                if (
                    isMark
                ) {

                    lastBucket =
                        bucket;

                }

            }


            labels.push(
                isMark
                    ? formatLabel(
                        point.time
                    )
                    : ""
            );


            pointRadii.push(
                isMark
                    ? 3
                    : 0
            );

        }
    );


    return {

        labels:
            labels,

        prices:
            prices,

        pointRadii:
            pointRadii

    };

}


/* =========================================================
   SNAKE-TIP ANIMATION
   Instead of asking Chart.js's built-in animation system to
   reinterpolate the entire array every tick (which breaks
   down once the window slides and indices no longer line
   up - that's what caused the earlier "growing from the
   bottom" bug), this only tweens the single newest point,
   easing it from its previous value to the new one. Every
   older point on the line is set directly with no
   animation, so nothing else can wiggle.
========================================================= */

let chartTipAnimationFrame =
    null;

function animateChartTip(
    targetPrices
) {

    if (
        !state.chart ||
        !targetPrices.length
    ) {

        return;

    }


    const currentData =
        state.chart.data.datasets[0].data;

    const previousLast =
        currentData.length
            ? currentData[
                currentData.length - 1
            ]
            : null;

    const targetLast =
        targetPrices[
            targetPrices.length - 1
        ];


    const lastIndex =
        targetPrices.length - 1;


    if (
        chartTipAnimationFrame
    ) {

        cancelAnimationFrame(
            chartTipAnimationFrame
        );

        chartTipAnimationFrame =
            null;

    }


    const startValue =
        (
            previousLast !== null &&
            previousLast !== undefined &&
            Number.isFinite(
                previousLast
            )
        )
            ? previousLast
            : targetLast;


    /*
     * Set every point except the tip immediately -
     * only the newest point eases in.
     */

    state.chart.data.datasets[0].data =
        targetPrices
            .slice(
                0,
                -1
            )
            .concat(
                [
                    startValue
                ]
            );


    if (
        startValue === targetLast
    ) {

        state.chart.data.datasets[0].data[lastIndex] =
            targetLast;


        state.chart.update(
            "none"
        );


        return;

    }


    const durationMs =
        280;

    const startTime =
        performance.now();


    function step(
        now
    ) {

        const elapsed =
            now - startTime;

        const progress =
            Math.min(
                elapsed / durationMs,
                1
            );


        const eased =
            1 -
            Math.pow(
                1 - progress,
                3
            );


        const value =
            startValue +
            (
                (targetLast - startValue) *
                eased
            );


        const data =
            state.chart.data.datasets[0].data;

        data[
            data.length - 1
        ] =
            value;


        state.chart.update(
            "none"
        );


        if (
            progress < 1
        ) {

            chartTipAnimationFrame =
                requestAnimationFrame(
                    step
                );

        } else {

            chartTipAnimationFrame =
                null;

        }

    }


    chartTipAnimationFrame =
        requestAnimationFrame(
            step
        );

}


/* =========================================================
   APPLY SERIES TO CHART
========================================================= */

function applyChartSeries(
    points,
    range,
    formatLabel,
    animateTip
) {

    if (
        !state.chart
    ) {

        return;

    }


    const series =
        buildMarkedSeries(
            points,
            range,
            formatLabel
        );


    state.chart.data.labels =
        series.labels;


    if (
        animateTip
    ) {

        animateChartTip(
            series.prices
        );

    } else {

        state.chart.data.datasets[0].data =
            series.prices;

    }


    state.chart.data.datasets[0].label =
        "BTC/USD";


    state.chart.data.datasets[0].pointRadius =
        series.pointRadii;


    state.chart.data.datasets[0].pointHoverRadius =
        5;


    state.chart.data.datasets[0].pointBackgroundColor =
        "#f7931a";


    /*
     * Dashed reference line at the current/last
     * price in this series, so it's easy to see at
     * a glance whether the historical line sits
     * above or below where price is right now.
     */

    const referencePrice =
        series.prices.length > 0
            ? series.prices[
                series.prices.length - 1
            ]
            : null;


    state.chart.data.datasets[1].data =
        referencePrice === null
            ? []
            : series.prices.map(
                () =>
                    referencePrice
            );


    /*
     * Dotted reference line at the price the
     * period STARTED at, so it's easy to see how
     * far things have moved since then - mirrors
     * the "Start" marker on trading-app charts.
     */

    const startPrice =
        series.prices.length > 0
            ? series.prices[0]
            : null;


    state.chart.data.datasets[2].data =
        startPrice === null
            ? []
            : series.prices.map(
                () =>
                    startPrice
            );


    /*
     * STABLE Y-AXIS RANGE
     * Without this, Chart.js recalculates the axis
     * min/max on every single tick based on whatever's
     * currently visible - so even a tiny price wiggle
     * makes the whole axis snap to a new scale, which
     * reads as the chart "blinking." Instead: compute a
     * padded range, and only widen it when the data
     * would actually clip outside the current bounds
     * (or tighten it if the current bounds have become
     * way oversized) - otherwise keep reusing the same
     * bounds so the axis holds still.
     */

    const freshRange =
        computeYAxisRange(
            series.prices
        );


    if (
        freshRange
    ) {

        const cached =
            state.chartYRanges[range];


        let finalRange =
            freshRange;


        if (
            cached
        ) {

            const stillFits =
                freshRange.min >= cached.min &&
                freshRange.max <= cached.max;


            const cachedSpan =
                cached.max - cached.min;

            const freshSpan =
                freshRange.max - freshRange.min;


            const wayOversized =
                cachedSpan >
                freshSpan * 2.5;


            if (
                stillFits &&
                !wayOversized
            ) {

                finalRange =
                    cached;

            }

        }


        state.chartYRanges[range] =
            finalRange;


        state.chart.options.scales.y.min =
            finalRange.min;


        state.chart.options.scales.y.max =
            finalRange.max;

    }

}


/* =========================================================
   COMPUTE PADDED Y-AXIS RANGE
========================================================= */

function computeYAxisRange(
    prices
) {

    if (
        !prices ||
        !prices.length
    ) {

        return null;

    }


    let min =
        prices[0];

    let max =
        prices[0];


    prices.forEach(
        price => {

            if (
                price < min
            ) {

                min =
                    price;

            }


            if (
                price > max
            ) {

                max =
                    price;

            }

        }
    );


    if (
        min === max
    ) {

        const flatPad =
            Math.max(
                min * 0.001,
                1
            );


        return {

            min:
                min - flatPad,

            max:
                max + flatPad

        };

    }


    const span =
        max - min;

    const padding =
        span * 0.15;


    return {

        min:
            min - padding,

        max:
            max + padding

    };

}


/* =========================================================
   PERIOD SUMMARY (HIGH / LOW / POSITION FOR THE
   CURRENTLY SELECTED CHART RANGE)
========================================================= */

function updatePeriodSummary(
    points
) {

    if (
        !elements.periodHigh ||
        !points ||
        points.length === 0
    ) {

        return;

    }


    let high =
        -Infinity;

    let low =
        Infinity;


    points.forEach(
        point => {

            if (
                point.price > high
            ) {

                high =
                    point.price;

            }


            if (
                point.price < low
            ) {

                low =
                    point.price;

            }

        }
    );


    const current =
        points[
            points.length - 1
        ].price;


    setText(
        elements.periodHigh,
        formatUSD(
            high
        )
    );


    setText(
        elements.periodLow,
        formatUSD(
            low
        )
    );


    setText(
        elements.periodCurrent,
        formatUSD(
            current
        )
    );


    const span =
        high -
        low;


    let positionLabel =
        "Flat - no movement";

    let positionClass =
        "neutral";


    if (
        span > 0
    ) {

        const positionPct =
            (
                current -
                low
            ) /
            span;


        if (
            positionPct >= 0.85
        ) {

            positionLabel =
                "Near period high";

            positionClass =
                "up";

        } else if (
            positionPct <= 0.15
        ) {

            positionLabel =
                "Near period low";

            positionClass =
                "down";

        } else if (
            positionPct > 0.5
        ) {

            positionLabel =
                "Upper half of range";

            positionClass =
                "up";

        } else {

            positionLabel =
                "Lower half of range";

            positionClass =
                "down";

        }

    }


    setText(
        elements.periodPosition,
        positionLabel
    );


    if (
        elements.periodPosition
    ) {

        elements.periodPosition.className =
            "signal-value " +
            positionClass;

    }

}


/* =========================================================
   INTERVAL STRIP
   A row of small blocks, one per closed time interval,
   colored by whether that interval closed higher (green)
   or lower (red) than it opened. Purely a historical
   record of what already happened - not a bet, not a
   forecast.
========================================================= */

function renderIntervalStrip(
    points,
    range
) {

    if (
        !elements.intervalStrip ||
        !points ||
        points.length === 0
    ) {

        return;

    }


    const bucketMs =
        MARK_INTERVAL_MS[range] ||
        60 * 1000;


    const isLiveRange =
        range === "live" ||
        Boolean(
            WINDOW_MINUTES[range]
        );


    const formatter =
        isLiveRange
            ? formatShortTime
            : formatChartDate;


    const buckets =
        new Map();


    points.forEach(
        point => {

            const bucketKey =
                Math.floor(
                    point.time.getTime() /
                    bucketMs
                );


            if (
                !buckets.has(
                    bucketKey
                )
            ) {

                buckets.set(
                    bucketKey,
                    {
                        time:
                            point.time,

                        open:
                            point.price,

                        close:
                            point.price
                    }
                );

            } else {

                buckets.get(
                    bucketKey
                ).close =
                    point.price;

            }

        }
    );


    const ordered =
        Array.from(
            buckets.values()
        ).slice(
            -8
        );


    if (
        !ordered.length
    ) {

        elements.intervalStrip.innerHTML =
            "";

        return;

    }


    elements.intervalStrip.innerHTML =
        ordered
            .map(
                bucket => {

                    const direction =
                        bucket.close >
                        bucket.open
                            ? "up"
                            : bucket.close <
                                bucket.open
                                ? "down"
                                : "flat";


                    return `
                        <div class="interval-item">

                            <span class="interval-time">
                                ${formatter(bucket.time)}
                            </span>

                            <span class="interval-bar ${direction}"></span>

                        </div>
                    `;

                }
            )
            .join("");

}


/* =========================================================
   MOMENTUM BACKTEST CALCULATOR
   A one-off historical calculation over the live points
   currently buffered in memory. No money, no running
   score, no repeat-play loop - just: "how often did this
   one simple rule hold true in the data we actually have."
========================================================= */

function findNearestPoint(
    points,
    targetTimeMs
) {

    let nearest =
        null;

    let bestDiff =
        Infinity;


    points.forEach(
        point => {

            const diff =
                Math.abs(
                    point.time.getTime() -
                    targetTimeMs
                );


            if (
                diff < bestDiff
            ) {

                bestDiff =
                    diff;

                nearest =
                    point;

            }

        }
    );


    return {

        point:
            nearest,

        diffMs:
            bestDiff

    };

}


function parseTimeToMinutes(
    timeString
) {

    if (
        !timeString ||
        typeof timeString !== "string"
    ) {

        return null;

    }


    const parts =
        timeString.split(
            ":"
        );


    if (
        parts.length < 2
    ) {

        return null;

    }


    const hours =
        Number(
            parts[0]
        );

    const minutes =
        Number(
            parts[1]
        );


    if (
        !Number.isFinite(hours) ||
        !Number.isFinite(minutes)
    ) {

        return null;

    }


    return (
        hours * 60
    ) +
    minutes;

}


function runMomentumBacktest() {

    if (
        !elements.backtestError
    ) {

        return;

    }


    setText(
        elements.backtestError,
        ""
    );


    const startClock =
        parseTimeToMinutes(
            elements.backtestStart &&
            elements.backtestStart.value
        );

    const pickMin =
        Number(
            elements.backtestPick &&
            elements.backtestPick.value
        );

    const endMin =
        Number(
            elements.backtestEnd &&
            elements.backtestEnd.value
        );


    if (
        startClock === null
    ) {

        setText(
            elements.backtestError,
            "Please set a start time."
        );

        return;

    }


    if (
        !Number.isFinite(pickMin) ||
        !Number.isFinite(endMin) ||
        pickMin <= 0 ||
        endMin <= 0
    ) {

        setText(
            elements.backtestError,
            "Pick and End must be positive numbers of minutes."
        );

        return;

    }


    if (
        !(
            pickMin < endMin
        )
    ) {

        setText(
            elements.backtestError,
            "End (minutes) must be greater than Pick (minutes)."
        );

        return;

    }


    const points =
        state.livePoints;


    if (
        points.length < 2
    ) {

        setText(
            elements.backtestError,
            "Not enough live data buffered yet - let the dashboard run a bit longer."
        );

        return;

    }


    const roundMs =
        endMin * 60 * 1000;

    const lastTime =
        points[
            points.length - 1
        ].time.getTime();


    /*
     * Anchor round 1's Start to whichever buffered
     * point's time-of-day is closest to the chosen
     * Start Time. The live buffer only holds roughly
     * the last hour, so an exact match won't usually
     * exist - fall back to the earliest buffered
     * point if nothing is reasonably close, and say
     * so in the results.
     */

    let anchorNote =
        null;

    let bestAnchor =
        points[0];

    let bestAnchorDiff =
        Infinity;


    points.forEach(
        point => {

            const pointClock =
                (
                    point.time.getHours() * 60
                ) +
                point.time.getMinutes();


            let diff =
                Math.abs(
                    pointClock -
                    startClock
                );


            diff =
                Math.min(
                    diff,
                    (24 * 60) - diff
                );


            if (
                diff < bestAnchorDiff
            ) {

                bestAnchorDiff =
                    diff;

                bestAnchor =
                    point;

            }

        }
    );


    if (
        bestAnchorDiff > 5
    ) {

        anchorNote =
            "The exact Start Time you chose isn't in the buffered history " +
            "(it only holds roughly the last hour), so this used the earliest " +
            "buffered data instead.";

        bestAnchor =
            points[0];

    }


    const firstTime =
        bestAnchor.time.getTime();


    /*
     * A checkpoint only counts if the nearest
     * actual tick is within this tolerance of the
     * requested target - otherwise "near 8:00"
     * could silently match a tick from a very
     * different time and produce a meaningless
     * result.
     */

    const toleranceMs =
        30 * 1000;


    let wins =
        0;

    let losses =
        0;

    let pushes =
        0;

    let skipped =
        0;


    for (
        let roundStart = firstTime;
        roundStart + roundMs <= lastTime;
        roundStart += roundMs
    ) {

        const startTarget =
            roundStart;

        const pickTarget =
            roundStart +
            pickMin * 60 * 1000;

        const endTarget =
            roundStart +
            endMin * 60 * 1000;


        const startFound =
            findNearestPoint(
                points,
                startTarget
            );

        const pickFound =
            findNearestPoint(
                points,
                pickTarget
            );

        const endFound =
            findNearestPoint(
                points,
                endTarget
            );


        if (
            !startFound.point ||
            !pickFound.point ||
            !endFound.point ||
            startFound.diffMs > toleranceMs ||
            pickFound.diffMs > toleranceMs ||
            endFound.diffMs > toleranceMs
        ) {

            skipped =
                skipped + 1;

            continue;

        }


        const momentum =
            pickFound.point.price -
            startFound.point.price;

        const outcome =
            endFound.point.price -
            pickFound.point.price;


        if (
            momentum === 0 ||
            outcome === 0
        ) {

            pushes =
                pushes + 1;

            continue;

        }


        const predictedUp =
            momentum > 0;

        const actualUp =
            outcome > 0;


        if (
            predictedUp === actualUp
        ) {

            wins =
                wins + 1;

        } else {

            losses =
                losses + 1;

        }

    }


    const decisive =
        wins + losses;

    const winRate =
        decisive > 0
            ? (
                wins / decisive
            ) * 100
            : null;


    setText(
        elements.backtestRounds,
        String(
            decisive + pushes
        )
    );


    setText(
        elements.backtestWins,
        String(
            wins
        )
    );


    setText(
        elements.backtestLosses,
        String(
            losses
        )
    );


    setText(
        elements.backtestWinRate,
        winRate === null
            ? "--"
            : winRate.toFixed(1) + "%"
    );


    if (
        elements.backtestWarning
    ) {

        let message =
            "";


        if (
            decisive === 0
        ) {

            message =
                "No complete rounds found in the currently buffered live history " +
                "(the live buffer only holds roughly the last hour, and resets on " +
                "page refresh). Let the dashboard run longer, then run again.";

        } else if (
            decisive < 10
        ) {

            message =
                "Only " +
                decisive +
                " round(s) found - nowhere near enough to draw any real conclusion " +
                "about this rule. Treat this number as noise, not a result.";

        } else {

            message =
                "Based on " +
                decisive +
                " round(s) from the live history currently buffered in this tab. " +
                "This describes what already happened in that window - it says " +
                "nothing about what happens next, and it isn't financial advice.";

        }


        if (
            anchorNote
        ) {

            message =
                anchorNote +
                " " +
                message;

        }


        elements.backtestWarning.textContent =
            message;

    }

}


/* =========================================================
   TIME-WINDOW LOOKUP (MINUTES)
   Shared between the chart and the ticker table so both
   respect the same range definitions.
========================================================= */

const WINDOW_MINUTES = {

    "1m":
        1,

    "5m":
        5,

    "15m":
        15,

    "30m":
        30,

    "1h":
        60

};


function filterPointsByRange(
    points,
    range
) {

    const minutes =
        WINDOW_MINUTES[range];


    if (
        !minutes
    ) {

        return points;

    }


    const cutoff =
        Date.now() -
        minutes * 60 * 1000;


    return points.filter(
        point =>
            point.time.getTime() >=
            cutoff
    );

}


/* =========================================================
   UPDATE LIVE CHART
========================================================= */

function updateChart() {

    if (
        !state.chart
    ) {

        return;

    }


    const points =
        filterPointsByRange(
            state.livePoints,
            state.selectedRange
        );


    applyChartSeries(
        points,
        state.selectedRange,
        formatShortTime,
        true
    );


    updatePeriodSummary(
        points
    );


    renderIntervalStrip(
        points,
        state.selectedRange
    );


    state.chart.update(
        "none"
    );

}


/* =========================================================
   FETCH HISTORICAL CHART
========================================================= */

async function fetchHistoricalChart(
    days
) {

    if (
        !state.chart
    ) {

        return;

    }


    if (
        elements.chartLoading
    ) {

        elements.chartLoading.style.display =
            "flex";

        elements.chartLoading.textContent =
            "Loading historical Bitcoin data...";

    }


    const backendRange =
        days <= 1
            ? "1h"
            : days <= 7
                ? "7d"
                : days <= 30
                    ? "30d"
                    : "1y";

    const backendUrl =
        CONFIG.BACKEND_API_BASE +
        "/market/history?range=" +
        backendRange;

    const url =
        CONFIG.API_BASE +
        "/coins/" +
        CONFIG.COIN_ID +
        "/market_chart" +
        "?vs_currency=usd" +
        "&days=" +
        days;


    try {

        let data;

        try {

            const backendData =
                await fetchJSON(
                    backendUrl
                );

            if (
                backendData.points &&
                backendData.points.length > 0
            ) {

                data = {
                    prices:
                        backendData.points.map(
                            point => [
                                new Date(
                                    point.time
                                ).getTime(),
                                Number(
                                    point.close
                                )
                            ]
                        )
                };

            }

        } catch (backendError) {

            console.warn(
                "Backend history unavailable; using CoinGecko fallback:",
                backendError
            );

        }

        if (!data) {

            data =
                await fetchJSON(
                    url
                );

        }


        if (
            !data.prices ||
            !Array.isArray(
                data.prices
            ) ||
            data.prices.length === 0
        ) {

            throw new Error(
                "No historical Bitcoin data"
            );

        }


        const points =
            data.prices.map(
                item => ({

                    time:
                        new Date(
                            item[0]
                        ),

                    price:
                        Number(
                            item[1]
                        )

                })
            );


        /*
         * Limit points for performance.
         */

        const maximum =
            500;


        let processed =
            points;


        if (
            points.length >
            maximum
        ) {

            const step =
                Math.ceil(
                    points.length /
                    maximum
                );


            processed =
                points.filter(
                    (
                        _,
                        index
                    ) =>
                        index %
                        step ===
                        0
                );

        }


        state.historical[
            state.selectedRange
        ] =
            processed;


        renderHistoricalChart(
            processed
        );


        if (
            elements.chartLoading
        ) {

            elements.chartLoading.style.display =
                "none";

        }


        if (
            elements.chartDot
        ) {

            elements.chartDot
                .className =
                "small-status online";

        }


        setText(
            elements.chartStatus,
            "Historical data loaded"
        );


    } catch (error) {

        console.error(
            "Historical chart error:",
            error
        );


        if (
            elements.chartLoading
        ) {

            elements.chartLoading.textContent =
                error.message === "RATE_LIMITED"
                    ? "CoinGecko rate-limited this request. Their free/keyless tier has a shared, low limit - see the note below the chart."
                    : "Unable to load historical data.";

            elements.chartLoading.style.display =
                "flex";

        }


        setText(
            elements.chartStatus,
            error.message === "RATE_LIMITED"
                ? "Rate limited by CoinGecko"
                : "Historical data unavailable"
        );

    }

}


/* =========================================================
   RENDER HISTORICAL CHART
========================================================= */

function renderHistoricalChart(
    points
) {

    if (
        !state.chart
    ) {

        return;

    }


    applyChartSeries(
        points,
        state.selectedRange,
        formatChartDate
    );


    updatePeriodSummary(
        points
    );


    renderIntervalStrip(
        points,
        state.selectedRange
    );


    state.chart.update();

}


/* =========================================================
   CHART DATE FORMAT
========================================================= */

function formatChartDate(
    date
) {

    if (
        state.selectedRange ===
        "1y"
    ) {

        return date.toLocaleDateString(
            "en-PH",
            {
                month:
                    "short",

                year:
                    "2-digit"
            }
        );

    }


    if (
        state.selectedRange ===
        "30d"
    ) {

        return date.toLocaleDateString(
            "en-PH",
            {
                month:
                    "short",

                day:
                    "numeric"
            }
        );

    }


    if (
        state.selectedRange ===
        "7d"
    ) {

        return date.toLocaleDateString(
            "en-PH",
            {
                weekday:
                    "short",

                hour:
                    "2-digit"
            }
        );

    }


    return date.toLocaleTimeString(
        "en-PH",
        {
            hour:
                "2-digit",

            minute:
                "2-digit",

            hour12:
                false
        }
    );

}


/* =========================================================
   RANGE BUTTONS
========================================================= */

function initializeRangeButtons() {

    const buttons =
        document.querySelectorAll(
            ".chart-header .time-btn"
        );


    if (
        !buttons.length
    ) {

        console.warn(
            "No .time-btn elements found."
        );

        return;

    }


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                async () => {

                    buttons.forEach(
                        btn => {

                            btn.classList.remove(
                                "active"
                            );

                        }
                    );


                    button.classList.add(
                        "active"
                    );


                    const range =
                        button.dataset.range;


                    if (
                        !range
                    ) {

                        console.warn(
                            "Time button has no data-range attribute."
                        );

                        return;

                    }


                    state.selectedRange =
                        range;


                    /*
                     * LIVE
                     */

                    if (
                        range ===
                        "live"
                    ) {

                        if (
                            elements.chartLoading
                        ) {

                            elements.chartLoading.style.display =
                                "none";

                        }


                        updateChart();

                        return;

                    }


                    /*
                     * 1 / 5 / 15 / 30 MINUTES / 1 HOUR
                     * (all drawn straight from the live
                     * in-memory points, no API call needed)
                     */

                    if (
                        range === "1m" ||
                        range === "5m" ||
                        range === "15m" ||
                        range === "30m" ||
                        range === "1h"
                    ) {

                        if (
                            elements.chartLoading
                        ) {

                            elements.chartLoading.style.display =
                                "none";

                        }


                        updateChart();

                        return;

                    }


                    /*
                     * 24 HOURS
                     */

                    if (
                        range ===
                        "24h"
                    ) {

                        await fetchHistoricalChart(
                            1
                        );

                        return;

                    }


                    /*
                     * 7 DAYS
                     */

                    if (
                        range ===
                        "7d"
                    ) {

                        await fetchHistoricalChart(
                            7
                        );

                        return;

                    }


                    /*
                     * 30 DAYS
                     */

                    if (
                        range ===
                        "30d"
                    ) {

                        await fetchHistoricalChart(
                            30
                        );

                        return;

                    }


                    /*
                     * 1 YEAR
                     */

                    if (
                        range ===
                        "1y"
                    ) {

                        await fetchHistoricalChart(
                            365
                        );

                    }

                }
            );

        }
    );

}


/* =========================================================
   TICKER RANGE BUTTONS
   Separate from the chart's time buttons - filters the
   Live Price Stream table independently. All in-memory,
   so switching is instant, no fetch involved.
========================================================= */

function initializeTickerRangeButtons() {

    const buttons =
        document.querySelectorAll(
            ".ticker-toolbar .time-btn"
        );


    if (
        !buttons.length
    ) {

        return;

    }


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    buttons.forEach(
                        btn => {

                            btn.classList.remove(
                                "active"
                            );

                        }
                    );


                    button.classList.add(
                        "active"
                    );


                    const range =
                        button.dataset.tickerRange;


                    if (
                        !range
                    ) {

                        return;

                    }


                    state.selectedTickerRange =
                        range;


                    renderTickerRows();

                }
            );

        }
    );

}


/* =========================================================
   START AUTO UPDATE
========================================================= */

function startAutoUpdate() {

    /*
     * Open the live Binance price stream. This
     * pushes updates continuously - no interval
     * needed for the USD price.
     */

    connectPriceStream();


    /*
     * The slower PHP / market-cap lookup still
     * runs on a timer since that data doesn't
     * need second-by-second freshness.
     */

    fetchPeriodicMarketData();


    state.periodicTimer =
        setInterval(
            fetchPeriodicMarketData,
            CONFIG.PERIODIC_INTERVAL
        );


    /*
     * Funding rate + open interest, same slow cadence.
     */

    fetchMarketSignals();


    state.signalsTimer =
        setInterval(
            fetchMarketSignals,
            CONFIG.PERIODIC_INTERVAL
        );


    /*
     * Fear & Greed barely moves - poll it rarely.
     */

    fetchFearGreed();


    state.fearGreedTimer =
        setInterval(
            fetchFearGreed,
            CONFIG.FEAR_GREED_INTERVAL
        );


    /*
     * Network-wide tx count + hash rate also barely
     * move minute to minute.
     */

    fetchNetworkStats();


    state.networkStatsTimer =
        setInterval(
            fetchNetworkStats,
            CONFIG.NETWORK_STATS_INTERVAL
        );

}


/* =========================================================
   VISIBILITY OPTIMIZATION
========================================================= */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.hidden
        ) {

            setText(
                elements.updateStatus,
                "Paused in background"
            );

        } else {

            /*
             * Reconnect the live stream if it
             * dropped while the tab was hidden,
             * and refresh the slower PHP/market
             * cap data right away.
             */

            connectPriceStream();


            fetchPeriodicMarketData();


            fetchMarketSignals();

        }

    }
);


/* =========================================================
   ONLINE / OFFLINE DETECTION
========================================================= */

window.addEventListener(
    "online",
    () => {

        connectPriceStream();


        fetchPeriodicMarketData();


        fetchMarketSignals();

    }
);


window.addEventListener(
    "offline",
    () => {

        setConnectionStatus(
            false
        );


        setText(
            elements.updateStatus,
            "Browser offline"
        );

    }
);


/* =========================================================
   INITIALIZE APPLICATION
========================================================= */

function initializeApp() {

    console.log(
        "Bitcoin Live Dashboard initializing..."
    );


    /*
     * Initialize Chart.js safely.
     */

    initializeChart();


    /*
     * Initialize time range buttons.
     */

    initializeRangeButtons();


    initializeTickerRangeButtons();


    if (
        elements.runBacktestBtn
    ) {

        elements.runBacktestBtn.addEventListener(
            "click",
            runMomentumBacktest
        );

    }


    /*
     * Start Bitcoin API updates.
     */

    startAutoUpdate();


    console.log(
        "Bitcoin Live Dashboard initialized."
    );

}


/* =========================================================
   START APPLICATION
========================================================= */

initializeApp();
