require('dotenv').config();
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import * as readline from "readline";

const apiId = parseInt(process.env.TELEGRAM_API_ID || '');
const apiHash = process.env.TELEGRAM_API_HASH || '';
const stringSession = new StringSession(""); // Empty for first login

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function main() {
    console.log("🚀 Initializing Telegram Client...");

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () =>
            new Promise((resolve) => rl.question("📱 번호를 입력해주세요 (+8210...): ", resolve)),
        password: async () =>
            new Promise((resolve) => rl.question("🔑 2차 비밀번호가 있다면 입력 (없으면 엔터): ", resolve)),
        phoneCode: async () =>
            new Promise((resolve) => rl.question("📩 텔레그램으로 온 인증코드 입력: ", resolve)),
        onError: (err) => console.log(err),
    });

    console.log("✅ 로그인 성공!");
    console.log("🔐 세션 문자열(나중에 자동로그인용)을 저장합니다...");
    console.log(client.session.save()); // Save this string to .env if needed for persistence

    console.log("🔎 대화방 목록(ID 포함) 출력 중...");
    const dialogs = await client.getDialogs({});
    dialogs.forEach((d) => {
        const title = (d.title || d.name || "untitled").toString();
        const id = d.id?.toString();
        console.log(`- ${title}: ${id}`);
    });

    await client.sendMessage("me", { message: "👋 Clawdbot Listener Connected!" });
    console.log("✅ 'Saved Messages'로 테스트 메시지를 보냈습니다. 확인해보세요!");

    process.exit(0);
}

main();
