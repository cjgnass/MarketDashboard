import os
from datetime import datetime, timedelta, timezone

from alpaca.data.enums import DataFeed, MarketType, MostActivesBy
from alpaca.data.historical.screener import ScreenerClient
from alpaca.data.historical.stock import StockHistoricalDataClient
from alpaca.data.live.stock import StockDataStream
from alpaca.data.models.bars import Bar
from alpaca.data.requests import (
    MarketMoversRequest,
    MostActivesRequest,
    StockBarsRequest,
)
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import AssetClass
from alpaca.trading.requests import GetAssetsRequest
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()


async def handle_bar_data(data):
    print(data)


PUBLIC_KEY = os.getenv("PUBLIC_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")
DB_CONN_STRING = os.getenv("CONN_STRING")
trading_client = TradingClient(PUBLIC_KEY, SECRET_KEY)
screener_client = ScreenerClient(PUBLIC_KEY, SECRET_KEY)
historical_stock_client = StockHistoricalDataClient(PUBLIC_KEY, SECRET_KEY)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "hello world"}


@app.get("/get-crypto-list")
def get_crypto_list():
    req = GetAssetsRequest(asset_class=AssetClass.CRYPTO)
    assets = trading_client.get_all_assets(req)
    crypto_list = [a.symbol for a in assets]
    return {"crypto_list": crypto_list}


@app.get("/get-stock-list")
def get_stock_list():
    req = GetAssetsRequest(asset_class=AssetClass.US_EQUITY)
    assets = trading_client.get_all_assets(req)
    stock_list = [a.symbol for a in assets]
    return {"stock_list": stock_list}


def _serialize_response(payload):
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    if hasattr(payload, "dict"):
        return payload.dict()
    return payload


def _limit_mover_payload(payload, limit: int):
    if not isinstance(payload, dict):
        return payload
    trimmed = dict(payload)
    for side in ("gainers", "losers"):
        if side not in trimmed:
            continue
        value = trimmed[side]
        if isinstance(value, list):
            trimmed[side] = value[:limit]
            continue
        if isinstance(value, dict):
            nested = dict(value)
            for key in ("items", "data", "list"):
                if isinstance(nested.get(key), list):
                    nested[key] = nested[key][:limit]
                    trimmed[side] = nested
                    break
    return trimmed


def _parse_iso(value: str | None):
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value.replace("Z", "+00:00")
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _resolve_timeframe(value: str | None):
    if not value:
        return TimeFrame.Minute
    normalized = value.strip()
    if normalized == "1Min":
        return TimeFrame.Minute
    if normalized == "5Min":
        return TimeFrame(5, TimeFrameUnit.Minute)
    if normalized == "15Min":
        return TimeFrame(15, TimeFrameUnit.Minute)
    if normalized == "1Hour":
        return TimeFrame.Hour
    if normalized == "1Day":
        return TimeFrame.Day
    return TimeFrame.Minute


@app.get("/get-most-active-stocks")
def get_most_active_stocks():
    req = MostActivesRequest(by=MostActivesBy.VOLUME, top=5)
    most_actives = screener_client.get_most_actives(req)
    return {"most_active_stocks": _serialize_response(most_actives)}


@app.get("/get-stock-market-movers")
def get_stock_market_movers():
    req = MarketMoversRequest(top=6, market_type=MarketType.STOCKS)
    movers = screener_client.get_market_movers(req)
    return {"stock_market_movers": _serialize_response(movers)}


@app.get("/get-crypto-market-movers")
def get_crypto_stock_market_movers():
    req = MarketMoversRequest(top=20, market_type=MarketType.CRYPTO)
    movers = screener_client.get_market_movers(req)
    trimmed = _limit_mover_payload(_serialize_response(movers), 6)
    return {"crypto_market_movers": trimmed}


@app.get("/get-stock-bars")
def get_stock_bars(
    symbol: str,
    start: str | None = None,
    end: str | None = None,
    timeframe: str | None = "1Min",
    limit: int | None = None,
):
    start_dt = _parse_iso(start)
    end_dt = _parse_iso(end)
    if end_dt is None:
        end_dt = datetime.now(timezone.utc)
    if start_dt is None:
        start_dt = end_dt - timedelta(hours=2)
    req = StockBarsRequest(
        symbol_or_symbols=[symbol],
        timeframe=_resolve_timeframe(timeframe),
        start=start_dt,
        end=end_dt,
        limit=limit,
        feed=DataFeed.IEX,
    )
    bars = _serialize_response(historical_stock_client.get_stock_bars(req))
    if isinstance(bars, dict) and "bars" in bars:
        return {"symbol": symbol, "bars": bars["bars"]}
    return {"symbol": symbol, "bars": bars}


@app.get("/get-live-bars")
def get_live_bars():
    stock_stream = StockDataStream(PUBLIC_KEY, SECRET_KEY)
    stock_stream.subscribe_bars(handle_bar_data, '["AAPL", "MSFT"]')
    stock_stream.run()
