import os

from alpaca.data.enums import MarketType, MostActivesBy
from alpaca.data.historical.screener import ScreenerClient
from alpaca.data.requests import MarketMoversRequest, MostActivesRequest
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import AssetClass
from alpaca.trading.requests import GetAssetsRequest
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

PUBLIC_KEY = os.getenv("PUBLIC_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")
DB_CONN_STRING = os.getenv("CONN_STRING")
trading_client = TradingClient(PUBLIC_KEY, SECRET_KEY)
screener_client = ScreenerClient(PUBLIC_KEY, SECRET_KEY)

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
    req = MarketMoversRequest(top=6, market_type=MarketType.CRYPTO)
    movers = screener_client.get_market_movers(req)
    return {"crypto_market_movers": _serialize_response(movers)}
