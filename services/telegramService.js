// services/telegramService.js
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const fileStore = require('./fileStore');

const token = process.env.TELEGRAM_BOT_TOKEN;
const logChatId = process.env.TELEGRAM_LOG_CHAT_ID;
const backupChatId = process.env.TELEGRAM_BACKUP_CHAT_ID;
const ownerId = parseInt(process.env.TELEGRAM_OWNER_ID, 10);

let bot;

if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log('✅ Telegram Bot service is active and listening for messages.');
    bot.on('polling_error', (error) => console.error('error: [polling_error] %j', error));
} else {
    console.warn('⚠️ Telegram Bot service is not active because TELEGRAM_BOT_TOKEN is not configured.');
}

const sendLog = (message) => {
    if (bot && logChatId) {
        bot.sendMessage(logChatId, message, { parse_mode: 'HTML' }).catch(err => console.error("Telegram log göndərmə xətası:", err.message));
    }
};

const sendSimpleMessage = (message) => {
    if (bot && logChatId) {
        bot.sendMessage(logChatId, message, { parse_mode: 'Markdown' }).catch(err => console.error("Telegram sadə mesaj göndərmə xətası:", err.message));
    }
};

const formatLog = (user, action) => {
    const timestamp = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
    return `<b>🗓️ ${timestamp}</b>\n👤 <b>İstifadəçi:</b> ${user.displayName} (<i>${user.role}</i>)\n💬 <b>Əməliyyat:</b> ${action}`;
};

// YENİ FUNKSİYA: Telegram botuna göndərilən əmrləri və faylları idarə edir
const initializeBotListeners = () => {
    if (!bot) return;

    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text || msg.caption;
        
        if (!text) return;

        // Yalnız owner-in əmrlərini qəbul et
        if (msg.from.id !== ownerId) {
            if (text.startsWith('/')) {
                bot.sendMessage(chatId, "Bu əməliyyat üçün icazəniz yoxdur.");
            }
            return;
        }

        if (text.startsWith('/upload_sifarisler')) {
            if (msg.document) {
                const fileId = msg.document.file_id;
                const destinationPath = path.join(__dirname, '..', 'sifarişlər.txt');
                
                bot.downloadFile(fileId, path.dirname(destinationPath)).then(downloadedFilePath => {
                    // Telegram faylı müvəqqəti adla endirir, biz onu düzgün adla əvəz edirik
                    fs.renameSync(downloadedFilePath, destinationPath);
                    bot.sendMessage(chatId, "✅ `sifarişlər.txt` məlumat bazası uğurla yeniləndi! Dəyişikliklərin görünməsi üçün veb-səhifəni yeniləyin.");
                    console.log(`LOG: sifarişlər.txt updated via Telegram by owner.`);
                }).catch(err => {
                    bot.sendMessage(chatId, `❌ XƏTA: Fayl yadda saxlanılarkən problem yarandı: ${err.message}`);
                    console.error(err);
                });
            } else {
                bot.sendMessage(chatId, "Zəhmət olmasa, `/upload_sifarisler` əmrini `sifarişlər.txt` faylını göndərərkən 'caption' olaraq yazın.");
            }
        }
    });
};

module.exports = {
    bot,
    sendLog,
    sendSimpleMessage,
    formatLog,
    logChatId,
    backupChatId,
    initializeBotListeners
};
