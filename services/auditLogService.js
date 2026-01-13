// services/auditLogService.js
const fileStore = require('./fileStore');

/**
 * Sistemdə baş verən hər bir vacib əməliyyatı qeydə alır.
 * @param {object} req - Express request obyekti (istifadəçi məlumatını almaq üçün).
 * @param {string} action - Əməliyyatın qısa təsviri (məsələn, 'CREATE_ORDER', 'UPDATE_USER_PERMISSIONS').
 * @param {object} details - Əməliyyat haqqında əlavə məlumatlar (məsələn, sifariş nömrəsi, dəyişdirilən məlumat).
 */
const logAction = (req, action, details = {}) => {
    try {
        // Sessiyadan istifadəçi məlumatlarını götürürük.
        // Əgər sessiya yoxdursa (məsələn, permissions.html-dən gələn sorğu), istifadəçini "System/Owner" kimi qeyd edirik.
        const user = req.session?.user || { displayName: 'Owner (Sessiyasız)', role: 'owner' };
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            user: user.displayName,
            role: user.role || 'N/A',
            action: action,
            details: details,
            ip: req.ip || req.connection?.remoteAddress // İstifadəçinin IP ünvanı
        };

        fileStore.appendToAuditLog(logEntry);
    } catch (error) {
        console.error("Audit log yazılarkən kritik xəta baş verdi:", error);
    }
};

module.exports = { logAction };
