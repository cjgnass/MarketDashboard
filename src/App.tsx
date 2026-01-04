import { useEffect, useMemo, useState } from "react";
import "./App.css";

const URL = "http://localhost";
const PORT = "8000";

type AssetItem = Record<string, unknown>;

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

function App() {
    const [mostActiveStocks, setMostActiveStocks] = useState<unknown>([]);
    const [stockMarketMovers, setStockMarketMovers] = useState<unknown>([]);
    const [cryptoMarketMovers, setCryptoMarketMovers] = useState<unknown>([]);

    useEffect(() => {
        async function load() {
            try {
                const [activeRes, stockMoverRes, cryptoMoverRes] =
                    await Promise.all([
                        fetch(`${URL}:${PORT}/get-most-active-stocks`),
                        fetch(`${URL}:${PORT}/get-stock-market-movers`),
                        fetch(`${URL}:${PORT}/get-crypto-market-movers`),
                    ]);
                if (!activeRes.ok || !stockMoverRes.ok || !cryptoMoverRes.ok) {
                    throw new Error(`One or more request failed`);
                }
                const [activeData, stockMoverData, cryptoMoverData] =
                    await Promise.all([
                        activeRes.json(),
                        stockMoverRes.json(),
                        cryptoMoverRes.json(),
                    ]);
                setMostActiveStocks(activeData.most_active_stocks);
                setStockMarketMovers(stockMoverData.stock_market_movers);
                setCryptoMarketMovers(cryptoMoverData.crypto_market_movers);
            } catch (err) {
                console.log(err);
            }
        }
        load();
    }, []);

    const mostActiveItems = useMemo(
        () => normalizeList(mostActiveStocks),
        [mostActiveStocks],
    );
    const stockMovers = useMemo(
        () => normalizeMovers(stockMarketMovers),
        [stockMarketMovers],
    );
    const cryptoMovers = useMemo(
        () => normalizeMovers(cryptoMarketMovers),
        [cryptoMarketMovers],
    );

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
