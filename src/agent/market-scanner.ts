import { UpbitClient } from '../exchange/upbit';
import { LivermoreStrategy } from '../strategies/livermore';
import { GcrStrategy } from '../strategies/gcr';
import { Indicators } from '../strategies/indicators';
import axios from 'axios';

const upbit = new UpbitClient();
const livermore = new LivermoreStrategy();
const gcr = new GcrStrategy();

const WATCHLIST = [
    'KRW-BTC', 'KRW-ETH', 'KRW-XRP', 'KRW-SOL', 'KRW-DOGE',
    'KRW-SUI', 'KRW-SEI', 'KRW-NEAR', 'KRW-AVAX', 'KRW-ETC'
];

let lastHourlyTime = 0;
let isRunning = false; // [Fix 1] 중복 실행 방지 플래그
let lastRsUpdate = 0;
let dynamicWatchlist: string[] = [...WATCHLIST];

// [ATR Stop] Settings
const ATR_PERIOD = 14;
const GCR_ATR_MULT = 2.5; // 2.0 ~ 3.0 권장
const LIVERMORE_ATR_MULT = 2.5;

// Track entry price for ATR stop (scanner-originated trades only)
const entryPrices = new Map<string, number>();

// [RS Filter] Settings
const RS_UPDATE_MS = 60 * 60 * 1000;
const RS_PRIMARY_HOURS = 24;
const RS_SECONDARY_HOURS = 4;
const RS_TOP_N = 10;
const RS_FOCUS_N = 5;

async function scanMarket() {
    if (isRunning) {
        console.log("⚠️ Previous scan still running. Skipping this cycle.");
        return;
    }
    isRunning = true; // 잠금

    const now = Date.now();
    // 1시간 체크 로직: 정확히 매시 정각 부근에 실행되도록 수정하면 더 좋음 (지금은 단순 경과시간)
    const isHourly = (now - lastHourlyTime) >= 3600 * 1000;

    if (isHourly) {
        console.log(`\n⏰ [Scanner] Running Hourly Checks...`);
        lastHourlyTime = now;
    }

    if (now - lastRsUpdate >= RS_UPDATE_MS) {
        const rsList = await buildRelativeStrengthWatchlist();
        if (rsList.length > 0) {
            dynamicWatchlist = rsList;
            console.log(`\n📈 [RS] Updated watchlist: ${dynamicWatchlist.join(', ')}`);
        }
        lastRsUpdate = now;
    }

    console.log(`\n📡 [Scanner] Scanning ${dynamicWatchlist.length} assets concurrently...`);

    // 잔고 조회 (API Call 최적화를 위해 한 번만 호출)
    // [Fix 2] 중복 매수 방지를 위해 현재 보유 코인 리스트 가져오기
    let myBalances: string[] = [];
    const balanceMap = new Map<string, number>();
    try {
        const balances = await upbit.getBalances();
        myBalances = balances.map((b) => `KRW-${b.currency}`);
        balances.forEach((b) => {
            balanceMap.set(b.currency, b.balance);
        });
    } catch (e) {
        console.error("❌ Failed to fetch balances. Continuing strictly to signal check.");
    }

    await Promise.all(dynamicWatchlist.map(async (symbol) => {
        try {
            // [Fix 2] 이미 보유 중이면 스캔 패스
            // (주의: 이미 샀는데 GCR 조건 또 만족해서 추매하는걸 원하면 이 로직 빼야함. 일단 안전제일)
            const hasPosition = myBalances.includes(symbol);
            const entryPrice = entryPrices.get(symbol);

            // [ATR Stop] GCR uses 5m candles
            if (hasPosition && entryPrice) {
                const atrCandles = await upbit.getCandles(symbol, '5m', 60);
                if (atrCandles && atrCandles.length > ATR_PERIOD) {
                    const atrValues = Indicators.manualATR(atrCandles, ATR_PERIOD);
                    const currentATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;
                    const lastClose = atrCandles[atrCandles.length - 1].close;
                    const stopPrice = entryPrice - (GCR_ATR_MULT * currentATR);
                    if (lastClose <= stopPrice) {
                        await executeSellTrade(symbol, `ATR Stop hit (5m, k=${GCR_ATR_MULT})`, 'GCR ATR Stop', balanceMap);
                        entryPrices.delete(symbol);
                        return;
                    }
                }
            }

            // 1. GCR Strategy (1m)
            const minCandles = await upbit.getCandles(symbol, '1m', 30);
            if (minCandles && minCandles.length > 20) {
                const result = await gcr.analyze(minCandles);
                if (result.signal === 'SELL') {
                    await executeSellTrade(symbol, result.reason, 'GCR Reversion', balanceMap);
                    entryPrices.delete(symbol);
                    return;
                }
                if (result.signal === 'BUY' && !hasPosition) {
                    const lastClose = minCandles[minCandles.length - 1].close;
                    await executeBuyTrade(symbol, result.reason, 'GCR Reversion', lastClose);
                    return;
                }
            }

            // 2. Livermore Strategy (1d)
            if (isHourly) {
                // [ATR Stop] Livermore uses 1h candles
                if (hasPosition && entryPrice) {
                    const atrCandles = await upbit.getCandles(symbol, '1h', 120);
                    if (atrCandles && atrCandles.length > ATR_PERIOD) {
                        const atrValues = Indicators.manualATR(atrCandles, ATR_PERIOD);
                        const currentATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;
                        const lastClose = atrCandles[atrCandles.length - 1].close;
                        const stopPrice = entryPrice - (LIVERMORE_ATR_MULT * currentATR);
                        if (lastClose <= stopPrice) {
                            await executeSellTrade(symbol, `ATR Stop hit (1h, k=${LIVERMORE_ATR_MULT})`, 'Livermore ATR Stop', balanceMap);
                            entryPrices.delete(symbol);
                            return;
                        }
                    }
                }

                const dayCandles = await upbit.getCandles(symbol, '1d', 60);
                if (dayCandles && dayCandles.length > 50) {
                    const result = await livermore.analyze(dayCandles);
                    if (result.signal === 'SELL') {
                        await executeSellTrade(symbol, result.reason, 'Livermore Breakout', balanceMap);
                        entryPrices.delete(symbol);
                        return;
                    }
                    if (result.signal === 'BUY' && !hasPosition) {
                        const lastClose = dayCandles[dayCandles.length - 1].close;
                        await executeBuyTrade(symbol, result.reason, 'Livermore Breakout', lastClose);
                    }
                }
            }

        } catch (e) {
            // Error handling
            // console.error(`Failed to scan ${symbol}`);
        }
    }));

    isRunning = false; // [Fix 1] 잠금 해제
}

async function buildRelativeStrengthWatchlist(): Promise<string[]> {
    try {
        const markets = await upbit.getMarketAll();
        const krwMarkets = markets
            .map((m: { market: string }) => m.market)
            .filter((m: string) => m.startsWith('KRW-') && m !== 'KRW-BTC');

        const btcCandles = await upbit.getCandles('KRW-BTC', '1h', 60);
        const btcReturn24 = calcReturn(btcCandles, RS_PRIMARY_HOURS);
        const btcReturn4 = calcReturn(btcCandles, RS_SECONDARY_HOURS);
        if (btcReturn24 === null || btcReturn4 === null) return [];

        const rsScores: { symbol: string; rs24: number; rs4: number }[] = [];

        for (const symbol of krwMarkets) {
            const candles = await upbit.getCandles(symbol, '1h', 60);
            const r24 = calcReturn(candles, RS_PRIMARY_HOURS);
            const r4 = calcReturn(candles, RS_SECONDARY_HOURS);
            if (r24 === null || r4 === null) continue;

            rsScores.push({
                symbol,
                rs24: r24 - btcReturn24,
                rs4: r4 - btcReturn4
            });
        }

        rsScores.sort((a, b) => b.rs24 - a.rs24);
        const topN = rsScores.slice(0, RS_TOP_N);
        topN.sort((a, b) => b.rs4 - a.rs4);
        return topN.slice(0, RS_FOCUS_N).map((s) => s.symbol);
    } catch (e) {
        console.error("❌ RS watchlist build failed. Using default WATCHLIST.");
        return [];
    }
}

function calcReturn(candles: { close: number }[], hoursBack: number): number | null {
    if (!candles || candles.length <= hoursBack) return null;
    const last = candles[candles.length - 1].close;
    const prev = candles[candles.length - 1 - hoursBack].close;
    if (!prev || prev <= 0) return null;
    return (last / prev) - 1;
}

async function executeBuyTrade(symbol: string, reason: string, strategyName: string, entryPrice: number) {
    console.log(`🚨 BUY SIGNAL [${strategyName}]: ${symbol} | Reason: ${reason}`);

    // Send to Dashboard (Non-blocking)
    axios.post('http://localhost:4000/api/news', {
        text: `[${strategyName}] ${symbol} BUY Signal Detected! ${reason}`,
        symbol: symbol.replace('KRW-', ''),
        isImportant: true
    }).catch(e => { });

    try {
        const order = await upbit.createMarketBuyOrder(symbol, 10000);
        if (order) {
            if (entryPrice > 0) {
                entryPrices.set(symbol, entryPrice);
            }
            await axios.post('http://localhost:4000/api/trade', {
                symbol: symbol,
                action: 'BUY',
                amount: 10000, // [Tip] 10만원 시드면 분할매수 고려 (예: 1만원씩)
                price: 0
            });
        }
    } catch (e) {
        console.error("Buy Execution Failed");
    }
}

async function executeSellTrade(
    symbol: string,
    reason: string,
    strategyName: string,
    balanceMap: Map<string, number>
) {
    const currency = symbol.replace('KRW-', '');
    const amount = balanceMap.get(currency) || 0;
    if (amount <= 0) return;

    console.log(`📉 SELL SIGNAL [${strategyName}]: ${symbol} | Reason: ${reason}`);

    axios.post('http://localhost:4000/api/news', {
        text: `[${strategyName}] ${symbol} SELL Signal Detected! ${reason}`,
        symbol: currency,
        isImportant: true
    }).catch(e => { });

    try {
        const order = await upbit.createMarketSellOrder(symbol, amount);
        if (order) {
            await axios.post('http://localhost:4000/api/trade', {
                symbol: symbol,
                action: 'SELL',
                amount: amount,
                price: 0
            });
        }
    } catch (e) {
        console.error("Sell Execution Failed");
    }
}

// [Fix 1] 재귀적 호출 패턴 (안전한 무한 루프)
async function startLoop() {
    await scanMarket();
    // 작업 끝난 후 60초 뒤에 재실행 (정확한 1분 주기보다는 '휴식 1분' 개념)
    setTimeout(startLoop, 60000);
}

console.log(`🚀 Market Scanner Started.`);
startLoop();
