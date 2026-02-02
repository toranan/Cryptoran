import { UpbitClient } from './exchange/upbit';
import { LivermoreStrategy } from './strategies/livermore';
import { OneilStrategy } from './strategies/oneil';
import { GcrStrategy } from './strategies/gcr';
import { Candle } from './strategies/types';

async function main() {
    console.log("🔍 Simulating Strategy Analysis...");

    // 1. Fetch Data (Public API works without keys)
    console.log("Fetching recent candles for BTC/KRW...");

    try {
        const ccxt = require('ccxt');
        const exchange = new ccxt.upbit();
        // Load markets to ensure symbol mapping is correct
        await exchange.loadMarkets();

        console.log("Fetching 1h candles...");
        const ohlcv = await exchange.fetchOHLCV('BTC/KRW', '1h', undefined, 100);

        const candles: Candle[] = ohlcv.map((c: any) => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5]
        }));

        console.log(`Loaded ${candles.length} candles.`);

        // 2. Run Strategy 1: Livermore
        const livermore = new LivermoreStrategy();
        console.log(`\n🧠 Asking ${livermore.name}...`);

        const result1 = await livermore.analyze(candles);

        console.log(`📢 SIGNAL: ${result1.signal}`);
        console.log(`💬 REASON: ${result1.reason}`);
        console.log(`tj CONFIDENCE: ${result1.confidence * 100}%`);

        // 3. Run Strategy 2: O'Neil
        const oneil = new OneilStrategy();
        console.log(`\n🧠 Asking ${oneil.name}...`);
        const result2 = await oneil.analyze(candles);

        console.log(`📢 SIGNAL: ${result2.signal}`);
        console.log(`💬 REASON: ${result2.reason}`);
        console.log(`tj CONFIDENCE: ${result2.confidence * 100}%`);

        // 4. Run Strategy 3: GCR
        const gcr = new GcrStrategy();
        console.log(`\n🧠 Asking ${gcr.name}...`);
        const result3 = await gcr.analyze(candles);

        console.log(`📢 SIGNAL: ${result3.signal}`);
        console.log(`💬 REASON: ${result3.reason}`);
        console.log(`tj CONFIDENCE: ${result3.confidence * 100}%`);

        console.log("------------------------------------------------");

    } catch (e) {
        console.error("❌ Simulation Failed:", e);
    }
}

main();
