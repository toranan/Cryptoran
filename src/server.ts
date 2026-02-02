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

let listenerProcess: ChildProcess | null = null;

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

    listenerProcess = fork(path.join(__dirname, 'run-listener.ts'), [], {
        execArgv: ['-r', 'ts-node/register']
    });

    // Spawn the Market Scanner too!
    const scannerProcess = fork(path.join(__dirname, 'agent/market-scanner.ts'), [], {
        execArgv: ['-r', 'ts-node/register']
    });

    // Store references (quick hack: we should manage a list of processes, but for now we link them)
    // We attach scanner to listenerProcess object strictly for killing reference, or just manage global
    // Let's make a global array.

    // Actually, let's keep it simple. We will kill all children on Stop.
    (global as any).scannerProcess = scannerProcess;

    listenerProcess.on('exit', () => {
        console.log("🔴 News Listener Stopped");
        listenerProcess = null;
        io.emit('status', 'stopped');

        // Kill scanner if listener dies
        if ((global as any).scannerProcess) {
            (global as any).scannerProcess.kill();
            (global as any).scannerProcess = null;
        }
    });

    scannerProcess.on('message', (msg) => {
        // Forward scanner logs to console if needed
        console.log('[Scanner]:', msg);
    });

    io.emit('status', 'running');
    res.json({ status: 'started' });
});

app.post('/api/stop', (req, res) => {
    console.log("🔴 Stopping All Bots...");
    if (listenerProcess) {
        listenerProcess.kill();
        listenerProcess = null;
    }
    if ((global as any).scannerProcess) {
        (global as any).scannerProcess.kill();
        (global as any).scannerProcess = null;
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

const PORT = 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
});
