import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fork, ChildProcess } from 'child_process';
import cors from 'cors';
import { UpbitClient } from './exchange/upbit';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const upbit = new UpbitClient();

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());


// Global reference for cleanup
let listenerProcess: ChildProcess | null = null;
let scannerProcess: ChildProcess | null = null;

// Cleanup function to kill children
const cleanup = () => {
    console.log('\n🔴 Shutting down... Killing child processes...');
    if (listenerProcess) {
        listenerProcess.kill();
        listenerProcess = null;
    }
    if (scannerProcess) {
        scannerProcess.kill();
        scannerProcess = null;
    }
    process.exit(0);
};

// Handle termination signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

io.on('connection', async (socket) => {
    console.log('📱 Dashboard connected');
    socket.emit('status', listenerProcess ? 'running' : 'stopped');

    // Send initial balance
    const balance = await getUpbitBalance();
    console.log("💰 Sending Initial Balance:", balance);
    socket.emit('balance', balance);
});

// Broadcast balance every 5 seconds (faster update)
setInterval(async () => {
    const balance = await getUpbitBalance();
    // Only log if we have a valid fetch to avoid clutter
    if (balance.total > 0) process.stdout.write(`.`);
    io.emit('balance', balance);
}, 5000);

async function getUpbitBalance() {
    try {
        const bal = await upbit.getBalance();
        if (!bal) return { total: 0, change: 0 };

        // KRW balance. Upbit returns float strings usually, safe to parse.
        const krw = bal['KRW'] ? parseFloat(bal['KRW'].total) : 0;

        return {
            total: Math.floor(krw),
            change: 0 // Placeholder for PnL
        };
    } catch (e) {
        console.error("Balance fetch error:", e);
        return { total: 0, change: 0 };
    }
}

// Control Endpoints
app.post('/api/start', (req, res) => {
    if (listenerProcess) {
        return res.json({ status: 'already_running' });
    }

    console.log("🟢 Starting News Listener...");

    // Determine extension and args based on environment - ensures build compatibility
    const isTs = __filename.endsWith('.ts');
    const ext = isTs ? 'ts' : 'js';
    const execArgv = isTs ? ['-r', 'ts-node/register'] : [];

    try {
        listenerProcess = fork(path.join(__dirname, `run-listener.${ext}`), [], {
            execArgv
        });

        // Spawn the Market Scanner too!
        scannerProcess = fork(path.join(__dirname, `agent/market-scanner.${ext}`), [], {
            execArgv
        });

        listenerProcess.on('exit', () => {
            console.log("🔴 News Listener Stopped");
            listenerProcess = null;
            io.emit('status', 'stopped');

            // Kill scanner if listener dies
            if (scannerProcess) {
                scannerProcess.kill();
                scannerProcess = null;
            }
        });

        scannerProcess.on('message', (msg) => {
            // Forward scanner logs to console if needed
            console.log('[Scanner]:', msg);
        });

        io.emit('status', 'running');
        res.json({ status: 'started' });
    } catch (error) {
        console.error("Failed to start processes:", error);
        res.status(500).json({ error: 'Failed to start bot' });
    }
});

app.post('/api/stop', (req, res) => {
    console.log("🔴 Stopping All Bots...");
    if (listenerProcess) {
        listenerProcess.kill();
        listenerProcess = null;
    }
    if (scannerProcess) {
        scannerProcess.kill();
        scannerProcess = null;
        console.log("🔴 Market Scanner Stopped");
    }

    io.emit('status', 'stopped');
    res.json({ status: 'stopped' });
});

app.get('/api/status', (req, res) => {
    res.json({ status: listenerProcess ? 'running' : 'stopped' });
});

app.post('/api/news', (req, res) => {
    const { text, symbol, isImportant } = req.body;
    io.emit('news', { text, symbol, isImportant, time: new Date().toLocaleTimeString() });
    res.sendStatus(200);
});

app.post('/api/trade', (req, res) => {
    const { symbol, action, price, amount } = req.body;
    io.emit('trade', { symbol, action, price, amount, time: new Date().toLocaleTimeString() });
    setTimeout(async () => {
        const balance = await getUpbitBalance();
        io.emit('balance', balance);
    }, 1000);
    res.sendStatus(200);
});

// Test-only: place a real market buy with minimum amount (5000 KRW)
app.post('/api/test-buy', async (req, res) => {
    const { symbol, amount } = req.body || {};
    const market = symbol || 'KRW-BTC';
    const cost = typeof amount === 'number' ? amount : 5000;
    try {
        const order = await upbit.createMarketBuyOrder(market, cost);
        if (!order) {
            return res.status(400).json({ ok: false, error: 'order_failed_or_rejected', market, cost });
        }
        io.emit('trade', { symbol: market, action: 'BUY', price: 0, amount: cost, time: new Date().toLocaleTimeString() });
        return res.json({ ok: true, orderId: order.id || order.uuid, market, cost });
    } catch (e) {
        console.error('Test buy failed:', e);
        return res.status(500).json({ ok: false, error: e?.message || 'unknown_error', market, cost });
    }
});

const PORT = 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
});
