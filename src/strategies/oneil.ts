import { Strategy, StrategyResult, Candle } from './types';
import { Indicators } from './indicators';

export class OneilStrategy implements Strategy {
    name = "William O'Neil - Breakout Trader";

    async analyze(candles: Candle[]): Promise<StrategyResult> {
        if (candles.length < 50) {
            return { signal: 'WAIT', reason: 'Not enough data', confidence: 0 };
        }

        const closes = candles.map(c => c.close);
        const volumes = candles.map(c => c.volume);
        const currentPrice = closes[closes.length - 1];
        const currentVolume = volumes[volumes.length - 1];

        // 1. Base Condition: Upward Trend (Price > SMA50)
        // O'Neil only buys stocks in an uptrend (Stage 2)
        const sma50Values = Indicators.manualSMA(closes, 50);
        const sma50 = sma50Values[sma50Values.length - 1];

        if (currentPrice < sma50) {
            return {
                signal: 'WAIT',
                reason: `Price below SMA50. Market not in uptrend. O'Neil rule #1: Only buy in uptrends.`,
                confidence: 0.5
            };
        }

        // 2. Volume Spike Check
        // Volume must be at least 50-100% higher than average
        const avgVolumeValues = Indicators.manualSMA(volumes, 20);
        const avgVolume = avgVolumeValues[avgVolumeValues.length - 1];
        const volumeSpike = currentVolume > (avgVolume * 1.5); // 1.5x average volume

        // 3. Price Breakout Check (High of last 20 candles, excluding current)
        // Check if we are passing a "Pivot Point"
        const recentHighs = candles.slice(-21, -1).map(c => c.high);
        const resistance = Math.max(...recentHighs);
        const priceBreakout = currentPrice > resistance;

        // Decision
        if (priceBreakout && volumeSpike) {
            return {
                signal: 'BUY',
                reason: `🚨 BREAKOUT DETECTED! Price broken 20-candle high (${resistance.toLocaleString()}) with HUGE volume (${Math.floor(currentVolume / avgVolume).toFixed(1)}x avg). "It takes volume to move price."`,
                confidence: 0.95
            };
        } else if (priceBreakout && !volumeSpike) {
            return {
                signal: 'WAIT',
                reason: `Price breakout detected but VOLUME IS WEAK (${Math.floor(currentVolume / avgVolume).toFixed(1)}x avg). False breakout risk.`,
                confidence: 0.6
            };
        }

        return {
            signal: 'HOLD',
            reason: `In uptrend (Above SMA50), monitoring for high-volume breakout. Resistance: ${resistance.toLocaleString()}`,
            confidence: 0.6
        };
    }
}
