import ccxt from 'ccxt';
import dotenv from 'dotenv';

dotenv.config();

export class UpbitClient {
    private exchange: any;

    constructor() {
        this.exchange = new ccxt.upbit({
            apiKey: process.env.UPBIT_ACCESS_KEY,
            secret: process.env.UPBIT_SECRET_KEY,
            enableRateLimit: true,
        });
    }

    async getTicker(symbol: string = 'BTC/KRW') {
        try {
            const ticker = await this.exchange.fetchTicker(symbol);
            return {
                symbol: ticker.symbol,
                price: ticker.last,
                high: ticker.high,
                low: ticker.low,
                volume: ticker.baseVolume,
                timestamp: ticker.timestamp
            };
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol}:`, error);
            throw error;
        }
    }

    async getBalance() {
        try {
            const balance = await this.exchange.fetchBalance();
            return balance;
        } catch (error) {
            console.error("Error fetching balance (Check API Keys):", error);
            return null;
        }
    }

    async createMarketBuyOrder(symbol: string, cost: number) {
        try {
            if (cost < 5000) {
                console.warn("⚠️ Minimum order size is 5000 KRW");
                return null;
            }
            const order = await this.exchange.createOrder(symbol, 'market', 'buy', undefined, cost);
            console.log("✅ Market Buy Order Created:", order.id);
            return order;
        } catch (error) {
            console.error("❌ Order Failed:", error);
            return null;
        }
    }

    async createMarketSellOrder(symbol: string, amount: number) {
        try {
            if (amount <= 0) {
                console.warn("⚠️ Sell amount must be greater than 0");
                return null;
            }
            const order = await this.exchange.createOrder(symbol, 'market', 'sell', amount, undefined);
            console.log("✅ Market Sell Order Created:", order.id);
            return order;
        } catch (error) {
            console.error("❌ Sell Order Failed:", error);
            return null;
        }
    }

    async getCandles(symbol: string, timeframe: string, limit: number = 200) {
        try {
            const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
            return ohlcv.map((c: number[]) => ({
                timestamp: c[0],
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5]
            }));
        } catch (error) {
            // console.error(`❌ Failed to fetch candles for ${symbol}:`, error);
            return [];
        }
        return [];
    }

    async getMarketAll() {
        try {
            // Fetch all markets supported by Upbit
            const markets = await this.exchange.loadMarkets();
            // ccxt loadMarkets returns an object where keys are symbols 'BTC/KRW'
            // We want array of market objects to iterate
            return Object.values(markets).map((m: any) => ({
                market: m.id, // 'KRW-BTC'
                korean_name: m.info.korean_name,
                english_name: m.info.english_name
            }));
        } catch (error) {
            console.error("❌ Failed to fetch market list:", error);
            return [];
        }
    }

    async getBalances(): Promise<{ currency: string; balance: number }[]> {
        try {
            const balance = await this.exchange.fetchBalance();
            const result: { currency: string; balance: number }[] = [];
            if (balance.total) {
                for (const [currency, amount] of Object.entries(balance.total)) {
                    const numericAmount = Number(amount);
                    if (numericAmount > 0) {
                        result.push({
                            currency: currency,
                            balance: numericAmount
                        });
                    }
                }
            }
            return result;
        } catch (error) {
            console.error("Error fetching balances:", error);
            return [];
        }
    }
}
