// middleware/authMiddleware.js

/**
 * Sorğunun API sorğusu olub-olmadığını yoxlayan köməkçi funksiya.
 * URL-in "/api/" ilə başlamasını və ya "Accept" başlığının "application/json" olmasını yoxlayır.
 */
const isApiRequest = (req) => {
    return req.originalUrl.startsWith('/api/') || (req.headers.accept && req.headers.accept.includes('application/json'));
};


/**
 * İstifadəçinin sistemə daxil olub-olmadığını yoxlayır.
 * Daxil olmayıbsa, API sorğuları üçün JSON xətası, digər hallarda giriş səhifəsinə yönləndirir.
 */
exports.requireLogin = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    
    if (isApiRequest(req)) {
        return res.status(401).json({ message: 'Sessiya bitib və ya giriş edilməyib.' });
    }
    
    return res.redirect('/login.html');
};

/**
 * İstifadəçinin rolunun "owner" olub-olmadığını yoxlayır.
 * İcazəsi yoxdursa, API sorğuları üçün JSON xətası, digər hallarda ana səhifəyə yönləndirir.
 */
exports.requireOwnerRole = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'owner') {
        return next();
    }

    if (isApiRequest(req)) {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə yalnız "Owner" icazəlidir.' });
    }
    
    return res.redirect('/');
};

/**
 * İstifadəçinin rolunun "finance" və ya "owner" olub-olmadığını yoxlayır.
 * İcazəsi yoxdursa, API sorğuları üçün JSON xətası, digər hallarda ana səhifəyə yönləndirir.
 */
exports.requireFinanceOrOwner = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'owner' || req.session.user.role === 'finance')) {
        return next();
    }

    if (isApiRequest(req)) {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    
    return res.redirect('/');
};
