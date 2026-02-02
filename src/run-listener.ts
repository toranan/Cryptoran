require('dotenv').config();
import { NewsListener } from './agent/news-listener';

async function main() {
    console.log("🚀 Starting Clawdbot News Listener...");

    const listener = new NewsListener();
    await listener.start();

    // Keep process alive
    setInterval(() => { }, 1000 * 60 * 60);
}

main().catch(console.error);
