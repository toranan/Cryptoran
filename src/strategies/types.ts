export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type Signal = 'BUY' | 'SELL' | 'HOLD' | 'WAIT';

export interface StrategyResult {
    signal: Signal;
    reason: string;
    confidence: number; // 0.0 - 1.0
}

export interface Strategy {
    name: string;
    analyze(candles: Candle[]): Promise<StrategyResult>;
}
