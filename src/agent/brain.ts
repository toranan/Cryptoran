import { UpbitClient } from '../exchange/upbit';
import { LivermoreStrategy } from '../strategies/livermore';
import { OneilStrategy } from '../strategies/oneil';
import { GcrStrategy } from '../strategies/gcr';
import { Candle, Signal } from '../strategies/types';

export class ClawdbotBrain {
    private client: UpbitClient;
    private livermore: LivermoreStrategy;
    private oneil: OneilStrategy;
    private gcr: GcrStrategy;

    constructor() {
        this.client = new UpbitClient();
        this.livermore = new LivermoreStrategy();
        this.oneil = new OneilStrategy();
        this.gcr = new GcrStrategy();
    }

    async runCurrentAnalysis(symbol: string = 'BTC/KRW') {
        console.log(`\n🧠 Clawdbot Brain Waking Up... Analyzing ${symbol}`);

        // 1. Fetch Market Data
        // Ideally UpbitClient should have fetchCandles, but for now we rely on the implementation 
        // that we used in test-strategy.ts or add it to UpbitClient.
        // For robustness in this file, let's use the same ccxt approach wrapper or 
        // assume we will move the candle fetching logic to UpbitClient soon.
        // Let's implement a helper here to keep it clean.
        const candles = await this.fetchCandles(symbol);

        if (!candles || candles.length < 50) {
            console.log("❌ Not enough data to think.");
            return;
        }

        // 2. Consult the Old Masters (Strategies)
        const [resLivermore, resOneil, resGcr] = await Promise.all([
            this.livermore.analyze(candles),
            this.oneil.analyze(candles),
            this.gcr.analyze(candles)
        ]);

        // 3. Synthesize & Decide
        console.log("\n📊 Strategy Reports:");
        console.log(`   👴 Livermore: ${resLivermore.signal} (${resLivermore.confidence}) - ${resLivermore.reason}`);
        console.log(`   📈 O'Neil:    ${resOneil.signal}     (${resOneil.confidence}) - ${resOneil.reason}`);
        console.log(`   🐻 GCR:       ${resGcr.signal}       (${resGcr.confidence}) - ${resGcr.reason}`);

        const decision = this.makeFinalDecision(resLivermore.signal, resOneil.signal, resGcr.signal);

        console.log(`\n⚖️  FINAL DECISION: ${decision}`);

        // 4. Execution (TODO: Logic to actually place order)
        if (decision === 'BUY') {
            console.log("🚀 Executing BUY Order...");
            // await this.client.buy(...)
        } else if (decision === 'SELL') {
            console.log("📉 Executing SELL/Stop-Loss Order...");
            // await this.client.sell(...)
        } else {
            console.log("💤 Sleeping...");
        }

        return {
            symbol,
            decision,
            details: {
                livermore: resLivermore,
                oneil: resOneil,
                gcr: resGcr
            }
        };
    }

    private makeFinalDecision(s1: Signal, s2: Signal, s3: Signal): Signal {
        // Weighted Logic
        // IF GCR says BUY (Extreme Panic) -> Listen to him (High Priority)
        if (s3 === 'BUY') return 'BUY';

        // IF Livermore AND O'Neil say BUY -> Strong Bull Market -> BUY
        if (s1 === 'BUY' && s2 === 'BUY') return 'BUY';

        // IF Livermore says SELL -> Trend is dead -> SELL/EXIT
        if (s1 === 'SELL') return 'SELL';

        return 'HOLD'; // Default
    }

    private async fetchCandles(symbol: string): Promise<Candle[]> {
        // Temporary: Using direct ccxt call until UpbitClient is fully upgraded
        const ccxt = require('ccxt');
        const exchange = new ccxt.upbit();
        const ohlcv = await exchange.fetchOHLCV(symbol, '1h', undefined, 100);
        return ohlcv.map((c: any) => ({
            timestamp: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5]
        }));
    }
}
