'use strict';

const { fetchDailyOHLCV, fetchNifty50, fetchVIX, fetchNifty500List } = require('./data');
const { calcEMAs, calcRSI, calcADX, calcAvgVolume, detectBase, calcRS } = require('./indicators');
const config = require('./config');

// ── TFBS Scanner — Full Rule Engine ──────────────────────────────────────────

/**
 * Run full market conditions check
 * Returns { pass, vix, niftyAbove50EMA, message }
 */
async function checkMarketConditions() {
  console.log('Checking market conditions...');
  const vix = await fetchVIX();
  const niftyData = await fetchNifty50(300);
  const result = { pass: false, vix, niftyAbove50EMA: false, niftyAbove200EMA: false, message: '' };

  if (!niftyData || niftyData.length < 200) {
    result.message = '⚠️ Could not fetch Nifty data';
    return result;
  }

  const closes = niftyData.map(d => d.close);
  const ema50  = closes.slice(0, 50).reduce((a,b) => a+b, 0) / 50;
  let e50 = ema50;
  const k50 = 2 / 51;
  for (let i = 50; i < closes.length; i++) { e50 = closes[i] * k50 + e50 * (1 - k50); }

  const ema200 = closes.slice(0, 200).reduce((a,b) => a+b, 0) / 200;
  let e200 = ema200;
  const k200 = 2 / 201;
  for (let i = 200; i < closes.length; i++) { e200 = closes[i] * k200 + e200 * (1 - k200); }

  const lastClose = closes[closes.length - 1];
  result.niftyAbove50EMA  = lastClose > e50;
  result.niftyAbove200EMA = lastClose > e200;
  result.nifty50EMA  = Math.round(e50);
  result.nifty200EMA = Math.round(e200);
  result.niftyClose  = Math.round(lastClose);

  // Pass conditions
  const vixOk = vix && vix < config.VIX_MAX;
  const vixWarn = vix && vix >= config.VIX_MAX && vix < config.VIX_AVOID;
  const trendOk = result.niftyAbove50EMA;

  if (!trendOk) {
    result.pass = false;
    result.mode = 'CASH';
    result.message = `🔴 CASH MODE\nNifty (${result.niftyClose}) is BELOW 50-EMA (${result.nifty50EMA})\n\nDo NOT take new trades. Protect capital.`;
  } else if (vix && vix >= config.VIX_AVOID) {
    result.pass = false;
    result.mode = 'AVOID';
    result.message = `🔴 AVOID\nIndia VIX is ${vix} (above 20). Market is fearful.\nNo new trades until VIX comes below 20.`;
  } else if (vixWarn) {
    result.pass = true;
    result.mode = 'CAUTION';
    result.message = `🟡 CAUTION MODE\nNifty above 50-EMA ✓ but VIX is ${vix} (18–20)\nReduce position size by 50%. Be selective.`;
  } else {
    result.pass = true;
    result.mode = 'ACTIVE';
    result.message = `🟢 ACTIVE\nNifty ${result.niftyClose} > 50-EMA ${result.nifty50EMA} ✓\nVIX ${vix || 'N/A'} < 18 ✓\nMarket conditions favorable for new trades.`;
  }

  return result;
}

/**
 * Scan one stock against all TFBS rules
 * Returns { pass, symbol, data, filters, tradeSetup } or null
 */
async function scanStock(symbol, niftyCloses) {
  const data = await fetchDailyOHLCV(symbol, 400);
  if (!data || data.length < 220) return null;

  const closes  = data.map(d => d.close);
  const highs   = data.map(d => d.high);
  const lows    = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  const last    = closes[closes.length - 1];
  const lastVol = volumes[volumes.length - 1];

  // ── Filters ──────────────────────────────────────────────────────────────
  const emas     = calcEMAs(closes);
  const rsi      = calcRSI(closes);
  const adx      = calcADX(highs, lows, closes);
  const avgVol   = calcAvgVolume(volumes, 20);
  const base     = detectBase(highs, lows, closes);
  const rs       = niftyCloses ? calcRS(closes, niftyCloses) : null;

  const filters = {
    // F1: Nifty 500 — assumed (from list)
    f1_universe: true,
    // F2: Min ₹100 price
    f2_price: last >= 100,
    // F3: Volume filter (min ₹10 crore daily value or 5L shares)
    f3_volume: avgVol ? (avgVol >= 500000 || avgVol * last >= 10000000) : false,
    // F4: Above 200 EMA
    f4_above200EMA: emas.ema200 ? last > emas.ema200 : false,
    // F5: RS vs Nifty (positive = outperforming)
    f5_relStrength: rs !== null ? rs > 0 : true, // pass if no data
    // F6: Above 50 EMA
    f6_above50EMA: emas.ema50 ? last > emas.ema50 : false,
    // F7: Earnings (flag, manual check)
    f7_noEarnings: true, // flag for manual verification
  };

  // Entry conditions
  const entry = {
    // E2: Stock above EMA 50 + 200
    e2_trend: filters.f4_above200EMA && filters.f6_above50EMA,
    // E3: Consolidation base found
    e3_base: base.found,
    // E4: Close above resistance (base high)
    e4_breakout: base.found ? last > base.baseHigh : false,
    // E5: Volume ≥ 1.5× avg on breakout day
    e5_volume: avgVol ? lastVol >= avgVol * config.VOLUME_MULTIPLIER : false,
    // E6: RSI 50–72, ADX > 20
    e6_rsi: rsi ? rsi >= config.RSI_MIN && rsi <= config.RSI_MAX : false,
    e6_adx: adx ? adx >= config.ADX_MIN : false,
  };

  // All filters must pass
  const filtersPass = Object.values(filters).every(Boolean);
  const entryPass = entry.e2_trend && entry.e3_base && entry.e4_breakout && entry.e5_volume && entry.e6_rsi && entry.e6_adx;

  if (!filtersPass || !entryPass) {
    return {
      pass: false, symbol,
      failReason: getFailReason(filters, entry, base, rsi, adx, avgVol, lastVol, last, emas)
    };
  }

  // ── Trade Setup Calculation ───────────────────────────────────────────────
  const entryPrice   = parseFloat((last * 1.003).toFixed(2)); // 0.3% above close
  const stopLoss     = parseFloat((base.baseLow * 0.99).toFixed(2)); // base low - 1%
  const riskPerShare = entryPrice - stopLoss;
  const stopPct      = riskPerShare / entryPrice;

  // SL2: Max 8% stop
  if (stopPct > config.MAX_STOP_PERCENT) {
    return { pass: false, symbol, failReason: `SL2: Stop distance ${(stopPct*100).toFixed(1)}% > 8% max` };
  }

  const riskAmount   = config.CAPITAL * config.RISK_PERCENT;
  let   positionSize = Math.floor(riskAmount / riskPerShare);
  const totalValue   = positionSize * entryPrice;
  const capitalPct   = totalValue / config.CAPITAL;

  // PS2: Max 20% of capital per stock
  if (capitalPct > config.MAX_POSITION_PERCENT) {
    positionSize = Math.floor((config.CAPITAL * config.MAX_POSITION_PERCENT) / entryPrice);
  }

  // Target 1: entry + 1.5R
  const target1    = parseFloat((entryPrice + riskPerShare * 1.5).toFixed(2));
  const target2    = parseFloat((entryPrice + riskPerShare * 3.0).toFixed(2)); // 3R
  const rrRatio    = ((target1 - entryPrice) / riskPerShare).toFixed(2);

  // RR1: Min 1:2 R:R
  if (parseFloat(rrRatio) < config.MIN_RR) {
    return { pass: false, symbol, failReason: `RR1: R:R ${rrRatio} < minimum 2.0` };
  }

  // E4 chase filter: don't chase if already 3%+ above breakout
  const chaseFilter = (last - base.baseHigh) / base.baseHigh;
  if (chaseFilter > config.MAX_CHASE_PERCENT) {
    return { pass: false, symbol, failReason: `Chase filter: ${(chaseFilter*100).toFixed(1)}% above breakout level` };
  }

  return {
    pass: true,
    symbol,
    setup: {
      entryPrice,
      stopLoss,
      target1,
      target2,
      riskPerShare: parseFloat(riskPerShare.toFixed(2)),
      positionSize,
      totalValue:   Math.round(positionSize * entryPrice),
      maxLoss:      Math.round(positionSize * riskPerShare),
      rrRatio,
      stopPct:      (stopPct * 100).toFixed(1),
      capitalPct:   ((positionSize * entryPrice / config.CAPITAL) * 100).toFixed(1),
    },
    indicators: {
      close:   last,
      ema20:   emas.ema20 ? Math.round(emas.ema20) : null,
      ema50:   emas.ema50 ? Math.round(emas.ema50) : null,
      ema200:  emas.ema200 ? Math.round(emas.ema200) : null,
      rsi:     rsi ? rsi.toFixed(1) : null,
      adx:     adx ? adx.toFixed(1) : null,
      volume:  lastVol,
      avgVol:  Math.round(avgVol),
      volRatio: avgVol ? (lastVol / avgVol).toFixed(2) : null,
    },
    base: {
      baseLow:  Math.round(base.baseLow),
      baseHigh: Math.round(base.baseHigh),
      baseDays: base.baseDays,
    },
  };
}

function getFailReason(filters, entry, base, rsi, adx, avgVol, lastVol, last, emas) {
  if (!filters.f2_price) return `F2: Price < ₹100`;
  if (!filters.f3_volume) return `F3: Insufficient liquidity`;
  if (!filters.f4_above200EMA) return `F4: Below 200-EMA (${emas.ema200 ? Math.round(emas.ema200) : 'N/A'})`;
  if (!filters.f6_above50EMA) return `F6: Below 50-EMA`;
  if (!entry.e3_base) return `E3: No consolidation base detected`;
  if (!entry.e4_breakout) return `E4: No breakout — below resistance`;
  if (!entry.e5_volume) return `E5: Volume ${lastVol} < 1.5× avg (${Math.round(avgVol)})`;
  if (!entry.e6_rsi) return `E6: RSI ${rsi ? rsi.toFixed(1) : 'N/A'} outside 50–72`;
  if (!entry.e6_adx) return `E6: ADX ${adx ? adx.toFixed(1) : 'N/A'} < 20`;
  return 'Did not meet all TFBS criteria';
}

/**
 * Run full daily scan
 */
async function runDailyScan() {
  console.log('\n=== TFBS Daily Scan Starting ===');

  // Step 1: Market conditions
  const market = await checkMarketConditions();
  if (!market.pass) {
    return { market, setups: [], scanTime: new Date().toISOString() };
  }

  // Step 2: Get stock universe
  const stocks = await fetchNifty500List();
  const niftyData = await fetchNifty50(300);
  const niftyCloses = niftyData ? niftyData.map(d => d.close) : null;

  console.log(`Scanning ${stocks.length} stocks...`);

  // Step 3: Scan each stock (with rate limiting)
  const setups = [];
  let scanned = 0;

  for (const symbol of stocks) {
    try {
      const result = await scanStock(symbol, niftyCloses);
      if (result?.pass) {
        setups.push(result);
        console.log(`✅ SETUP: ${symbol} — R:R ${result.setup.rrRatio}`);
      }
      scanned++;
      if (scanned % 10 === 0) console.log(`Scanned ${scanned}/${stocks.length}...`);
      // Rate limit: 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`Error scanning ${symbol}:`, err.message);
    }
  }

  console.log(`\n=== Scan Complete: ${setups.length} setups found from ${scanned} stocks ===`);

  return {
    market,
    setups: setups.sort((a,b) => parseFloat(b.setup.rrRatio) - parseFloat(a.setup.rrRatio)),
    scanTime: new Date().toISOString(),
    scanned,
  };
}

module.exports = { runDailyScan, checkMarketConditions, scanStock };
