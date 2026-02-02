import fs from 'fs';
import path from 'path';

export interface WalletState {
    krw: number;
    btc: number;
    trades: number;
}

export class PaperWallet {
    private stateFile = path.join(process.cwd(), 'paper_wallet.json');
    private state: WalletState;

    constructor(initialKrw: number = 100000) {
        if (fs.existsSync(this.stateFile)) {
            this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        } else {
            this.state = {
                krw: initialKrw,
                btc: 0,
                trades: 0
            };
            this.save();
        }
    }

    getBalance() {
        return this.state;
    }

    buy(price: number, amountKrw: number) {
        if (this.state.krw < amountKrw) return false;

        const btcAmount = amountKrw / price;
        this.state.krw -= amountKrw;
        this.state.btc += btcAmount;
        this.state.trades++;
        this.save();
        return true;
    }

    sell(price: number, amountBtc: number) { // sell all if amountBtc is -1
        if (amountBtc === -1) amountBtc = this.state.btc;
        if (this.state.btc < amountBtc) return false;

        const krwAmount = amountBtc * price;
        this.state.btc -= amountBtc;
        this.state.krw += krwAmount;
        this.state.trades++;
        this.save();
        return true;
    }

    private save() {
        fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    }
}
