import Parser from 'rss-parser';

async function main() {
    const parser = new Parser();
    console.log("📡 Connecting to Real-Time Crypto News Feed (testing CryptoPanic)...");

    try {
        // Test 1: CryptoPanic RSS (Guess)
        const feed = await parser.parseURL('https://cryptopanic.com/news/rss/');

        console.log(`\n✅ Feed Loaded: ${feed.title}`);
        console.log(`🕒 Current Time: ${new Date().toLocaleString()}`);
        console.log("------------------------------------------------");

        feed.items.slice(0, 3).forEach((item, index) => {
            console.log(`[${index + 1}] ${item.title}`);
        });

    } catch (e: any) {
        console.log("❌ CryptoPanic RSS failed (Likely needs API Key). Error:", e.message);

        // Fallback Test: CoinDesk (Verified working) to ensure network is fine
        try {
            console.log("🔄 Retrying with CoinDesk (Fallback)...");
            const feed = await parser.parseURL('https://www.coindesk.com/arc/outboundfeeds/rss/');
            console.log(`✅ CoinDesk Feed Working: ${feed.title}`);
        } catch (e2) {
            console.error("❌ Network Issue?", e2);
        }
    }
}

main();
