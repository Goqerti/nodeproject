// controllers/expenseController.js
const { v4: uuidv4 } = require('uuid');
const fileStore = require('../services/fileStore');
const telegram = require('../services/telegramService');
const { logAction } = require('../services/auditLogService');

/**
 * Bütün xərc paketlərinin siyahısını gətirir.
 */
exports.getAllExpenses = (req, res) => {
    try {
        const expensePackages = fileStore.getExpenses();
        expensePackages.sort((a, b) => new Date(b.creationTimestamp) - new Date(a.creationTimestamp));
        res.json(expensePackages);
    } catch (error) {
        console.error("Xərc paketləri gətirilərkən xəta:", error);
        res.status(500).json({ message: "Xərc paketləri gətirilərkən daxili server xətası baş verdi." });
    }
};

/**
 * Yeni bir xərc paketi yaradır və yadda saxlayır.
 */
exports.createExpense = (req, res) => {
    try {
        const packageData = req.body;
        
        if (!packageData || !packageData.details) {
            return res.status(400).json({ message: "Paket məlumatları tam deyil." });
        }

        const newExpensePackage = {
            id: uuidv4(),
            totalAmount: parseFloat(packageData.totalAmount) || 0,
            currency: packageData.currency || 'AZN',
            details: packageData.details,
            createdBy: req.session.user.displayName,
            creationTimestamp: new Date().toISOString()
        };

        const allPackages = fileStore.getExpenses();
        allPackages.push(newExpensePackage);
        fileStore.saveAllExpenses(allPackages);
        
        const logMessage = `yeni xərc paketi (Ümumi: ${newExpensePackage.totalAmount.toFixed(2)} ${newExpensePackage.currency}) yaratdı.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'CREATE_EXPENSE_PACKAGE', { id: newExpensePackage.id, total: newExpensePackage.totalAmount });

        res.status(201).json(newExpensePackage);
    } catch (error) {
        console.error("Xərc paketi yaradılarkən xəta:", error);
        res.status(500).json({ message: "Xərc paketi yaradılarkən server xətası baş verdi." });
    }
};

/**
 * Mövcud xərc paketini onun ID-sinə görə yeniləyir.
 */
exports.updateExpense = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};
    if (role !== 'owner' && !userPermissions.finance_canEditExpenses) {
        return res.status(403).json({ message: "İnzibati xərclərə düzəliş etməyə icazəniz yoxdur." });
    }

    try {
        const { id } = req.params;
        const packageData = req.body;

        let allPackages = fileStore.getExpenses();
        const packageIndex = allPackages.findIndex(pkg => pkg.id === id);

        if (packageIndex === -1) {
            return res.status(404).json({ message: "Düzəliş üçün xərc paketi tapılmadı." });
        }

        const originalPackage = allPackages[packageIndex];
        allPackages[packageIndex] = {
            ...originalPackage,
            totalAmount: parseFloat(packageData.totalAmount) || originalPackage.totalAmount,
            currency: packageData.currency || originalPackage.currency,
            details: packageData.details || originalPackage.details,
            lastUpdatedBy: req.session.user.displayName,
            lastUpdatedTimestamp: new Date().toISOString()
        };

        fileStore.saveAllExpenses(allPackages);

        const logMessage = `xərc paketinə (ID: ${id}) düzəliş etdi.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'UPDATE_EXPENSE_PACKAGE', { id: id });

        res.status(200).json(allPackages[packageIndex]);
    } catch (error) {
        console.error("Xərc paketi yenilənərkən xəta:", error);
        res.status(500).json({ message: "Xərc paketi yenilənərkən daxili server xətası baş verdi." });
    }
};

/**
 * Mövcud xərc paketini onun ID-sinə görə silir.
 */
exports.deleteExpense = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};
    if (role !== 'owner' && !userPermissions.finance_canEditExpenses) {
        return res.status(403).json({ message: "İnzibati xərcləri silməyə icazəniz yoxdur." });
    }

    try {
        const { id } = req.params;
        let allPackages = fileStore.getExpenses();
        const packageToDelete = allPackages.find(pkg => pkg.id === id);

        if (!packageToDelete) {
            return res.status(404).json({ message: "Silinmək üçün xərc paketi tapılmadı." });
        }

        const updatedPackages = allPackages.filter(pkg => pkg.id !== id);
        fileStore.saveAllExpenses(updatedPackages);

        const logMessage = `xərc paketini (Ümumi: ${packageToDelete.totalAmount.toFixed(2)} ${packageToDelete.currency}) sildi.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'DELETE_EXPENSE_PACKAGE', { id: id });

        res.status(200).json({ message: "Xərc paketi uğurla silindi." });
    } catch (error) {
        console.error("Xərc paketi silinərkən xəta:", error);
        res.status(500).json({ message: "Xərc paketi silinərkən daxili server xətası baş verdi." });
    }
};

/**
 * Xərcləri kateqoriya və tarixə görə filtrləyir.
 */
exports.getFilteredExpenses = (req, res) => {
    try {
        const { category, month } = req.query;

        if (!category || !month) {
            return res.status(400).json({ message: "Kateqoriya və tarix seçilməlidir." });
        }

        const allPackages = fileStore.getExpenses();
        const filteredResults = [];

        allPackages.forEach(pkg => {
            if (pkg.creationTimestamp.startsWith(month)) {
                if (pkg.details && pkg.details[category]) {
                    const expenseItem = pkg.details[category];
                    if (expenseItem && expenseItem.amount > 0) {
                        filteredResults.push({
                            date: pkg.creationTimestamp,
                            amount: expenseItem.amount,
                            currency: pkg.currency,
                            comment: expenseItem.comment || 'Şərh yoxdur',
                            createdBy: pkg.createdBy
                        });
                    }
                }
            }
        });

        res.json(filteredResults);

    } catch (error) {
        console.error("Xərclər filtrlənərkən xəta:", error);
        res.status(500).json({ message: "Xərclər filtrlənərkən daxili server xətası baş verdi." });
    }
};
