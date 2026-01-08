import { useEffect, useMemo, useState } from "react";
import "./App.css";

const URL = "http://localhost";
const PORT = "8000";

type AssetItem = Record<string, unknown>;
type BarItem = Record<string, unknown>;

const BAR_TIME_KEYS = [
    "t",
    "timestamp",
    "time",
    "start",
    "date",
    "datetime",
];

const getFirstValue = (item: AssetItem, keys: string[]) => {
    for (const key of keys) {
        if (item && item[key] !== undefined && item[key] !== null) {
            return item[key];
        }
    }
    return undefined;
};

const toNumber = (value: unknown) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number")
        return Number.isNaN(value) ? undefined : value;
    if (typeof value === "string") {
        const parsed = Number(value.replace(/,/g, ""));
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
};

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value >= 100 ? 2 : 4,
    }).format(value);

const formatCompact = (value: number) =>
    new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
    }).format(value);

const formatPercent = (value: number) =>
    new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
    }).format(value);

const normalizeList = (payload: unknown) => {
    if (Array.isArray(payload)) return payload as AssetItem[];
    if (payload && typeof payload === "object") {
        const knownKeys = [
            "most_actives",
            "most_active_stocks",
            "items",
            "data",
            "list",
        ];
        for (const key of knownKeys) {
            const value = (payload as Record<string, unknown>)[key];
            if (Array.isArray(value)) return value as AssetItem[];
        }
    }
    return [];
};

const normalizeMovers = (payload: unknown) => {
    if (Array.isArray(payload)) {
        return { mode: "list" as const, items: payload as AssetItem[] };
    }
    if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        const gainers = normalizeList(record.gainers);
        const losers = normalizeList(record.losers);
        if (gainers.length || losers.length) {
            return { mode: "split" as const, gainers, losers };
        }
        const items = normalizeList(payload);
        return { mode: "list" as const, items };
    }
    return { mode: "list" as const, items: [] };
};

const buildMetrics = (item: AssetItem) => {
    const price =
        toNumber(
            getFirstValue(item, [
                "price",
                "last_price",
                "current_price",
                "close",
                "last",
            ]),
        ) ?? undefined;
    const volume =
        toNumber(
            getFirstValue(item, ["volume", "trade_volume", "day_volume"]),
        ) ?? undefined;
    const trades =
        toNumber(getFirstValue(item, ["trade_count", "trades", "count"])) ??
        undefined;
    const marketCap =
        toNumber(getFirstValue(item, ["market_cap", "marketcap"])) ?? undefined;
    const percentRaw = toNumber(
        getFirstValue(item, [
            "percent_change",
            "change_percent",
            "pct_change",
            "change_pct",
            "pct_change_1d",
        ]),
    );
    const percentChange =
        percentRaw !== undefined
            ? Math.abs(percentRaw) > 1.5
                ? percentRaw / 100
                : percentRaw
            : undefined;
    const absoluteChange = toNumber(
        getFirstValue(item, ["change", "price_change", "net_change"]),
    );

    const metrics = [
        price !== undefined && {
            label: "Price",
            value: formatCurrency(price),
        },
        percentChange !== undefined && {
            label: "Change",
            value: formatPercent(percentChange),
            tone: percentChange >= 0 ? "positive" : "negative",
        },
        percentChange === undefined &&
            absoluteChange !== undefined && {
                label: "Change",
                value: formatCurrency(absoluteChange),
                tone: absoluteChange >= 0 ? "positive" : "negative",
            },
        volume !== undefined && {
            label: "Volume",
            value: formatCompact(volume),
        },
        trades !== undefined && {
            label: "Trades",
            value: formatCompact(trades),
        },
        marketCap !== undefined && {
            label: "Mkt Cap",
            value: formatCompact(marketCap),
        },
    ].filter(Boolean) as Array<{ label: string; value: string; tone?: string }>;

    return metrics.slice(0, 3);
};

const getSymbol = (item: AssetItem) =>
    String(
        getFirstValue(item, ["symbol", "ticker", "asset", "id", "name"]) ??
            "--",
    );

const getName = (item: AssetItem) =>
    getFirstValue(item, ["name", "company_name", "display_name", "asset_name"]);

const formatLocalInput = (date: Date) => {
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    const local = new Date(date.getTime() - offsetMs);
    return local.toISOString().slice(0, 16);
};

const normalizeBars = (payload: unknown, symbol: string) => {
    if (Array.isArray(payload)) return payload as BarItem[];
    if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        const bars = record.bars;
        if (Array.isArray(bars)) return bars as BarItem[];
        if (bars && typeof bars === "object") {
            const bySymbol = (bars as Record<string, unknown>)[symbol];
            if (Array.isArray(bySymbol)) return bySymbol as BarItem[];
        }
        const direct = record[symbol];
        if (Array.isArray(direct)) return direct as BarItem[];
    }
    return [];
    // return payload.bars.data.AAPL;
};

const getBarValue = (bar: BarItem, keys: string[]) =>
    toNumber(getFirstValue(bar, keys));

const parseTimestamp = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        const ms = value > 1e12 ? value : value * 1000;
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const numeric = Number(trimmed);
            if (!Number.isFinite(numeric)) return null;
            const ms = numeric > 1e12 ? numeric : numeric * 1000;
            const date = new Date(ms);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        const parsed = Date.parse(trimmed);
        if (!Number.isFinite(parsed)) return null;
        const date = new Date(parsed);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
};

const formatAxisTime = (
    date: Date,
    options: { showDate: boolean; showTime: boolean },
) => {
    const parts: string[] = [];
    if (options.showDate) {
        parts.push(
            new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
            }).format(date),
        );
    }
    if (options.showTime) {
        parts.push(
            new Intl.DateTimeFormat("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }).format(date),
        );
    }
    return parts.join(" ");
};

const getBarTimestamp = (bar: BarItem) => getFirstValue(bar, BAR_TIME_KEYS);

const getBarTime = (bar: BarItem) => String(getBarTimestamp(bar) ?? "--");

const getBarDate = (bar: BarItem) => parseTimestamp(getBarTimestamp(bar));

const TIMEFRAME_LABELS: Record<string, string> = {
    "1Min": "1 Min",
    "5Min": "5 Min",
    "15Min": "15 Min",
    "1Hour": "1 Hour",
    "1Day": "1 Day",
};

const LIVE_WINDOW_OPTIONS = [
    { value: 30, label: "30 Min" },
    { value: 120, label: "2 Hours" },
    { value: 360, label: "6 Hours" },
    { value: 1440, label: "1 Day" },
];

const RANGE_WINDOW_OPTIONS = [
    { value: 60, label: "1 Hour" },
    { value: 120, label: "2 Hours" },
    { value: 360, label: "6 Hours" },
    { value: 720, label: "12 Hours" },
    { value: 1440, label: "1 Day" },
    { value: 2880, label: "2 Days" },
    { value: 10080, label: "7 Days" },
];

const sanitizeSymbol = (value: string) => value.trim().toUpperCase();

function App() {
    const [mostActiveStocks, setMostActiveStocks] = useState<unknown>([]);
    const [stockMarketMovers, setStockMarketMovers] = useState<unknown>([]);
    const [cryptoMarketMovers, setCryptoMarketMovers] = useState<unknown>([]);
    const [stockList, setStockList] = useState<string[]>([]);
    const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
    const [symbolQuery, setSymbolQuery] = useState("AAPL");
    const [barMode, setBarMode] = useState<"live" | "range">("live");
    const [timeframe, setTimeframe] = useState("1Min");
    const [liveWindowMinutes, setLiveWindowMinutes] = useState(120);
    const [rangeWindowMinutes, setRangeWindowMinutes] = useState(120);
    const [rangeStart, setRangeStart] = useState(() => {
        const end = new Date();
        const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);
        return formatLocalInput(start);
    });
    const [barPayload, setBarPayload] = useState<unknown>([]);
    const [barStatus, setBarStatus] = useState<"idle" | "loading" | "error">(
        "idle",
    );

    useEffect(() => {
        async function load() {
            try {
                const [activeRes, stockMoverRes, cryptoMoverRes, stockListRes] =
                    await Promise.all([
                        fetch(`${URL}:${PORT}/get-most-active-stocks`),
                        fetch(`${URL}:${PORT}/get-stock-market-movers`),
                        fetch(`${URL}:${PORT}/get-crypto-market-movers`),
                        fetch(`${URL}:${PORT}/get-stock-list`),
                    ]);
                if (
                    !activeRes.ok ||
                    !stockMoverRes.ok ||
                    !cryptoMoverRes.ok ||
                    !stockListRes.ok
                ) {
                    throw new Error(`One or more request failed`);
                }
                const [
                    activeData,
                    stockMoverData,
                    cryptoMoverData,
                    stockListData,
                ] = await Promise.all([
                    activeRes.json(),
                    stockMoverRes.json(),
                    cryptoMoverRes.json(),
                    stockListRes.json(),
                ]);
                setMostActiveStocks(activeData.most_active_stocks);
                setStockMarketMovers(stockMoverData.stock_market_movers);
                setCryptoMarketMovers(cryptoMoverData.crypto_market_movers);
                setStockList(
                    Array.isArray(stockListData.stock_list)
                        ? stockListData.stock_list
                        : [],
                );
            } catch (err) {
                console.log(err);
            }
        }
        load();
    }, []);

    useEffect(() => {
        if (barMode === "range" && !rangeStart) {
            return undefined;
        }
        let active = true;
        const loadBars = async () => {
            setBarStatus("loading");
            try {
                const params = new URLSearchParams({ symbol: selectedSymbol });
                if (timeframe) params.set("timeframe", timeframe);
                if (barMode === "live") {
                    const end = new Date();
                    const start = new Date(
                        end.getTime() - liveWindowMinutes * 60 * 1000,
                    );
                    params.set("start", start.toISOString());
                    params.set("end", end.toISOString());
                } else {
                    const start = new Date(rangeStart);
                    if (Number.isNaN(start.getTime())) return;
                    const end = new Date(
                        start.getTime() + rangeWindowMinutes * 60 * 1000,
                    );
                    params.set("start", start.toISOString());
                    params.set("end", end.toISOString());
                }
                const res = await fetch(
                    `${URL}:${PORT}/get-stock-bars?${params.toString()}`,
                );
                if (!res.ok) throw new Error("Failed to load bars");
                const data = await res.json();
                if (!active) return;
                setBarPayload(data);
                setBarStatus("idle");
            } catch (err) {
                console.log(err);
                if (active) setBarStatus("error");
            }
        };
        loadBars();
        const interval =
            barMode === "live" ? setInterval(loadBars, 15000) : null;
        return () => {
            active = false;
            if (interval) clearInterval(interval);
        };
    }, [
        selectedSymbol,
        timeframe,
        rangeStart,
        barMode,
        liveWindowMinutes,
        rangeWindowMinutes,
    ]);

    useEffect(() => {
        setSymbolQuery(selectedSymbol);
    }, [selectedSymbol]);

    const mostActiveItems = useMemo(
        () => normalizeList(mostActiveStocks),
        [mostActiveStocks],
    );
    const stockMovers = useMemo(
        () => normalizeMovers(stockMarketMovers),
        [stockMarketMovers],
    );
    const cryptoMovers = useMemo(() => {
        return normalizeMovers(cryptoMarketMovers);
    }, [cryptoMarketMovers]);
    const symbolLookup = useMemo(() => new Set(stockList), [stockList]);
    const barItems = useMemo(
        () => normalizeBars(barPayload, selectedSymbol),
        [barPayload, selectedSymbol],
    );
    const displayBars = useMemo(() => {
        if (barMode === "live") return barItems.slice(-60);
        return barItems;
    }, [barItems, barMode]);
    const symbolSuggestions = useMemo(() => {
        if (!stockList.length) return [];
        const query = symbolQuery.trim().toUpperCase();
        if (!query) return stockList.slice(0, 60);
        return stockList
            .filter((symbol) => symbol.startsWith(query))
            .slice(0, 60);
    }, [stockList, symbolQuery]);
    const barStats = useMemo(() => {
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const bar of displayBars) {
            const low = getBarValue(bar, ["l", "low", "low_price"]);
            const high = getBarValue(bar, ["h", "high", "high_price"]);
            if (low !== undefined) min = Math.min(min, low);
            if (high !== undefined) max = Math.max(max, high);
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return { min: 0, max: 1 };
        }
        return { min, max };
    }, [displayBars]);
    const candleChart = useMemo(() => {
        const svgWidth = 1000;
        const svgHeight = 260;
        const chartLeft = 96;
        const chartRight = svgWidth - 28;
        const chartTop = 34;
        const chartBottom = svgHeight - 48;
        const height = chartBottom - chartTop;
        const range = Math.max(barStats.max - barStats.min, 0.0001);
        const yFor = (value: number) =>
            chartTop + ((barStats.max - value) / range) * height;

        const barCount = Math.max(displayBars.length, 1);
        const chartWidth = chartRight - chartLeft;
        const xStep = chartWidth / barCount;
        const xForIndex = (index: number) =>
            chartLeft + xStep / 2 + index * xStep;
        const candleWidth = Math.max(4, xStep * 0.6);

        const yTickCount = 5;
        const yTicks =
            yTickCount >= 2
                ? Array.from({ length: yTickCount }, (_, i) => {
                      const value =
                          barStats.max - (range * i) / (yTickCount - 1);
                      return { value, y: yFor(value) };
                  })
                : [{ value: barStats.max, y: yFor(barStats.max) }];

        const buildEvenIndices = (length: number, desired: number) => {
            if (length <= 0) return [];
            if (desired <= 1) return [0];
            if (length <= desired) {
                return Array.from({ length }, (_, i) => i);
            }
            const indices = new Set<number>();
            for (let i = 0; i < desired; i += 1) {
                indices.add(Math.round((i * (length - 1)) / (desired - 1)));
            }
            const sorted = Array.from(indices).sort((a, b) => a - b);
            if (sorted[0] !== 0) sorted.unshift(0);
            if (sorted[sorted.length - 1] !== length - 1)
                sorted.push(length - 1);
            return sorted;
        };

        let firstDate: Date | null = null;
        let lastDate: Date | null = null;
        for (const bar of displayBars) {
            const parsed = getBarDate(bar);
            if (parsed) {
                if (!firstDate) firstDate = parsed;
                lastDate = parsed;
            }
        }
        const crossesDay =
            firstDate &&
            lastDate &&
            firstDate.toDateString() !== lastDate.toDateString();
        const showDate = timeframe === "1Day" || Boolean(crossesDay);
        const showTime = timeframe !== "1Day";

        const xTickCount = Math.min(6, displayBars.length);
        const xTicks = buildEvenIndices(displayBars.length, xTickCount).map(
            (index) => {
                const bar = displayBars[index];
                const parsed = bar ? getBarDate(bar) : null;
                const label = parsed
                    ? formatAxisTime(parsed, { showDate, showTime })
                    : getBarTime(bar ?? {}).slice(0, 16);
                return { index, x: xForIndex(index), label };
            },
        );

        return {
            chartLeft,
            chartRight,
            chartTop,
            chartBottom,
            yFor,
            xForIndex,
            candleWidth,
            yTicks,
            xTicks,
        };
    }, [barStats.max, barStats.min, displayBars, timeframe]);
    const latestBar = displayBars[displayBars.length - 1];
    const timeframeLabel = TIMEFRAME_LABELS[timeframe] ?? timeframe;
    const liveWindowLabel =
        LIVE_WINDOW_OPTIONS.find((option) => option.value === liveWindowMinutes)
            ?.label ?? `${liveWindowMinutes} Min`;
    const rangeWindowLabel =
        RANGE_WINDOW_OPTIONS.find(
            (option) => option.value === rangeWindowMinutes,
        )?.label ?? `${rangeWindowMinutes} Min`;
    const statusLabel =
        barStatus === "loading"
            ? "Updating..."
            : barStatus === "error"
              ? "Feed error"
              : barMode === "live"
                ? "Live (IEX delayed)"
                : "Historical snapshot";
    const rangeEndLabel = useMemo(() => {
        const start = new Date(rangeStart);
        if (!rangeStart || Number.isNaN(start.getTime())) return "";
        const end = new Date(start.getTime() + rangeWindowMinutes * 60 * 1000);
        return formatLocalInput(end);
    }, [rangeStart, rangeWindowMinutes]);
    const rangeLabel =
        barMode === "live"
            ? `Rolling ${liveWindowLabel}`
            : `${rangeStart || "--"} to ${rangeEndLabel || "--"} · ${rangeWindowLabel}`;
    return (
        <div className="page">
            <header className="hero">
                <div>
                    <p className="eyebrow">Live Market Pulse</p>
                    <h1>Market Dashboard</h1>
                    <p className="lead">
                        Quick snapshots of the most active equities and the
                        biggest movers across stocks and crypto.
                    </p>
                </div>
            </header>

            <main className="content">
                <section className="section">
                    <div className="section-header">
                        <div>
                            <h2>Live Candle Bars</h2>
                            <p className="section-subtitle">
                                Switch between a rolling IEX stream and
                                historical bars by date range.
                            </p>
                        </div>
                    </div>
                    <div className="candle-panel">
                        <div className="control-row">
                            <div className="control-field">
                                <span>Mode</span>
                                <div className="mode-toggle">
                                    <button
                                        type="button"
                                        className={
                                            barMode === "live"
                                                ? "mode-button active"
                                                : "mode-button"
                                        }
                                        onClick={() => setBarMode("live")}
                                    >
                                        Live
                                    </button>
                                    <button
                                        type="button"
                                        className={
                                            barMode === "range"
                                                ? "mode-button active"
                                                : "mode-button"
                                        }
                                        onClick={() => setBarMode("range")}
                                    >
                                        Historical
                                    </button>
                                </div>
                            </div>
                            <div className="control-field">
                                <span>Symbol</span>
                                <form
                                    className="symbol-search"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        const nextSymbol =
                                            sanitizeSymbol(symbolQuery);
                                        if (nextSymbol) {
                                            setSelectedSymbol(nextSymbol);
                                        }
                                    }}
                                >
                                    <input
                                        type="text"
                                        list="symbol-options"
                                        value={symbolQuery}
                                        onChange={(event) => {
                                            const nextValue =
                                                event.target.value.toUpperCase();
                                            setSymbolQuery(nextValue);
                                            const nextSymbol =
                                                sanitizeSymbol(nextValue);
                                            if (
                                                nextSymbol &&
                                                symbolLookup.has(nextSymbol)
                                            ) {
                                                setSelectedSymbol(nextSymbol);
                                            }
                                        }}
                                        placeholder="Search symbol"
                                    />
                                    <button type="submit">Use</button>
                                </form>
                            </div>
                            <label className="control-field">
                                <span>Timeframe</span>
                                <select
                                    value={timeframe}
                                    onChange={(event) =>
                                        setTimeframe(event.target.value)
                                    }
                                >
                                    <option value="1Min">1 Min</option>
                                    <option value="5Min">5 Min</option>
                                    <option value="15Min">15 Min</option>
                                    <option value="1Hour">1 Hour</option>
                                    <option value="1Day">1 Day</option>
                                </select>
                            </label>
                            {barMode === "live" ? (
                                <label className="control-field">
                                    <span>Live Window</span>
                                    <select
                                        value={liveWindowMinutes}
                                        onChange={(event) =>
                                            setLiveWindowMinutes(
                                                Number(event.target.value),
                                            )
                                        }
                                    >
                                        {LIVE_WINDOW_OPTIONS.map((option) => (
                                            <option
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : (
                                <>
                                    <label className="control-field">
                                        <span>Start</span>
                                        <input
                                            type="datetime-local"
                                            value={rangeStart}
                                            onChange={(event) =>
                                                setRangeStart(
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label className="control-field">
                                        <span>Window</span>
                                        <select
                                            value={rangeWindowMinutes}
                                            onChange={(event) =>
                                                setRangeWindowMinutes(
                                                    Number(event.target.value),
                                                )
                                            }
                                        >
                                            {RANGE_WINDOW_OPTIONS.map(
                                                (option) => (
                                                    <option
                                                        key={option.value}
                                                        value={option.value}
                                                    >
                                                        {option.label}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </label>
                                </>
                            )}
                        </div>
                        <datalist id="symbol-options">
                            {symbolSuggestions.map((symbol) => (
                                <option key={symbol} value={symbol} />
                            ))}
                        </datalist>
                        <p className="feed-note">
                            IEX free tier data is delayed and limited. Live mode
                            polls recent IEX bars; historical mode uses your
                            selected range.
                        </p>
                        <div className="candle-summary">
                            <div>
                                <p className="symbol">{selectedSymbol}</p>
                                <p className="name">
                                    {displayBars.length
                                        ? `${displayBars.length} bars · ${timeframeLabel}`
                                        : "No bars yet"}
                                </p>
                            </div>
                            <div className="summary-meta">
                                <span>{statusLabel}</span>
                                <span>{rangeLabel}</span>
                                <span>
                                    {latestBar ? getBarTime(latestBar) : "--"}
                                </span>
                            </div>
                        </div>
                        <div className="candle-chart">
                            <svg viewBox="0 0 1000 260" role="img">
                                <rect
                                    x="0"
                                    y="0"
                                    width="1000"
                                    height="260"
                                    rx="18"
                                />
                                <g className="axis">
                                    <line
                                        className="axis-line"
                                        x1={candleChart.chartLeft}
                                        x2={candleChart.chartLeft}
                                        y1={candleChart.chartTop}
                                        y2={candleChart.chartBottom}
                                    />
                                    <line
                                        className="axis-line"
                                        x1={candleChart.chartLeft}
                                        x2={candleChart.chartRight}
                                        y1={candleChart.chartBottom}
                                        y2={candleChart.chartBottom}
                                    />
                                    {candleChart.yTicks.map((tick) => (
                                        <g key={`y-${tick.value}`}>
                                            <line
                                                className="axis-grid"
                                                x1={candleChart.chartLeft}
                                                x2={candleChart.chartRight}
                                                y1={tick.y}
                                                y2={tick.y}
                                            />
                                            <line
                                                className="axis-tick"
                                                x1={candleChart.chartLeft - 6}
                                                x2={candleChart.chartLeft}
                                                y1={tick.y}
                                                y2={tick.y}
                                            />
                                            <text
                                                className="axis-label"
                                                x={candleChart.chartLeft - 10}
                                                y={tick.y + 4}
                                                textAnchor="end"
                                            >
                                                {formatCurrency(tick.value)}
                                            </text>
                                        </g>
                                    ))}
                                    {candleChart.xTicks.map((tick) => (
                                        <g key={`x-${tick.index}`}>
                                            <line
                                                className="axis-tick"
                                                x1={tick.x}
                                                x2={tick.x}
                                                y1={candleChart.chartBottom}
                                                y2={
                                                    candleChart.chartBottom + 6
                                                }
                                            />
                                            <text
                                                className="axis-label"
                                                x={tick.x}
                                                y={candleChart.chartBottom + 28}
                                                textAnchor="middle"
                                            >
                                                {tick.label}
                                            </text>
                                        </g>
                                    ))}
                                </g>
                                {displayBars.map((bar, index) => {
                                    const open = getBarValue(bar, [
                                        "o",
                                        "open",
                                        "open_price",
                                    ]);
                                    const close = getBarValue(bar, [
                                        "c",
                                        "close",
                                        "close_price",
                                    ]);
                                    const high = getBarValue(bar, [
                                        "h",
                                        "high",
                                        "high_price",
                                    ]);
                                    const low = getBarValue(bar, [
                                        "l",
                                        "low",
                                        "low_price",
                                    ]);
                                    if (
                                        open === undefined ||
                                        close === undefined ||
                                        high === undefined ||
                                        low === undefined
                                    ) {
                                        return null;
                                    }
                                    const yFor = candleChart.yFor;
                                    const x = candleChart.xForIndex(index);
                                    const candleWidth = candleChart.candleWidth;
                                    const bodyTop = Math.min(
                                        yFor(open),
                                        yFor(close),
                                    );
                                    const bodyBottom = Math.max(
                                        yFor(open),
                                        yFor(close),
                                    );
                                    const color =
                                        close >= open
                                            ? "var(--candle-up)"
                                            : "var(--candle-down)";
                                    return (
                                        <g key={`${index}-${open}`}>
                                            <line
                                                x1={x}
                                                x2={x}
                                                y1={yFor(high)}
                                                y2={yFor(low)}
                                                stroke={color}
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                            />
                                            <rect
                                                x={x - candleWidth / 2}
                                                y={bodyTop}
                                                width={candleWidth}
                                                height={Math.max(
                                                    2,
                                                    bodyBottom - bodyTop,
                                                )}
                                                fill={color}
                                                rx="2"
                                            />
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>
                </section>
                <section className="section">
                    <div className="section-header">
                        <div>
                            <h2>Most Active Stocks</h2>
                            <p className="section-subtitle">
                                Heavily traded equities leading the tape.
                            </p>
                        </div>
                    </div>
                    <div className="card-grid">
                        {mostActiveItems.map((item, index) => {
                            const metrics = buildMetrics(item);
                            const name = getName(item);
                            return (
                                <article
                                    className="card"
                                    key={`${getSymbol(item)}-${index}`}
                                >
                                    <div className="card-header">
                                        <div>
                                            <p className="symbol">
                                                {getSymbol(item)}
                                            </p>
                                            {name ? (
                                                <p className="name">
                                                    {String(name)}
                                                </p>
                                            ) : null}
                                        </div>
                                        <span className="chip">Active</span>
                                    </div>
                                    <div className="metrics">
                                        {metrics.map((metric) => (
                                            <div
                                                className="metric"
                                                key={metric.label}
                                            >
                                                <span className="metric-label">
                                                    {metric.label}
                                                </span>
                                                <span
                                                    className={`metric-value${metric.tone ? ` ${metric.tone}` : ""}`}
                                                >
                                                    {metric.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section className="section">
                    <div className="section-header">
                        <div>
                            <h2>Stock Market Movers</h2>
                            <p className="section-subtitle">
                                Biggest gainers and losers in equities right
                                now.
                            </p>
                        </div>
                    </div>
                    {stockMovers.mode === "split" ? (
                        <div className="split-grid">
                            <div>
                                <h3 className="split-title">Top Gainers</h3>
                                <div className="card-grid">
                                    {stockMovers.gainers.map((item, index) => {
                                        const metrics = buildMetrics(item);
                                        const name = getName(item);
                                        return (
                                            <article
                                                className="card"
                                                key={`stock-gainer-${getSymbol(item)}-${index}`}
                                            >
                                                <div className="card-header">
                                                    <div>
                                                        <p className="symbol">
                                                            {getSymbol(item)}
                                                        </p>
                                                        {name ? (
                                                            <p className="name">
                                                                {String(name)}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <span className="chip positive">
                                                        Gainer
                                                    </span>
                                                </div>
                                                <div className="metrics">
                                                    {metrics.map((metric) => (
                                                        <div
                                                            className="metric"
                                                            key={metric.label}
                                                        >
                                                            <span className="metric-label">
                                                                {metric.label}
                                                            </span>
                                                            <span
                                                                className={`metric-value${metric.tone ? ` ${metric.tone}` : ""}`}
                                                            >
                                                                {metric.value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <h3 className="split-title">Top Losers</h3>
                                <div className="card-grid">
                                    {stockMovers.losers.map((item, index) => {
                                        const metrics = buildMetrics(item);
                                        const name = getName(item);
                                        return (
                                            <article
                                                className="card"
                                                key={`stock-loser-${getSymbol(item)}-${index}`}
                                            >
                                                <div className="card-header">
                                                    <div>
                                                        <p className="symbol">
                                                            {getSymbol(item)}
                                                        </p>
                                                        {name ? (
                                                            <p className="name">
                                                                {String(name)}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <span className="chip negative">
                                                        Loser
                                                    </span>
                                                </div>
                                                <div className="metrics">
                                                    {metrics.map((metric) => (
                                                        <div
                                                            className="metric"
                                                            key={metric.label}
                                                        >
                                                            <span className="metric-label">
                                                                {metric.label}
                                                            </span>
                                                            <span
                                                                className={`metric-value${metric.tone ? ` ${metric.tone}` : ""}`}
                                                            >
                                                                {metric.value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card-grid">
                            {stockMovers.items.map((item, index) => {
                                const metrics = buildMetrics(item);
                                const name = getName(item);
                                return (
                                    <article
                                        className="card"
                                        key={`stock-mover-${getSymbol(item)}-${index}`}
                                    >
                                        <div className="card-header">
                                            <div>
                                                <p className="symbol">
                                                    {getSymbol(item)}
                                                </p>
                                                {name ? (
                                                    <p className="name">
                                                        {String(name)}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <span className="chip">Mover</span>
                                        </div>
                                        <div className="metrics">
                                            {metrics.map((metric) => (
                                                <div
                                                    className="metric"
                                                    key={metric.label}
                                                >
                                                    <span className="metric-label">
                                                        {metric.label}
                                                    </span>
                                                    <span
                                                        className={`metric-value${metric.tone ? ` ${metric.tone}` : ""}`}
                                                    >
                                                        {metric.value}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="section">
                    <div className="section-header">
                        <div>
                            <h2>Crypto Market Movers</h2>
                            <p className="section-subtitle">
                                The biggest swings across major crypto pairs.
                            </p>
                        </div>
                    </div>
                    {cryptoMovers.mode === "split" ? (
                        <div className="split-grid">
                            <div>
                                <h3 className="split-title">Top Gainers</h3>
                                <div className="card-grid">
                                    {cryptoMovers.gainers.map((item, index) => {
                                        const metrics = buildMetrics(item);
                                        const name = getName(item);
                                        return (
                                            <article
                                                className="card"
                                                key={`crypto-gainer-${getSymbol(item)}-${index}`}
                                            >
                                                <div className="card-header">
                                                    <div>
                                                        <p className="symbol">
                                                            {getSymbol(item)}
                                                        </p>
                                                        {name ? (
                                                            <p className="name">
                                                                {String(name)}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <span className="chip positive">
                                                        Gainer
                                                    </span>
                                                </div>
                                                <div className="metrics">
                                                    {metrics.map((metric) => (
                                                        <div
                                                            className="metric"
                                                            key={metric.label}
                                                        >
                                                            <span className="metric-label">
                                                                {metric.label}
                                                            </span>
                                                            <span
                                                                className={`metric-value${metric.tone ? ` ${metric.tone}` : ""}`}
                                                            >
                                                                {metric.value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <h3 className="split-title">Top Losers</h3>
                                <div className="card-grid">
                                    {cryptoMovers.losers.map((item, index) => {
                                        const metrics = buildMetrics(item);
                                        const name = getName(item);
                                        return (
                                            <article
                                                className="card"
                                                key={`crypto-loser-${getSymbol(item)}-${index}`}
                                            >
                                                <div className="card-header">
                                                    <div>
                                                        <p className="symbol">
                                                            {getSymbol(item)}
                                                        </p>
                                                        {name ? (
                                                            <p className="name">
                                                                {String(name)}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <span className="chip negative">
                                                        Loser
                                                    </span>
                                                </div>
                                                <div className="metrics">
                                                    {metrics.map((metric) => (
                                                        <div
                                                            className="metric"
                                                            key={metric.label}
                                                        >
                                                            <span className="metric-label">
                                                                {metric.label}
                                                            </span>
                                                            <span
                                                                className={`metric-value${metric.tone ? ` ${metric.tone}` : ""}`}
                                                            >
                                                                {metric.value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card-grid">
                            {cryptoMovers.items.map((item, index) => {
                                const metrics = buildMetrics(item);
                                const name = getName(item);
                                return (
                                    <article
                                        className="card"
                                        key={`crypto-mover-${getSymbol(item)}-${index}`}
                                    >
                                        <div className="card-header">
                                            <div>
                                                <p className="symbol">
                                                    {getSymbol(item)}
                                                </p>
                                                {name ? (
                                                    <p className="name">
                                                        {String(name)}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <span className="chip">Mover</span>
                                        </div>
                                        <div className="metrics">
                                            {metrics.map((metric) => (
                                                <div
                                                    className="metric"
                                                    key={metric.label}
                                                >
                                                    <span className="metric-label">
                                                        {metric.label}
                                                    </span>
                                                    <span
                                                        className={`metric-value${metric.tone ? ` ${metric.tone}` : ""}`}
                                                    >
                                                        {metric.value}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

export default App;
