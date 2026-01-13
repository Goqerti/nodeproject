// controllers/transportController.js
const { v4: uuidv4 } = require('uuid');
const fileStore = require('../services/fileStore');
const { logAction } = require('../services/auditLogService');
const telegram = require('../services/telegramService');

/**
 * Bütün transport paketlərinin siyahısını gətirir.
 */
exports.getAllPackages = (req, res) => {
    try {
        const packages = fileStore.getTransportPackages();
        res.json(packages.sort((a, b) => new Date(b.creationTimestamp) - new Date(a.creationTimestamp)));
    } catch (error) {
        console.error("Transport paketləri gətirilərkən xəta:", error);
        res.status(500).json({ message: "Transport paketləri gətirilərkən xəta baş verdi." });
    }
};

/**
 * Yeni bir transport paketi yaradır və yadda saxlayır.
 */
exports.createPackage = (req, res) => {
    try {
        const packageData = req.body;
        if (!packageData.driverName || !packageData.destination) {
            return res.status(400).json({ message: "Sürücü adı və gediləcək yer mütləq daxil edilməlidir." });
        }
        const newPackage = {
            id: uuidv4(),
            creationTimestamp: new Date().toISOString(),
            createdBy: req.session.user.displayName,
            ...packageData
        };
        const allPackages = fileStore.getTransportPackages();
        allPackages.push(newPackage);
        fileStore.saveAllTransportPackages(allPackages);

        const logMessage = `yeni transport paketi yaratdı. Sürücü: <b>${newPackage.driverName}</b>, İstiqamət: <b>${newPackage.destination}</b>`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'CREATE_TRANSPORT_PACKAGE', { driver: newPackage.driverName, destination: newPackage.destination });
        
        res.status(201).json(newPackage);
    } catch (error) {
        console.error("Transport paketi yaradılarkən xəta:", error);
        res.status(500).json({ message: "Server xətası baş verdi." });
    }
};

/**
 * Mövcud transport paketini onun ID-sinə görə yeniləyir.
 */
exports.updatePackage = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};
    if (role !== 'owner' && !userPermissions.transport_canEdit) {
        return res.status(403).json({ message: "Transport paketini redaktə etməyə icazəniz yoxdur." });
    }

    try {
        const { id } = req.params;
        const updatedData = req.body;
        let allPackages = fileStore.getTransportPackages();
        const packageIndex = allPackages.findIndex(p => p.id === id);

        if (packageIndex === -1) {
            return res.status(404).json({ message: "Düzəliş üçün transport paketi tapılmadı." });
        }

        const originalPackage = allPackages[packageIndex];
        allPackages[packageIndex] = { ...originalPackage, ...updatedData, id: id };
        fileStore.saveAllTransportPackages(allPackages);

        logAction(req, 'UPDATE_TRANSPORT_PACKAGE', { id: id, driver: updatedData.driverName });
        res.status(200).json(allPackages[packageIndex]);
    } catch (error) {
        console.error("Transport paketi yenilənərkən xəta:", error);
        res.status(500).json({ message: "Server xətası baş verdi." });
    }
};

/**
 * Mövcud transport paketini onun ID-sinə görə silir.
 */
exports.deletePackage = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};
    if (role !== 'owner' && !userPermissions.transport_canDelete) {
        return res.status(403).json({ message: "Transport paketini silməyə icazəniz yoxdur." });
    }

    try {
        const { id } = req.params;
        let allPackages = fileStore.getTransportPackages();
        const packageToDelete = allPackages.find(p => p.id === id);

        if (!packageToDelete) {
            return res.status(404).json({ message: "Silinmək üçün transport paketi tapılmadı." });
        }

        const updatedPackages = allPackages.filter(p => p.id !== id);
        fileStore.saveAllTransportPackages(updatedPackages);

        logAction(req, 'DELETE_TRANSPORT_PACKAGE', { id: id, driver: packageToDelete.driverName });
        res.status(200).json({ message: "Transport paketi uğurla silindi." });
    } catch (error) {
        console.error("Transport paketi silinərkən xəta:", error);
        res.status(500).json({ message: "Server xətası baş verdi." });
    }
};
