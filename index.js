require('dotenv').config();
'use strict';

const cron = require('node-cron');
const { runDailyScan, checkMarketConditions } = require('./scanner');
const { sendDailyScanResults, sendSundayCheck, sendMessage } = require('./telegram');
const config = require('./config');

console.log('TFBS Scanner starting...');
console.log(`Capital: ₹${config.CAPITAL.toLocaleString('en-IN')}`);
console.log(`Risk per trade: ₹${(config.CAPITAL * config.RISK_PERCENT).toLocaleString('en-IN')} (1%)`);

// ── Daily scan after market close (4:00 PM IST = 10:30 UTC) ──────────────────
cron.schedule('30 10 * * 1-5', async () => {
  console.log('Daily scan triggered (4:00 PM IST)');
  try {
    const result = await runDailyScan();
    await sendDailyScanResults(result);
  } catch (err) {
    console.error('Daily scan error:', err);
    await sendMessage(config.TELEGRAM_CHAT_ID, `⚠️ TFBS scan error: ${err.message}`);
  }
}, { timezone: 'UTC' });

// ── Sunday weekly check (7:00 PM IST = 13:30 UTC) ────────────────────────────
cron.schedule('30 13 * * 0', async () => {
  console.log('Sunday check triggered');
  try {
    const market = await checkMarketConditions();
    await sendSundayCheck(market);
  } catch (err) {
    console.error('Sunday check error:', err);
  }
}, { timezone: 'UTC' });

// ── Manual trigger via command line ──────────────────────────────────────────
if (process.argv[2] === '--scan') {
  console.log('Manual scan triggered');
  runDailyScan().then(result => {
    sendDailyScanResults(result).then(() => {
      console.log('Done');
      process.exit(0);
    });
  }).catch(err => {
    console.error('Scan failed:', err);
    process.exit(1);
  });
} else if (process.argv[2] === '--market') {
  checkMarketConditions().then(market => {
    sendMessage(config.TELEGRAM_CHAT_ID,
      `📊 *Market Check*\n\n${market.message}\n\nNifty: ₹${market.niftyClose}\nVIX: ${market.vix || 'N/A'}`
    ).then(() => process.exit(0));
  });
} else {
  console.log('TFBS Scanner running. Scans at 4:00 PM IST (Mon-Fri) and Sundays 7:00 PM IST');
  console.log('Commands: node index.js --scan | node index.js --market');
}
