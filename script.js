/* =========================================================
   BITCOIN LIVE DASHBOARD
   JAVASCRIPT - FIXED VERSION
========================================================= */

"use strict";


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = {

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

    lastApiUpdate: null,

    connection: false,

    selectedRange:
        "live",

    selectedTickerRange:
        "live",

    livePoints: [],

    historical: {},

    chart: null,

    socket: null,

    reconnectTimer: null,

    reconnectAttempts: 0,

    periodicTimer: null,

    signalsTimer: null,

    fearGreedTimer: null,

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


    state.lastApiUpdate =
        new Date();


    setText(
        elements.apiSync,
        formatTime(
            state.lastApiUpdate
        )
    );


    updateDashboard();


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
        CONFIG.API_BASE +
        "/simple/price" +
        "?ids=" +
        CONFIG.COIN_ID +
        "&vs_currencies=usd,php" +
        "&include_market_cap=true";


    try {

        const data =
            await fetchJSON(
                url
            );


        const btc =
            data &&
            data.bitcoin;


        if (
            !btc
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

        if (
            typeof btc.php === "number" &&
            typeof btc.usd === "number" &&
            btc.usd > 0
        ) {

            state.usdPhpRate =
                btc.php / btc.usd;


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
                        btc.php
                    );

            }

        }


        if (
            typeof btc.usd_market_cap ===
            "number"
        ) {

            state.marketCap =
                Number(
                    btc.usd_market_cap
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

    const premiumUrl =
        CONFIG.FUTURES_API_BASE +
        "/premiumIndex?symbol=" +
        CONFIG.FUTURES_SYMBOL;


    const openInterestUrl =
        CONFIG.FUTURES_API_BASE +
        "/openInterest?symbol=" +
        CONFIG.FUTURES_SYMBOL;


    try {

        const [
            premium,
            openInterest
        ] =
            await Promise.all(
                [
                    fetchJSON(
                        premiumUrl
                    ),

                    fetchJSON(
                        openInterestUrl
                    )
                ]
            );


        if (
            premium &&
            typeof premium.lastFundingRate ===
                "string"
        ) {

            state.fundingRate =
                Number(
                    premium.lastFundingRate
                );


            state.nextFundingTime =
                Number(
                    premium.nextFundingTime
                );

        }


        if (
            openInterest &&
            typeof openInterest.openInterest ===
                "string"
        ) {

            state.openInterestBtc =
                Number(
                    openInterest.openInterest
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
                CONFIG.FEAR_GREED_API
            );


        const entry =
            data &&
            Array.isArray(data.data) &&
            data.data[0];


        if (
            entry
        ) {

            state.fearGreedValue =
                Number(
                    entry.value
                );


            state.fearGreedLabel =
                entry.value_classification ||
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

                            }

                        ]

                    },


                    options: {

                        responsive:
                            true,

                        maintainAspectRatio:
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
                        crosshairPlugin
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
   APPLY SERIES TO CHART
========================================================= */

function applyChartSeries(
    points,
    range,
    formatLabel
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


    state.chart.data.datasets[0].data =
        series.prices;


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
        formatShortTime
    );


    updatePeriodSummary(
        points
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


    const url =
        CONFIG.API_BASE +
        "/coins/" +
        CONFIG.COIN_ID +
        "/market_chart" +
        "?vs_currency=usd" +
        "&days=" +
        days;


    try {

        const data =
            await fetchJSON(
                url
            );


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
                "Unable to load historical data.";

            elements.chartLoading.style.display =
                "flex";

        }


        setText(
            elements.chartStatus,
            "Historical data unavailable"
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
