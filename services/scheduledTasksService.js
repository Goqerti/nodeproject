// services/scheduledTasksService.js
const cron = require('node-cron');
const fileStore = require('./fileStore');
const telegram = require('./telegramService');

// --- Köməkçi Funksiyalar ---
const calculateGelir = (order) => {
    const alishAmount = order.alish?.amount || 0;
    const satishAmount = order.satish?.amount || 0;
    if (order.alish?.currency === order.satish?.currency) {
        return { amount: parseFloat((satishAmount - alishAmount).toFixed(2)), currency: order.satish.currency };
    }
    return { amount: 0, currency: 'N/A' };
};

const getTodayDateString = () => new Date().toISOString().split('T')[0];

// --- Planlanmış Tapşırıqlar ---

/**
 * Hər gün saat 19:00-da gündəlik xülasəni Telegram-a göndərir.
 */
const scheduleDailySummary = () => {
    // Hər gün saat 19:00 üçün planlama (Bakı vaxtı ilə)
    cron.schedule('0 19 * * *', () => {
        console.log('Running daily summary task...');
        const todayStr = getTodayDateString();
        const allOrders = fileStore.getOrders();
        const allExpenses = fileStore.getExpenses();

        const todaysOrders = allOrders.filter(o => o.creationTimestamp.startsWith(todayStr));
        const todaysExpenses = allExpenses.filter(e => e.creationTimestamp.startsWith(todayStr));

        let totalSales = { AZN: 0, USD: 0, EUR: 0 };
        todaysOrders.forEach(o => {
            if (o.satish?.currency) {
                totalSales[o.satish.currency] += o.satish.amount;
            }
        });

        let totalExpenses = { AZN: 0, USD: 0, EUR: 0 };
        todaysExpenses.forEach(e => {
            if (e.currency) {
                totalExpenses[e.currency] += e.totalAmount;
            }
        });

        const salesText = Object.entries(totalSales).map(([c, a]) => `${a.toFixed(2)} ${c}`).join(' / ');
        const expensesText = Object.entries(totalExpenses).map(([c, a]) => `${a.toFixed(2)} ${c}`).join(' / ');

        const message = `
📊 **Gündəlik Xülasə (${new Date().toLocaleDateString('az-AZ')})** 📊
-----------------------------------
- Yeni Sifarişlərin Sayı: *${todaysOrders.length}*
- Ümumi Satış Dövriyyəsi: *${salesText}*
- Ümumi İnzibati Xərclər: *${expensesText}*
-----------------------------------
        `;
        telegram.sendSimpleMessage(message);
    }, {
        scheduled: true,
        timezone: "Asia/Baku"
    });
};

/**
 * Hər gün saat 09:30-da borc xatırlatmalarını yoxlayır və göndərir.
 */
const scheduleDebtReminders = () => {
    // Hər gün saat 09:30 üçün planlama (Bakı vaxtı ilə)
    cron.schedule('30 9 * * *', () => {
        console.log('Running debt reminder task...');
        const allOrders = fileStore.getOrders();
        const today = new Date();
        const reminderDate = new Date();
        reminderDate.setDate(today.getDate() + 3); // 3 gün sonrakı tarix

        const reminderDateString = reminderDate.toISOString().split('T')[0];

        const dueDebts = allOrders.filter(o => 
            o.paymentDueDate === reminderDateString &&
            (!o.paymentStatus || o.paymentStatus === 'Ödənilməyib')
        );

        if (dueDebts.length > 0) {
            let message = "🔔 **Borc Xatırlatmaları (3 gün sonra):**\n";
            dueDebts.forEach(debt => {
                message += `\n- **Şirkət:** ${debt.xariciSirket}\n  **Sifariş №:** ${debt.satisNo}\n  **Məbləğ:** ${debt.satish.amount.toFixed(2)} ${debt.satish.currency}\n`;
            });
            telegram.sendSimpleMessage(message);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Baku"
    });
};


/**
 * Bütün planlanmış tapşırıqları başladır.
 */
const startAllTasks = () => {
    scheduleDailySummary();
    scheduleDebtReminders();
    console.log("✅ All scheduled tasks have been initialized.");
};

module.exports = { startAllTasks };
