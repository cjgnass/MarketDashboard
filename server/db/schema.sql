CREATE TABLE quotes
    (
      id SERIAL PRIMARY KEY,
      symbol TEXT,
      bid_price FLOAT,
      bid_size FLOAT,
      ask_price FLOAT,
      ask_size FLOAT,
      timestamp TIMESTAMPTZ
    );

CREATE TABLE trades
    (
        id SERIAL PRIMARY KEY,
        symbol TEXT,
        price FLOAT,
        size FLOAT,
        timestamp TIMESTAMPTZ
    )
