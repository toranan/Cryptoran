import { ClawdbotBrain } from './agent/brain';

async function main() {
    const brain = new ClawdbotBrain();

    // Simulate a check
    console.log("🤖 Starting Clawdbot Brain Simulation...");
    try {
        await brain.runCurrentAnalysis('BTC/KRW');
    } catch (e) {
        console.error("Brain Failure:", e);
    }
}

main();
