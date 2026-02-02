import fs from 'fs';
import path from 'path';

export class TradeJournal {
    private journalFile = path.join(process.cwd(), 'trade_journal.md');

    log(action: string, symbol: string, price: number, reason: string) {
        const timestamp = new Date().toLocaleString();
        const entry = `
### ⏱️ ${timestamp} - ${action} ${symbol}
- **Price**: ${price.toLocaleString()} KRW
- **Reason**: ${reason}
---
`;
        fs.appendFileSync(this.journalFile, entry);
    }
}
