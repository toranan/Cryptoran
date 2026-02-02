import { Strategy, StrategyResult, Candle } from './types';
import { Indicators } from './indicators';

export class GcrStrategy implements Strategy {
    name = "GCR - Liquidation Reversion (Safe Mode)";

    async analyze(candles: Candle[]): Promise<StrategyResult> {
        if (candles.length < 25) {
            return { signal: 'WAIT', reason: 'Not enough data', confidence: 0 };
        }

        const closes = candles.map(c => c.close);
        const opens = candles.map(c => c.open);
        const volumes = candles.map(c => c.volume);

        // Current & Previous Data
        // RSI Calculation
        const rsiValues = Indicators.manualRSI(closes, 14);
        const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

        const currentVolume = volumes[volumes.length - 1];
        const currentClose = closes[closes.length - 1];
        const currentOpen = opens[opens.length - 1];

        // Volume Moving Average (excluding current spike)
        const prevVolumes = volumes.slice(-21, -1);
        const avgVolume = prevVolumes.reduce((a, b) => a + b, 0) / prevVolumes.length || 1;
        const volumeMultiple = currentVolume / avgVolume;

        // [핵심 수정] 떨어지는 칼날 방지 (Falling Knife Protection)
        // 현재 캔들이 "양봉(Green)"이어야 함. (시가보다 종가가 높아야 함)
        // 즉, 매수세가 들어와서 가격을 밀어 올리고 있는 중이어야 진입.
        const isRebounding = currentClose > currentOpen;

        // 1. GCR Logic: Extreme Panic
        if (currentRSI < 25) {
            const isMegaPanic = volumeMultiple >= 10.0;
            const isPanic = volumeMultiple >= 5.0;

            // Case A: 역대급 패닉 (Vol 10x) + 반등 시작
            if (currentRSI < 20 && isMegaPanic) {
                if (!isRebounding) {
                    return {
                        signal: 'WAIT',
                        reason: `🔪 Falling Knife Detected! RSI ${currentRSI.toFixed(1)} & Vol ${volumeMultiple.toFixed(1)}x, but price is still dropping (Red Candle). Waiting for Green.`,
                        confidence: 0
                    };
                }

                return {
                    signal: 'BUY',
                    reason: `🩸 LIQUIDATION REVERSAL: Panic stopped. RSI ${currentRSI.toFixed(1)} + Vol ${volumeMultiple.toFixed(1)}x + Green Candle Detected.`,
                    confidence: 0.99
                };
            }

            // Case B: 일반 패닉 (Vol 5x) + 반등 시작
            if (currentRSI < 25 && isPanic && isRebounding) {
                return {
                    signal: 'BUY',
                    reason: `Panic Reversal: Vol ${volumeMultiple.toFixed(1)}x, RSI ${currentRSI.toFixed(1)}, Price bouncing.`,
                    confidence: 0.85
                };
            }
        }

        // SELL (Take Profit)
        // [추가 팁] RSI 50까지 안 가고 40에서 꺾일 수도 있음. 
        // 실전에서는 트레일링 스탑을 쓰는 게 좋지만, 일단 전략상 매도는 50.
        if (currentRSI > 50) {
            return {
                signal: 'SELL',
                reason: `Mean Reversion Complete (RSI > 50). Take profit.`,
                confidence: 0.6
            };
        }

        return {
            signal: 'WAIT',
            reason: `Scanning... RSI: ${currentRSI.toFixed(1)}, VolMult: ${volumeMultiple.toFixed(1)}x`,
            confidence: 0.5
        };
    }
}
