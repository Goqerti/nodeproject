// controllers/permissionController.js
const fileStore = require('../services/fileStore');
const telegram = require('../services/telegramService');
const bcrypt = require('bcrypt');
const { logAction } = require('../services/auditLogService');

exports.getUserPermissions = (req, res) => {
    const { username, role } = req.session.user;
    if (role === 'owner') {
        return res.json({ canEditOrder: true, canDeleteOrder: true, canEditFinancials: true });
    }
    const allPermissions = fileStore.getPermissions();
    res.json(allPermissions[username] || {});
};

exports.getAllPermissions = (req, res) => {
    if (!req.session.isOwnerVerified) {
        return res.status(403).json({ message: 'İcazələri görmək üçün Owner parolunu təsdiq etməlisiniz.' });
    }
    res.json(fileStore.getPermissions());
};

exports.updateAllPermissions = (req, res) => {
    if (!req.session.isOwnerVerified) {
        return res.status(403).json({ message: 'Bu əməliyyatı etmək üçün təsdiqlənməlisiniz.' });
    }
    const newPermissions = req.body;
    fileStore.savePermissions(newPermissions);
    logAction(req, 'UPDATE_ALL_PERMISSIONS', { details: 'Bütün istifadəçi icazələri yeniləndi.' });
    telegram.sendLog(telegram.formatLog(req.session.user, `bütün istifadəçilər üçün fərdi icazələri yenilədi.`));
    res.status(200).json({ message: 'İcazələr uğurla yadda saxlandı.' });
};

exports.getPermissionsByPassword = (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ message: 'Parol daxil edilməyib.' });
    }

    const users = fileStore.getUsers();
    const owner = Object.values(users).find(u => u.role === 'owner');

    if (!owner) {
        return res.status(500).json({ message: 'Sistemdə "Owner" tapılmadı.' });
    }

    if (bcrypt.compareSync(password, owner.password)) {
        const permissions = fileStore.getPermissions();
        res.status(200).json(permissions);
    } else {
        res.status(401).json({ message: 'Parol yanlışdır.' });
    }
};

exports.savePermissionsByPassword = (req, res) => {
    const { password, permissions } = req.body;

    if (!password || !permissions) {
        return res.status(400).json({ message: 'Parol və ya icazə məlumatları göndərilməyib.' });
    }

    const users = fileStore.getUsers();
    const owner = Object.values(users).find(u => u.role === 'owner');

    if (!owner) {
        return res.status(500).json({ message: 'Sistemdə "Owner" tapılmadı.' });
    }

    if (bcrypt.compareSync(password, owner.password)) {
        fileStore.savePermissions(permissions);
        
        // DÜZƏLİŞ BURADADIR: Sessiya olmadan log göndərmək üçün obyekt yaradırıq
        const ownerUsername = Object.keys(users).find(u => users[u].role === 'owner');
        const ownerUserObject = {
            username: ownerUsername,
            displayName: owner.displayName,
            role: 'owner'
        };

        // Audit log üçün də eyni məntiqi tətbiq edirik
        const pseudoReq = { session: { user: ownerUserObject }, ip: req.ip };
        logAction(pseudoReq, 'UPDATE_ALL_PERMISSIONS_BY_PASSWORD', { details: 'İcazələr parolla yeniləndi.' });
        
        telegram.sendLog(telegram.formatLog(ownerUserObject, `parol təsdiqi ilə bütün istifadəçilər üçün fərdi icazələri yenilədi.`));
        
        res.status(200).json({ message: 'İcazələr uğurla yadda saxlandı.' });
    } else {
        res.status(401).json({ message: 'Parol yanlışdır. Dəyişikliklər yadda saxlanılmadı.' });
    }
};
