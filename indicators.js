'use strict';

// ── Technical Indicator Calculations ──────────────────────────────────────────

/**
 * Calculate EMA for a given period
 */
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculate all EMAs (20, 50, 200)
 */
function calcEMAs(closes) {
  return {
    ema20:  calcEMA(closes, 20),
    ema50:  calcEMA(closes, 50),
    ema200: calcEMA(closes, 200),
  };
}

/**
 * Calculate RSI (14-period)
 */
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate ADX (14-period)
 */
function calcADX(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return null;
  const trueRanges = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
    const plusDM  = (highs[i] - highs[i-1] > lows[i-1] - lows[i]) ? Math.max(highs[i] - highs[i-1], 0) : 0;
    const minusDM = (lows[i-1] - lows[i] > highs[i] - highs[i-1]) ? Math.max(lows[i-1] - lows[i], 0) : 0;
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }
  const smoothed = (arr, p) => {
    let sum = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const out = [sum];
    for (let i = p; i < arr.length; i++) {
      sum = sum - sum / p + arr[i];
      out.push(sum);
    }
    return out;
  };
  const sTR = smoothed(trueRanges, period);
  const sPDM = smoothed(plusDMs, period);
  const sMDM = smoothed(minusDMs, period);
  const dxArr = [];
  for (let i = 0; i < sTR.length; i++) {
    if (sTR[i] === 0) continue;
    const pdi = 100 * sPDM[i] / sTR[i];
    const mdi = 100 * sMDM[i] / sTR[i];
    const sum = pdi + mdi;
    if (sum === 0) continue;
    dxArr.push(100 * Math.abs(pdi - mdi) / sum);
  }
  if (dxArr.length < period) return null;
  return dxArr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate average volume over N days
 */
function calcAvgVolume(volumes, days = 20) {
  const slice = volumes.slice(-days);
  if (slice.length < days) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Detect consolidation base
 * Returns { found, baseLow, baseHigh, baseDays }
 */
function detectBase(highs, lows, closes, minDays = 10, maxDays = 50) {
  const n = closes.length;
  if (n < minDays + 20) return { found: false };

  // Look at the last minDays to maxDays candles for a consolidation
  const lookback = Math.min(maxDays, n - 5);
  const recentHighs = highs.slice(-lookback);
  const recentLows  = lows.slice(-lookback);

  const rangeHigh = Math.max(...recentHighs);
  const rangeLow  = Math.min(...recentLows);
  const rangeWidth = (rangeHigh - rangeLow) / rangeLow;

  // Base is valid if price range < 15% over the period (tight consolidation)
  if (rangeWidth > 0.15) {
    // Try shorter window
    const shortback = Math.max(minDays, Math.floor(lookback / 2));
    const shortHighs = highs.slice(-shortback);
    const shortLows  = lows.slice(-shortback);
    const sh = Math.max(...shortHighs);
    const sl = Math.min(...shortLows);
    const sw = (sh - sl) / sl;
    if (sw > 0.15) return { found: false };
    return { found: true, baseLow: sl, baseHigh: sh, baseDays: shortback };
  }

  return { found: true, baseLow: rangeLow, baseHigh: rangeHigh, baseDays: lookback };
}

/**
 * Check if stock is making higher highs + higher lows (uptrend) on weekly
 */
function isInUptrend(weeklyHighs, weeklyLows, periods = 8) {
  if (weeklyHighs.length < periods) return false;
  const h = weeklyHighs.slice(-periods);
  const l = weeklyLows.slice(-periods);
  let higherHighs = 0, higherLows = 0;
  for (let i = 1; i < h.length; i++) {
    if (h[i] > h[i-1]) higherHighs++;
    if (l[i] > l[i-1]) higherLows++;
  }
  return higherHighs >= periods * 0.6 && higherLows >= periods * 0.6;
}

/**
 * Calculate relative strength vs index (3-month)
 */
function calcRS(stockCloses, indexCloses, days = 63) {
  if (stockCloses.length < days || indexCloses.length < days) return null;
  const stockReturn = (stockCloses[stockCloses.length-1] / stockCloses[stockCloses.length-1-days]) - 1;
  const indexReturn = (indexCloses[indexCloses.length-1] / indexCloses[indexCloses.length-1-days]) - 1;
  return stockReturn - indexReturn; // positive = outperforming
}

module.exports = {
  calcEMA, calcEMAs, calcRSI, calcADX,
  calcAvgVolume, detectBase, isInUptrend, calcRS
};
