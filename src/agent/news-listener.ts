import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { UpbitClient } from "../exchange/upbit";
import axios from 'axios';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4000';

// [Safety] 내가 감시할 채널 ID 목록 (Tree News 등)
// 실제 채널 ID를 찾아서 넣어야 함. (예: Tree of Alpha ID)
// 일단 테스트를 위해 'me'(내 자신에게 보낸 메시지)나 특정 채팅방 ID 입력 필요
const TARGET_CHATS: string[] = ["-1001219306781"]; // Tree News 채널 ID

export class NewsListener {
    private client: TelegramClient;
    private upbit: UpbitClient;
    private session: StringSession;
    private apiId: number;
    private apiHash: string;

    // [Safety] 업비트 상장 코인 목록 (Whitelist)
    private validTickers: Set<string> = new Set();

    // [Safety] 절대 매수하면 안 되는 기축통화 및 메이저 (Blacklist)
    private readonly IGNORED_TICKERS = new Set(['BTC', 'ETH', 'USDT', 'KRW', 'USDC', 'BUSD']);

    // ⚡ TIER 1 KEYWORDS (정규식 강화)
    private readonly TIER_1_REGEX = /(binance|coinbase|upbit)\s+(will list|listing|adds)/i;

    // [Exit] Composite Exit params (hard stop, trailing stop, time decay)
    private readonly HARD_STOP_PCT = -5.0;
    private readonly TRAIL_STOP_PCT = -3.0;
    private readonly TIME_DECAY_MS = 3 * 60 * 1000;
    private readonly TIME_DECAY_MIN_PROFIT_PCT = 1.0;

    // [Exit] Track active news positions to prevent duplicate monitors
    private activeNewsPositions: Set<string> = new Set();

    constructor() {
        this.apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
        this.apiHash = process.env.TELEGRAM_API_HASH || '';
        this.session = new StringSession(process.env.TELEGRAM_SESSION || "");
        this.upbit = new UpbitClient();

        this.client = new TelegramClient(this.session, this.apiId, this.apiHash, {
            connectionRetries: 5,
        });
    }

    async start() {
        if (!this.apiId || !this.apiHash) {
            console.error("❌ ABORTING: Missing Env Variables");
            return;
        }

        console.log("👂 Connecting to Telegram...");
        await this.client.connect();

        // [Fix 1] 캐싱: 업비트의 모든 마켓 심볼을 가져와서 메모리에 저장
        console.log("📥 Fetching Upbit Market Codes...");
        try {
            const markets = await this.upbit.getMarketAll();
            // "KRW-BTC" -> "BTC"만 추출해서 Set에 저장
            markets.forEach((m: any) => {
                if (m.market.startsWith('KRW-')) {
                    this.validTickers.add(m.market.split('-')[1]);
                }
            });
            console.log(`✅ Cached ${this.validTickers.size} valid Upbit tickers.`);
        } catch (e) {
            console.error("❌ Failed to fetch market codes. Safety check disabled (RISKY).");
        }

        await this.client.start({
            phoneNumber: async () => await this.askUser("Phone Number: "),
            password: async () => await this.askUser("Password: "),
            phoneCode: async () => await this.askUser("Code: "),
            onError: (err) => console.log(err),
        });

        console.log("✅ Sniper Ready! Listening...");

        // [Fix 2] 채팅방 필터링 (incoming: true는 수신 메시지만)
        // chats: TARGET_CHATS 옵션을 쓰거나, 핸들러 내부에서 ID 체크
        this.client.addEventHandler(this.handleNewMessage.bind(this), new NewMessage({ incoming: true }));
    }

    private async handleNewMessage(event: NewMessageEvent) {
        if (!event.message || !event.message.text) return;

        // 채널 ID 로그 & 필터링
        const chatId = event.message.chatId?.toString();
        console.log(`📩 msg from: ${chatId}`);
        if (TARGET_CHATS.length > 0 && (!chatId || !TARGET_CHATS.includes(chatId))) return;

        const text = event.message.text;

        // 1. ⚡ Keyword Check
        if (!this.TIER_1_REGEX.test(text)) return;

        console.time("SniperReaction"); // 반응 속도 측정

        // 2. ⚡ Symbol Extraction (Whitelist 방식)
        const symbol = this.extractSymbolSafe(text);

        if (!symbol) {
            console.log(`⚠️ Tier 1 Keyword found, but NO valid Upbit ticker found in text: "${text.substring(0, 30)}..."`);
            return;
        }

        // 3. ⚡ Fire Immediate Buy (검증 생략)
        console.log(`🚨 TARGET ACQUIRED: ${symbol} (Tier 1 News)`);
        await this.executeSniperTrade(symbol, text);

        console.timeEnd("SniperReaction");
    }

    // [Fix 3] 안전하고 빠른 심볼 추출기
    private extractSymbolSafe(text: string): string | null {
        // 특수문자 제거 후 단어 분리 (예: $PNUT -> PNUT)
        const cleanText = text.replace(/[^a-zA-Z0-9\s]/g, " ");
        const words = cleanText.split(/\s+/);

        for (const word of words) {
            const upper = word.toUpperCase();

            // 길이 필터 (2~6글자)
            if (upper.length < 2 || upper.length > 6) continue;

            // [Fix] 기축통화(USDT 등) 무시
            if (this.IGNORED_TICKERS.has(upper)) continue;

            // 업비트에 상장된 코인인가?
            if (this.validTickers.has(upper)) {
                return upper; // 가장 먼저 발견된 유효 알트코인 리턴
            }
        }
        return null;
    }

    private async executeSniperTrade(symbol: string, newsText: string) {
        const marketSymbol = `KRW-${symbol}`;

        // Send Dashboard (Non-blocking)
        this.sendToDashboard('news', { text: newsText, symbol, isImportant: true });

        try {
            console.log(`🚀 SNIPING: ${marketSymbol} Market Buy!`);

            // [Speed] 볼륨 체크 없이 즉시 매수. 
            // 5만원 시드 기준
            const order = await this.upbit.createMarketBuyOrder(marketSymbol, 50000); // 5만원 매수

            if (order) {
                console.log(`✅ ORDER SENT: ${order.uuid}`);
                // @ts-ignore
                this.sendToDashboard('trade', { symbol: marketSymbol, action: 'BUY', amount: 50000, price: 0 });
                this.monitorNewsExit(symbol, marketSymbol, newsText).catch(() => {});
            }
        } catch (e) {
            console.error(`❌ BUY FAILED: ${e}`);
        }
    }

    private async monitorNewsExit(symbol: string, marketSymbol: string, newsText: string) {
        if (this.activeNewsPositions.has(symbol)) return;
        this.activeNewsPositions.add(symbol);

        try {
            const entryTicker = await this.upbit.getTicker(`${symbol}/KRW`);
            const entryPrice = entryTicker?.price;
            if (!entryPrice) return;

            let highPrice = entryPrice;
            const entryTime = Date.now();

            while (true) {
                await this.sleep(1000);
                const ticker = await this.upbit.getTicker(`${symbol}/KRW`);
                const last = ticker?.price;
                if (!last) continue;

                if (last > highPrice) highPrice = last;

                const pnlPct = ((last - entryPrice) / entryPrice) * 100;
                const drawdownPct = ((last - highPrice) / highPrice) * 100;
                const elapsed = Date.now() - entryTime;

                const hitHardStop = pnlPct <= this.HARD_STOP_PCT;
                const hitTrailStop = drawdownPct <= this.TRAIL_STOP_PCT;
                const hitTimeDecay = elapsed >= this.TIME_DECAY_MS && pnlPct < this.TIME_DECAY_MIN_PROFIT_PCT;

                if (hitHardStop || hitTrailStop || hitTimeDecay) {
                    await this.executeNewsExit(symbol, marketSymbol, newsText, {
                        pnlPct,
                        drawdownPct,
                        elapsedMs: elapsed,
                        reason: hitHardStop
                            ? "HARD_STOP"
                            : hitTrailStop
                            ? "TRAIL_STOP"
                            : "TIME_DECAY"
                    });
                    break;
                }
            }
        } catch (e) {
            console.error(`❌ EXIT MONITOR FAILED: ${e}`);
        } finally {
            this.activeNewsPositions.delete(symbol);
        }
    }

    private async executeNewsExit(
        symbol: string,
        marketSymbol: string,
        newsText: string,
        meta: { pnlPct: number; drawdownPct: number; elapsedMs: number; reason: string }
    ) {
        try {
            const balances = await this.upbit.getBalances();
            const pos = balances.find((b) => b.currency === symbol);
            const amount = pos?.balance ?? 0;
            if (amount <= 0) return;

            console.log(`🧯 EXIT ${marketSymbol} (${meta.reason}) PnL ${meta.pnlPct.toFixed(2)}% DD ${meta.drawdownPct.toFixed(2)}%`);
            const order = await this.upbit.createMarketSellOrder(marketSymbol, amount);
            if (order) {
                // @ts-ignore
                this.sendToDashboard('trade', { symbol: marketSymbol, action: 'SELL', amount, price: 0 });
            }
        } catch (e) {
            console.error(`❌ SELL FAILED: ${e}`);
        }
    }

    private sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private sendToDashboard(type: 'news' | 'trade', data: any) {
        axios.post(`${DASHBOARD_URL}/api/${type}`, data).catch(e => {
            // Ignore dashboard error
        });
    }

    private askUser(question: string): Promise<string> {
        const readline = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        return new Promise((resolve) =>
            readline.question(question, (ans: string) => {
                readline.close();
                resolve(ans);
            })
        );
    }
}
