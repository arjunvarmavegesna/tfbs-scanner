'use strict';

const axios = require('axios');
const config = require('./config');

const BASE = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text, parseMode = 'Markdown') {
  try {
    await axios.post(`${BASE}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }, { timeout: 10000 });
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

/**
 * Format market conditions alert
 */
function formatMarketAlert(market) {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  return `📊 *TFBS Market Check*\n_${now} IST_\n\n${market.message}\n\nNifty: *₹${market.niftyClose}*\n50-EMA: ₹${market.nifty50EMA}\nVIX: ${market.vix || 'N/A'}`;
}

/**
 * Format a single trade setup alert
 */
function formatSetupAlert(result, index, total) {
  const s = result.setup;
  const ind = result.indicators;
  const b = result.base;

  const rrEmoji = parseFloat(s.rrRatio) >= 3 ? '🏆' : parseFloat(s.rrRatio) >= 2.5 ? '✅' : '⚠️';

  return `${rrEmoji} *${result.symbol}* — Setup ${index}/${total}\n\n` +
    `📈 *Trade Plan*\n` +
    `• Entry: ₹${s.entryPrice} _(tomorrow open)_\n` +
    `• Stop-loss: ₹${s.stopLoss} _(GTC order)_\n` +
    `• Target 1 _(50% exit)_: ₹${s.target1}\n` +
    `• Target 2 _(trail)_: ₹${s.target2}\n` +
    `• R:R Ratio: *${s.rrRatio}:1* ${rrEmoji}\n\n` +
    `💰 *Position Sizing*\n` +
    `• Shares to buy: *${s.positionSize}*\n` +
    `• Total value: ₹${s.totalValue.toLocaleString('en-IN')}\n` +
    `• Capital deployed: ${s.capitalPct}%\n` +
    `• Max loss if stopped: ₹${s.maxLoss.toLocaleString('en-IN')}\n` +
    `• Risk per share: ₹${s.riskPerShare}\n` +
    `• Stop distance: ${s.stopPct}%\n\n` +
    `📊 *Indicators*\n` +
    `• Close: ₹${ind.close} | RSI: ${ind.rsi} | ADX: ${ind.adx}\n` +
    `• EMA20: ₹${ind.ema20} | EMA50: ₹${ind.ema50} | EMA200: ₹${ind.ema200}\n` +
    `• Volume: ${(ind.volume/100000).toFixed(1)}L _(${ind.volRatio}× avg)_\n\n` +
    `🏗️ *Base*\n` +
    `• Base low: ₹${b.baseLow} | Base high: ₹${b.baseHigh}\n` +
    `• Consolidation: ${b.baseDays} days\n\n` +
    `⚠️ _Verify earnings calendar before entry_\n` +
    `⚠️ _Set GTC stop-loss immediately after entry_`;
}

/**
 * Format daily scan summary
 */
function formatScanSummary(result) {
  const { setups, market, scanTime, scanned } = result;
  const now = new Date(scanTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  if (!market.pass) {
    return `🔴 *TFBS Daily Scan*\n_${now} IST_\n\n${market.message}\n\n_0 setups scanned_`;
  }

  if (setups.length === 0) {
    return `🟡 *TFBS Daily Scan*\n_${now} IST_\n\n${market.message}\n\n_Scanned ${scanned} stocks — No valid setups today_\n\nAll setups failed TFBS filters. Wait for better opportunities.`;
  }

  return `🟢 *TFBS Daily Scan Complete*\n_${now} IST_\n\n${market.message}\n\n*${setups.length} setup(s) found* from ${scanned} stocks:\n\n` +
    setups.slice(0,8).map((s,i) =>
      `${i+1}. *${s.symbol}* — R:R ${s.setup.rrRatio} | Entry ₹${s.setup.entryPrice} | Stop ₹${s.setup.stopLoss}`
    ).join('\n') +
    `\n\n_Detailed trade plans follow ↓_`;
}

/**
 * Format Sunday weekly check message
 */
function formatSundayCheck(market) {
  const checks = [
    market.niftyAbove50EMA ? '✅ Nifty above 50-EMA' : '❌ Nifty BELOW 50-EMA',
    market.vix ? (market.vix < 18 ? '✅ VIX below 18' : market.vix < 20 ? '⚠️ VIX 18–20 (caution)' : '❌ VIX above 20') : '⚠️ VIX data unavailable',
    market.niftyAbove200EMA ? '✅ Nifty above 200-EMA' : '⚠️ Nifty below 200-EMA',
  ];

  return `📅 *TFBS Sunday Weekly Check*\n\n` +
    `*Market Status: ${market.mode}*\n\n` +
    checks.join('\n') + '\n\n' +
    `*Nifty:* ₹${market.niftyClose}\n` +
    `*50-EMA:* ₹${market.nifty50EMA}\n` +
    `*VIX:* ${market.vix || 'N/A'}\n\n` +
    `${market.message}\n\n` +
    `_Update watchlist and trailing stops for the week ahead._\n` +
    `_Check earnings calendar for all open positions._`;
}

/**
 * Send full daily scan results
 */
async function sendDailyScanResults(scanResult) {
  const chatId = config.TELEGRAM_CHAT_ID;

  // Send summary first
  await sendMessage(chatId, formatScanSummary(scanResult));

  if (!scanResult.market.pass || scanResult.setups.length === 0) return;

  // Send individual trade setups
  const setups = scanResult.setups.slice(0, 8); // max 8
  for (let i = 0; i < setups.length; i++) {
    await new Promise(r => setTimeout(r, 800)); // rate limit
    await sendMessage(chatId, formatSetupAlert(setups[i], i + 1, setups.length));
  }

  // Send closing message
  await new Promise(r => setTimeout(r, 800));
  await sendMessage(chatId,
    `📋 *TFBS Checklist Before Entry*\n\n` +
    `☐ Market conditions check (Nifty above 50-EMA)\n` +
    `☐ Verify earnings calendar (no results in 7 days)\n` +
    `☐ Mark resistance level on daily chart\n` +
    `☐ Calculate position size (done above ↑)\n` +
    `☐ Set GTC stop-loss ORDER immediately after buy\n` +
    `☐ Max 6 positions open | Max 2 per sector\n` +
    `☐ Never risk > 1% capital per trade\n\n` +
    `_Good trades. Follow the rules._`
  );
}

/**
 * Send Sunday weekly check
 */
async function sendSundayCheck(market) {
  await sendMessage(config.TELEGRAM_CHAT_ID, formatSundayCheck(market));
}

module.exports = { sendMessage, sendDailyScanResults, sendSundayCheck, formatMarketAlert };
