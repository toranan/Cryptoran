import { Strategy, StrategyResult, Candle } from './types';
import { Indicators } from './indicators';

export class LivermoreStrategy implements Strategy {
    name = "Time-Series Momentum + ADX Filter";

    async analyze(candles: Candle[]): Promise<StrategyResult> {
        // [Safety] ADX는 계산에 많은 과거 데이터가 필요함 (최소 50개 권장)
        if (candles.length < 50) {
            return { signal: 'WAIT', reason: 'Not enough data (need 50+ candles)', confidence: 0 };
        }

        const closes = candles.map(c => c.close);
        const currentPrice = closes[closes.length - 1];

        // 1. Indicators Calculation
        const prevCloses = closes.slice(-21, -1);
        const lookbackHigh = Math.max(...prevCloses);

        const sma20Values = Indicators.manualSMA(closes, 20);
        const sma20 = sma20Values[sma20Values.length - 1];

        const adxValues = Indicators.manualADX(candles, 14);
        const currentADX = adxValues.length > 0 ? adxValues[adxValues.length - 1] : 0;

        // 2. Logic Definition
        const isBreakout = currentPrice > lookbackHigh;
        const isTrendBroken = currentPrice < sma20;
        const isStrongTrend = currentADX >= 25;

        // 3. Signal Generation (Order: Exit -> Entry)

        // [Priority 1] SELL (Capital Protection)
        // 추세가 깨졌으면 ADX고 뭐고 일단 도망쳐야 함
        if (isTrendBroken) {
            return {
                signal: 'SELL',
                reason: `📉 EXIT: Price(${currentPrice}) fell below 20-Day SMA(${Math.floor(sma20)}). Trend Broken.`,
                confidence: 0.9
            };
        }

        // [Priority 2] BUY (Momentum Entry)
        if (isBreakout) {
            if (!isStrongTrend) {
                return {
                    signal: 'WAIT',
                    reason: `⚠️ Fake-out Warning: Breakout detected but ADX(${currentADX.toFixed(1)}) < 25. Weak Trend.`,
                    confidence: 0
                };
            }

            return {
                signal: 'BUY',
                reason: `🚀 ENTRY: New 20d High + Strong ADX(${currentADX.toFixed(1)}). Trend is Valid.`,
                confidence: 0.95
            };
        }

        return {
            signal: 'HOLD',
            reason: `Scanning... ADX: ${currentADX.toFixed(1)} / Resistance: ${lookbackHigh}`,
            confidence: 0.5
        };
    }
}
