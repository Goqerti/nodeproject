// controllers/recycleBinController.js
const fileStore = require('../services/fileStore');
const { logAction } = require('../services/auditLogService');
const telegram = require('../services/telegramService');

/**
 * Zibil qabındakı bütün elementləri (sifarişlər və xərclər) gətirir.
 */
exports.getDeletedItems = (req, res) => {
    try {
        const deletedOrders = fileStore.getDeletedOrders();
        const deletedExpenses = fileStore.getDeletedExpenses();
        res.json({ deletedOrders, deletedExpenses });
    } catch (error) {
        console.error("Silinmiş elementlər gətirilərkən xəta:", error);
        res.status(500).json({ message: "Silinmiş elementlər gətirilərkən xəta baş verdi." });
    }
};

/**
 * Silinmiş bir sifarişi bərpa edir.
 */
exports.restoreOrder = (req, res) => {
    try {
        const { satisNo } = req.params;
        let deletedOrders = fileStore.getDeletedOrders();
        const orderToRestore = deletedOrders.find(o => o.satisNo === satisNo);

        if (!orderToRestore) {
            return res.status(404).json({ message: "Bərpa üçün sifariş tapılmadı." });
        }

        // Sifarişi aktivlərə əlavə et
        let activeOrders = fileStore.getOrders();
        activeOrders.push(orderToRestore);
        fileStore.saveAllOrders(activeOrders);

        // Sifarişi silinənlərdən çıxar
        const remainingDeleted = deletedOrders.filter(o => o.satisNo !== satisNo);
        fileStore.saveAllDeletedOrders(remainingDeleted);

        const logMessage = `<b>№${satisNo}</b> nömrəli sifarişi zibil qabından bərpa etdi.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'RESTORE_ORDER', { satisNo });
        
        res.status(200).json({ message: `Sifariş №${satisNo} uğurla bərpa edildi.` });
    } catch (error) {
        console.error("Sifariş bərpa edilərkən xəta:", error);
        res.status(500).json({ message: "Sifariş bərpa edilərkən server xətası baş verdi." });
    }
};

/**
 * Silinmiş bir xərc paketini bərpa edir.
 */
exports.restoreExpense = (req, res) => {
    try {
        const { id } = req.params;
        let deletedExpenses = fileStore.getDeletedExpenses();
        const expenseToRestore = deletedExpenses.find(e => e.id === id);

        if (!expenseToRestore) {
            return res.status(404).json({ message: "Bərpa üçün xərc paketi tapılmadı." });
        }

        // Xərci aktivlərə əlavə et
        let activeExpenses = fileStore.getExpenses();
        activeExpenses.push(expenseToRestore);
        fileStore.saveAllExpenses(activeExpenses);

        // Xərci silinənlərdən çıxar
        const remainingDeleted = deletedExpenses.filter(e => e.id !== id);
        fileStore.saveAllDeletedExpenses(remainingDeleted);

        const logMessage = `<b>${expenseToRestore.totalAmount.toFixed(2)} ${expenseToRestore.currency}</b> məbləğində xərc paketini zibil qabından bərpa etdi.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'RESTORE_EXPENSE', { id });
        
        res.status(200).json({ message: "Xərc paketi uğurla bərpa edildi." });
    } catch (error) {
        console.error("Xərc paketi bərpa edilərkən xəta:", error);
        res.status(500).json({ message: "Xərc paketi bərpa edilərkən server xətası baş verdi." });
    }
};
