import { UpbitClient } from './exchange/upbit';

async function checkServerBalance() {
    const upbit = new UpbitClient();
    try {
        const balances = await upbit.getBalances();
        console.log("💰 Server Balances:");
        balances.forEach(b => {
            console.log(`- ${b.currency}: ${b.balance}`);
        });
    } catch (e) {
        console.error(e);
    }
}
checkServerBalance();
