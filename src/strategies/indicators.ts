import { Candle } from './types';

export class Indicators {
    /**
     * Simple Moving Average (SMA)
     */
    static manualSMA(data: number[], period: number): number[] {
        if (data.length < period) return [];
        const result: number[] = [];
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
        return result;
    }

    /**
     * Exponential Moving Average (EMA)
     */
    static manualEMA(data: number[], period: number): number[] {
        if (data.length < period) return [];
        const k = 2 / (period + 1);
        const sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        const result: number[] = [sma];

        for (let i = period; i < data.length; i++) {
            const prev = result[result.length - 1];
            result.push(data[i] * k + prev * (1 - k));
        }
        return result;
    }

    /**
     * Relative Strength Index (RSI) - [Fix] 0 나누기 방어
     */
    static manualRSI(data: number[], period: number = 14): number[] {
        if (data.length < period + 1) return [];

        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {
            const change = data[i] - data[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;
        const result: number[] = [];

        // Helper function for safe RS calc
        const calcRSI = (g: number, l: number) => {
            if (l === 0) return 100; // Prevent divide by zero
            if (g === 0) return 0;
            const rs = g / l;
            return 100 - (100 / (1 + rs));
        };

        result.push(calcRSI(avgGain, avgLoss));

        for (let i = period + 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            let gain = change > 0 ? change : 0;
            let loss = change < 0 ? Math.abs(change) : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            result.push(calcRSI(avgGain, avgLoss));
        }

        return result;
    }

    /**
     * Average Directional Index (ADX)
     */
    static manualADX(candles: Candle[], period: number = 14): number[] {
        if (candles.length < period * 2) return [];

        const trs: number[] = [];
        const dmPlus: number[] = [];
        const dmMinus: number[] = [];

        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const prevHigh = candles[i - 1].high;
            const prevLow = candles[i - 1].low;

            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);

            const upMove = high - prevHigh;
            const downMove = prevLow - low;

            if (upMove > downMove && upMove > 0) dmPlus.push(upMove);
            else dmPlus.push(0);

            if (downMove > upMove && downMove > 0) dmMinus.push(downMove);
            else dmMinus.push(0);
        }

        let smoothTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
        let smoothDMPlus = dmPlus.slice(0, period).reduce((a, b) => a + b, 0);
        let smoothDMMinus = dmMinus.slice(0, period).reduce((a, b) => a + b, 0);

        const dxs: number[] = [];

        const calcDX = (p: number, m: number) => {
            const diPlus = (p / smoothTR) * 100;
            const diMinus = (m / smoothTR) * 100;
            const sum = diPlus + diMinus;
            return sum === 0 ? 0 : (Math.abs(diPlus - diMinus) / sum) * 100;
        }

        dxs.push(calcDX(smoothDMPlus, smoothDMMinus));

        for (let i = period; i < trs.length; i++) {
            smoothTR = smoothTR - (smoothTR / period) + trs[i];
            smoothDMPlus = smoothDMPlus - (smoothDMPlus / period) + dmPlus[i];
            smoothDMMinus = smoothDMMinus - (smoothDMMinus / period) + dmMinus[i];
            dxs.push(calcDX(smoothDMPlus, smoothDMMinus));
        }

        if (dxs.length < period) return [];

        const adx: number[] = [];
        let firstADX = dxs.slice(0, period).reduce((a, b) => a + b, 0) / period;
        adx.push(firstADX);

        for (let i = period; i < dxs.length; i++) {
            const prevADX = adx[adx.length - 1];
            const nextADX = ((prevADX * (period - 1)) + dxs[i]) / period;
            adx.push(nextADX);
        }

        return adx;
    }

    /**
     * Average True Range (ATR)
     */
    static manualATR(candles: Candle[], period: number = 14): number[] {
        if (candles.length < period + 1) return [];

        const trs: number[] = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);
        }

        if (trs.length < period) return [];

        const atr: number[] = [];
        let firstATR = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
        atr.push(firstATR);

        for (let i = period; i < trs.length; i++) {
            const prevATR = atr[atr.length - 1];
            const nextATR = ((prevATR * (period - 1)) + trs[i]) / period;
            atr.push(nextATR);
        }

        return atr;
    }
}
