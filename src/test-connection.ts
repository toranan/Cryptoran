import { UpbitClient } from './exchange/upbit';

async function main() {
    console.log("🔌 Testing Upbit Connection...");
    const client = new UpbitClient();

    try {
        console.log("Fetching BTC/KRW price...");
        const ticker = await client.getTicker('BTC/KRW');
        console.log(`✅ Success! Current BTC Price: ${ticker.price?.toLocaleString()} KRW`);

        console.log("\n💰 Checking Account Balance (Private API Test)...");
        const balance = await client.getBalance();
        if (balance) {
            const krw = balance['KRW']?.free || 0;
            console.log(`✅ Authentication Successful! KRW Balance: ${krw.toLocaleString()} KRW`);
        } else {
            console.log("⚠️ Balance check returned null (Check API permissions)");
        }
    } catch (e) {
        console.error("❌ Connection Failed:", e);
    }
}

main();
