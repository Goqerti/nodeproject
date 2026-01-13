// services/telegramBackupService.js
const fs = require('fs');
const path = require('path');
const telegramService = require('./telegramService');

const bot = telegramService.bot;
const backupChatId = telegramService.backupChatId; // Yedəkləmə üçün xüsusi ID

// Yedəklənəcək faylların siyahısı
const filesToBackup = [
    { name: 'sifarişlər.txt', path: path.join(__dirname, '..', 'sifarişlər.txt') },
    { name: 'users.txt', path: path.join(__dirname, '..', 'users.txt') },
    { name: 'xərclər.txt', path: path.join(__dirname, '..', 'xərclər.txt') },
    { name: 'inventory.txt', path: path.join(__dirname, '..', 'inventory.txt') },
    { name: 'photo.txt', path: path.join(__dirname, '..', 'photo.txt') },
    { name: 'audit_log.txt', path: path.join(__dirname, '..', 'audit_log.txt') },
    { name: 'permissions.json', path: path.join(__dirname, '..', 'permissions.json') },
];

/**
 * Faylları bir-bir Telegram-a göndərən funksiya.
 */
const sendBackupFiles = () => {
    console.log('Running scheduled task: Sending backup files to Telegram...');

    const now = new Date();
    const caption = `🗓️ ${now.toLocaleDateString('az-AZ')} ⏰ ${now.toLocaleTimeString('az-AZ')} tarixli ehtiyat nüsxə.`;

    filesToBackup.forEach(fileInfo => {
        if (fs.existsSync(fileInfo.path)) {
            // Faylın məzmununun boş olub olmadığını yoxlayırıq
            const stats = fs.statSync(fileInfo.path);
            if (stats.size > 0) {
                bot.sendDocument(backupChatId, fileInfo.path, { caption: `${fileInfo.name} - ${caption}` })
                    .then(() => {
                        console.log(`✅ ${fileInfo.name} successfully sent to Backup Group.`);
                    })
                    .catch(error => {
                        console.error(`❌ Error sending ${fileInfo.name} to Backup Group:`, error.code, error.response?.body);
                    });
            } else {
                console.log(`⏩ Skipping empty file: ${fileInfo.name}`);
            }
        } else {
            console.warn(`⚠️ Backup warning: File not found at ${fileInfo.path}`);
        }
    });
};

/**
 * Planlanmış görevi başladan əsas funksiya.
 * @param {number} intervalMinutes - Göndərmə intervalı (dəqiqə ilə).
 */
const startBackupSchedule = (intervalMinutes = 3) => {
    if (!bot || !backupChatId) {
        console.warn('⚠️ Telegram Backup service is not active because bot token or backup chat ID is not configured.');
        return;
    }

    const intervalMilliseconds = intervalMinutes * 60 * 1000;
    
    // Server işə düşdükdə ilk yedəkləməni dərhal göndəririk
    sendBackupFiles(); 
    
    // Sonra müəyyən edilmiş interval ilə göndərməyə davam edirik
    setInterval(sendBackupFiles, intervalMilliseconds);

    console.log(`✅ Telegram Backup service is active. It will run every ${intervalMinutes} minutes.`);
};

module.exports = { startBackupSchedule };
