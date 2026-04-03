'use strict';

const axios = require('axios');

// ── Market Data via Yahoo Finance (Indian stocks) ─────────────────────────────

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

/**
 * Fetch OHLCV data from Yahoo Finance
 * symbol: NSE symbol e.g. 'RELIANCE' → 'RELIANCE.NS', '^NSEI' for Nifty 50
 */
async function fetchYahoo(symbol, range = '1y', interval = '1d') {
  const yfSymbol = symbol.startsWith('^') ? symbol : `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?interval=${interval}&range=${range}`;
  try {
    const res = await axios.get(url, { headers: YF_HEADERS, timeout: 15000 });
    const result = res.data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const data = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (q.close[i] == null) continue;
      data.push({
        date:   new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open:   q.open[i],
        high:   q.high[i],
        low:    q.low[i],
        close:  q.close[i],
        volume: q.volume[i] || 0,
      });
    }
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch daily OHLCV for an NSE stock
 */
async function fetchDailyOHLCV(symbol, days = 365) {
  const range = days > 365 ? '2y' : '1y';
  return fetchYahoo(symbol, range, '1d');
}

/**
 * Fetch Nifty 50 index data
 */
async function fetchNifty50(days = 300) {
  const data = await fetchYahoo('^NSEI', '1y', '1d');
  if (!data) return null;
  return data.map(d => ({ date: d.date, close: d.close }));
}

/**
 * Fetch India VIX
 */
async function fetchVIX() {
  const data = await fetchYahoo('^INDIAVIX', '5d', '1d');
  if (!data || data.length === 0) return null;
  return parseFloat(data[data.length - 1].close.toFixed(2));
}

/**
 * Fetch Nifty 500 stock list (top liquid stocks)
 */
async function fetchNifty500List() {
  return [
    'RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','SBIN','BHARTIARTL',
    'ITC','KOTAKBANK','LT','HCLTECH','AXISBANK','MARUTI','ASIANPAINT','ULTRACEMCO',
    'BAJFINANCE','WIPRO','NESTLEIND','POWERGRID','NTPC','TECHM','TITAN','ADANIPORTS',
    'SUNPHARMA','BAJAJFINSV','ONGC','COALINDIA','INDUSINDBK','JSWSTEEL','TATASTEEL',
    'HINDALCO','BPCL','GRASIM','CIPLA','DIVISLAB','DRREDDY','EICHERMOT','HEROMOTOCO',
    'APOLLOHOSP','TATACONSUM','HDFCLIFE','SBILIFE','BRITANNIA',
    'BAJAJ-AUTO','TATAMOTORS','M%26M','VEDL','PIDILITIND','SIEMENS',
    'ABB','HAVELLS','MUTHOOTFIN','CHOLAFIN','SHREECEM','RAMCOCEM',
    'BERGEPAINT','ASTRAL','POLYCAB','LTIM','MPHASIS','PERSISTENT','COFORGE',
    'OFSS','PAGEIND','TRENT','AUROPHARMA','TORNTPHARM','LUPIN','ALKEM',
    'GLAND','ZOMATO','DMART','INDIGO','IRCTC',
    'ADANIGREEN','TATAPOWER','CESC','TORNTPOWER','NHPC',
    'BANDHANBNK','FEDERALBNK','IDFCFIRSTB','RBLBANK',
    'MCDOWELL-N','UNITDSPR','VBL','JUBLFOOD','WESTLIFE',
    'DLF','GODREJPROP','OBEROIRLTY','PRESTIGE',
    'ZEEL','SUNTV','PVRINOX',
    'SAIL','NMDC','JINDALSTEL','WELSPUN',
    'CUMMINSIND','BHEL','THERMAX','GRINDWELL',
    'LAURUSLABS','IPCA','AJANTPHARM','GRANULES',
    'TATAELXSI','KPITTECH','ZENSARTECH','RATEGAIN',
  ];
}

module.exports = { fetchDailyOHLCV, fetchNifty50, fetchVIX, fetchNifty500List };
