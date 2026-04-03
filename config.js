// TFBS Scanner — Configuration
module.exports = {
  // Trading capital (change this to your actual capital)
  CAPITAL: 500000,

  // Risk per trade (1% of capital)
  RISK_PERCENT: 0.01,

  // Max risk per trade for beginners (0.5%)
  RISK_PERCENT_BEGINNER: 0.005,

  // Max position size as % of capital
  MAX_POSITION_PERCENT: 0.20,

  // Max sector exposure
  MAX_SECTOR_PERCENT: 0.40,

  // Max open positions
  MAX_POSITIONS: 6,

  // Max positions per sector
  MAX_SECTOR_POSITIONS: 2,

  // Min R:R ratio
  MIN_RR: 2.0,

  // Ideal R:R
  IDEAL_RR: 3.0,

  // Volume confirmation multiplier
  VOLUME_MULTIPLIER: 1.5,

  // Max % above breakout to still enter (chase filter)
  MAX_CHASE_PERCENT: 0.03,

  // Max stop distance from entry (8% = reject)
  MAX_STOP_PERCENT: 0.08,

  // RSI range for entry
  RSI_MIN: 50,
  RSI_MAX: 72,

  // ADX minimum
  ADX_MIN: 20,

  // VIX maximum
  VIX_MAX: 18,

  // VIX avoid above
  VIX_AVOID: 20,

  // Consolidation base: min days
  BASE_MIN_DAYS: 10,

  // EMA periods
  EMA_SHORT: 20,
  EMA_MED: 50,
  EMA_LONG: 200,

  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TFBS_TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TFBS_CHAT_ID || '8157085855',

  // Scan time (IST, after market close)
  SCAN_TIME_IST: '16:00',
  WEEKLY_SCAN_TIME_IST: '19:00', // Sunday 7 PM
};
