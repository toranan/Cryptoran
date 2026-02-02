require('dotenv').config();
import { UpbitClient } from './exchange/upbit';

async function main() {
    console.log("Testing Upbit Balance Fetch...");
    const client = new UpbitClient();
    try {
        const balance = await client.getBalance();
        console.log("✅ Balance Fetched:", JSON.stringify(balance, null, 2));
    } catch (e) {
        console.error("❌ Link Failed:", e);
    }
}

main();
