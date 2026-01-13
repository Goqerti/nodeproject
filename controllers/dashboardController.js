// controllers/dashboardController.js
const fileStore = require('../services/fileStore');
const { logAction } = require('../services/auditLogService');

// Bütün valyutaları bir yerdə saxlayaq
const CURRENCIES = ['AZN', 'USD', 'EUR'];

// Hesabat üçün ilkin struktur yaradan köməkçi funksiya
const createSummaryObject = () => {
    const summary = {};
    CURRENCIES.forEach(currency => {
        summary[currency] = 0;
    });
    return summary;
};

exports.getSummary = (req, res) => {
    try {
        const { month } = req.query; // Format: YYYY-MM
        
        const capital = fileStore.getCapital() || { amount: 0, currency: "AZN" };
        let orders = fileStore.getOrders();
        let expenses = fileStore.getExpenses();

        // Əgər ay seçilibsə, məlumatları həmin aya görə filtrləyirik
        if (month) {
            orders = orders.filter(o => o.creationTimestamp && o.creationTimestamp.startsWith(month));
            expenses = expenses.filter(e => e.creationTimestamp && e.creationTimestamp.startsWith(month));
        }

        const totalIncome = createSummaryObject();
        const totalOrderExpenses = createSummaryObject();
        const totalAdminExpenses = createSummaryObject();
        const totalExpenses = createSummaryObject();
        const netProfit = createSummaryObject();
        const finalBalance = createSummaryObject();

        // Sifarişlərdən gələn gəlir və xərcləri hesablayırıq
        orders.forEach(order => {
            if (order.satish && order.satish.currency && totalIncome[order.satish.currency] !== undefined) {
                totalIncome[order.satish.currency] += (order.satish.amount || 0);
            }
            if (order.alish && order.alish.currency && totalOrderExpenses[order.alish.currency] !== undefined) {
                totalOrderExpenses[order.alish.currency] += (order.alish.amount || 0);
            }
        });

        // İnzibati xərcləri hesablayırıq
        expenses.forEach(pkg => {
            if (pkg.currency && totalAdminExpenses[pkg.currency] !== undefined) {
                totalAdminExpenses[pkg.currency] += (pkg.totalAmount || 0);
            }
        });
        
        // Yekun hesablamalar
        CURRENCIES.forEach(currency => {
            totalExpenses[currency] = totalOrderExpenses[currency] + totalAdminExpenses[currency];
            netProfit[currency] = totalIncome[currency] - totalExpenses[currency];
            finalBalance[currency] = netProfit[currency];
        });

        // Başlanğıc mayanı yalnız öz valyutasına əlavə edirik
        if (finalBalance[capital.currency] !== undefined) {
            finalBalance[capital.currency] += capital.amount;
        }

        res.json({
            capital,
            totalIncome,
            totalExpenses,
            netProfit,
            finalBalance
        });

    } catch (error) {
        console.error("Maliyyə paneli xətası:", error);
        res.status(500).json({ message: "Maliyyə paneli məlumatları gətirilərkən xəta baş verdi." });
    }
};

exports.updateCapital = (req, res) => {
    try {
        const { amount, currency } = req.body;
        if (typeof amount === 'undefined' || !currency) {
            return res.status(400).json({ message: "Məbləğ və valyuta tələb olunur." });
        }
        
        const capitalData = {
            amount: parseFloat(amount) || 0,
            currency
        };
        
        fileStore.saveCapital(capitalData);
        logAction(req, 'UPDATE_CAPITAL', { amount: capitalData.amount, currency: capitalData.currency });
        res.status(200).json({ message: "Başlanğıc maya uğurla yeniləndi." });
    } catch (error) {
        console.error("Maya yenilənərkən xəta:", error);
        res.status(500).json({ message: "Server xətası baş verdi." });
    }
};
