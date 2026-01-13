// controllers/userController.js
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const fileStore = require('../services/fileStore');
const telegram = require('../services/telegramService');
const { logAction } = require('../services/auditLogService');

// --- Mail Service Setup ---
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: parseInt(process.env.EMAIL_PORT || "587") === 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// --- Authentication ---
exports.login = (req, res) => {
    try {
        const { username, password } = req.body;
        const users = fileStore.getUsers();
        const user = users[username];

        if (user && bcrypt.compareSync(password, user.password)) {
            // Sessiya məlumatlarını təyin edirik
            req.session.user = { username, role: user.role, displayName: user.displayName };
            
            // Sessiyanı manual olaraq yadda saxlayırıq və sonra yönləndiririk
            req.session.save(err => {
                if (err) {
                    console.error("Sessiya yadda saxlanılarkən xəta:", err);
                    return res.redirect('/login.html?error=true');
                }

                logAction(req, 'LOGIN_SUCCESS');
                telegram.sendLog(telegram.formatLog(req.session.user, 'sistemə daxil oldu.'));

                if (user.role === 'finance') {
                    res.redirect('/finance.html');
                } else {
                    res.redirect('/');
                }
            });
            
        } else {
            console.warn(`Uğursuz giriş cəhdi: İstifadəçi adı - ${username}`);
            res.redirect('/login.html?error=true');
        }
    } catch (error) {
        console.error("Giriş zamanı kritik xəta:", error);
        res.redirect('/login.html?error=true');
    }
};

exports.logout = (req, res) => {
    if (req.session.user) {
        logAction(req, 'LOGOUT');
        telegram.sendLog(telegram.formatLog(req.session.user, 'sistemdən çıxış etdi.'));
    }
    req.session.destroy(err => {
        if (err) return res.redirect('/?logoutFailed=true');
        res.clearCookie('connect.sid');
        res.redirect('/login.html');
    });
};

exports.getCurrentUser = (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ message: 'İstifadəçi daxil olmayıb.' });
    }
};

// --- Password Reset ---
exports.forgotPassword = (req, res) => {
    const { username } = req.body;
    const users = fileStore.getUsers();
    const user = users[username];

    if (!user || !user.email) {
        return res.status(404).json({ message: "Bu istifadəçi adı ilə əlaqəli e-poçt ünvanı tapılmadı." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 dəqiqə
    req.session.otpData = { username, otp, expires };

    const mailOptions = {
        from: `"Azerweys Admin Panel" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Şifrə Sıfırlama Kodu',
        html: `<p>Salam, ${user.displayName}.</p><p>Şifrənizi sıfırlamaq üçün təsdiq kodunuz: <b>${otp}</b></p><p>Bu kod 10 dəqiqə ərzində etibarlıdır.</p>`
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("!!! MAIL GÖNDƏRMƏ XƏTASI !!!\n", error);
            return res.status(500).json({ message: "OTP kodu göndərilərkən xəta baş verdi." });
        }
        res.status(200).json({ message: `Təsdiq kodu ${user.email} ünvanına göndərildi.` });
    });
};

exports.resetPassword = (req, res) => {
    const { username, otp, newPassword } = req.body;
    const otpData = req.session.otpData;

    if (!otpData || otpData.username !== username || otpData.otp !== otp) {
        return res.status(400).json({ message: "OTP kod yanlışdır." });
    }
    if (Date.now() > otpData.expires) {
        return res.status(400).json({ message: "OTP kodunun vaxtı bitib." });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "Yeni şifrə ən az 6 simvoldan ibarət olmalıdır." });
    }

    try {
        const users = fileStore.getUsers();
        if (!users[username]) return res.status(404).json({ message: "İstifadəçi tapılmadı." });
        
        const salt = bcrypt.genSaltSync(10);
        users[username].password = bcrypt.hashSync(newPassword, salt);
        
        fileStore.saveAllUsers(users);
        
        delete req.session.otpData;
        
        logAction(req, 'PASSWORD_RESET', { user: username });
        telegram.sendLog(telegram.formatLog({displayName: username, role: users[username].role}, `mail vasitəsilə şifrəsini yenilədi.`));
        res.status(200).json({ message: "Şifrəniz uğurla yeniləndi." });

    } catch (error) {
        res.status(500).json({ message: "Şifrə yenilənərkən server xətası baş verdi." });
    }
};

// --- User Management ---

exports.verifyOwner = (req, res) => {
    try {
        const { password } = req.body;
        const users = fileStore.getUsers();
        const owner = Object.values(users).find(u => u.role === 'owner');
        
        if (!owner || !owner.password) {
            return res.status(500).json({ message: 'Sistemdə "Owner" tapılmadı və ya parolu təyin edilməyib.' });
        }
        
        if (bcrypt.compareSync(password, owner.password)) {
            req.session.isOwnerVerified = true;
            if (!req.session.user) {
                 const ownerUsername = Object.keys(users).find(u => users[u].role === 'owner');
                 req.session.user = { username: ownerUsername, role: 'owner', displayName: owner.displayName };
            }
            res.status(200).json({ success: true });
        } else {
            res.status(401).json({ message: 'Parol yanlışdır' });
        }
    } catch (error) {
        console.error("Owner təsdiqləmə zamanı xəta:", error);
        res.status(500).json({ message: "Owner təsdiqlənərkən daxili server xətası baş verdi." });
    }
};

exports.createUser = (req, res) => {
    try {
        if (!req.session.isOwnerVerified) {
            return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
        }
        const { username, password, displayName, email, role } = req.body;
        if (!username || !password || !displayName || !role || !email) {
            return res.status(400).json({ message: 'Bütün xanaları doldurun.' });
        }
    
        const users = fileStore.getUsers();
        if (users[username]) {
            return res.status(409).json({ message: 'Bu istifadəçi adı artıq mövcuddur.' });
        }
        fileStore.addUser({ username, password, displayName, email, role });

        const permissions = fileStore.getPermissions();
        if (!permissions[username]) {
            permissions[username] = { canEditOrder: false, canEditFinancials: false, canDeleteOrder: false };
            fileStore.savePermissions(permissions);
        }
        
        const logUser = req.session.user || { displayName: 'Owner (Panel)', role: 'owner' };
        logAction(req, 'CREATE_USER', { newUser: username, role: role });
        telegram.sendLog(telegram.formatLog(logUser, `<b>${displayName} (${role})</b> adlı yeni istifadəçi yaratdı.`));
        
        res.status(201).json({ message: 'Yeni istifadəçi uğurla yaradıldı!' });

    } catch (error) {
        console.error("İstifadəçi yaradarkən xəta:", error);
        res.status(500).json({ message: 'İstifadəçi yaradılarkən server xətası baş verdi.' });
    }
};

exports.getAllUsers = (req, res) => {
    try {
        const users = fileStore.getUsers();
        const safeUsers = Object.entries(users).map(([username, data]) => ({
            username,
            displayName: data.displayName,
            email: data.email,
            role: data.role
        }));
        res.json(safeUsers);
    } catch (error) {
        console.error("İstifadəçi siyahısı gətirilərkən xəta:", error);
        res.status(500).json({ message: "İstifadəçi siyahısı gətirilərkən daxili server xətası baş verdi." });
    }
};

exports.updateUser = (req, res) => {
    if (req.session.user?.role !== 'owner') {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    const { username } = req.params;
    const { displayName, email, role, newPassword } = req.body;

    try {
        let users = fileStore.getUsers();
        if (!users[username]) {
            return res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
        }

        users[username].displayName = displayName || users[username].displayName;
        users[username].email = email || users[username].email;
        users[username].role = role || users[username].role;

        if (newPassword && newPassword.length >= 6) {
            const salt = bcrypt.genSaltSync(10);
            users[username].password = bcrypt.hashSync(newPassword, salt);
        }
        
        fileStore.saveAllUsers(users);
        logAction(req, 'UPDATE_USER', { targetUser: username });
        telegram.sendLog(telegram.formatLog(req.session.user, `<b>${username}</b> adlı istifadəçinin məlumatlarını yenilədi.`));
        res.status(200).json({ message: 'İstifadəçi məlumatları yeniləndi.' });
    } catch (error) {
        res.status(500).json({ message: 'Server xətası baş verdi.' });
    }
};

exports.deleteUser = (req, res) => {
    if (req.session.user?.role !== 'owner') {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    const { username } = req.params;
    
    if (username === req.session.user.username) {
        return res.status(400).json({ message: 'Owner öz hesabını silə bilməz.' });
    }

    try {
        let users = fileStore.getUsers();
        if (!users[username]) {
            return res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
        }
        const deletedUserDisplayName = users[username].displayName;
        delete users[username];
        fileStore.saveAllUsers(users);
        logAction(req, 'DELETE_USER', { targetUser: username });
        telegram.sendLog(telegram.formatLog(req.session.user, `<b>${deletedUserDisplayName} (${username})</b> adlı istifadəçini sildi.`));
        res.status(200).json({ message: 'İstifadəçi silindi.' });
    } catch (error) {
        res.status(500).json({ message: 'Server xətası baş verdi.' });
    }
};

exports.getUsersByPassword = (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ message: 'Parol daxil edilməyib.' });
        }

        const allUsers = fileStore.getUsers();
        const owner = Object.values(allUsers).find(u => u.role === 'owner');

        if (!owner) {
            return res.status(500).json({ message: 'Sistemdə "Owner" tapılmadı.' });
        }

        if (bcrypt.compareSync(password, owner.password)) {
            const safeUsers = Object.entries(allUsers).map(([username, data]) => ({
                username,
                displayName: data.displayName,
                email: data.email,
                role: data.role
            }));
            res.status(200).json(safeUsers);
        } else {
            res.status(401).json({ message: 'Parol yanlışdır.' });
        }
    } catch (error) {
        console.error("getUsersByPassword xətası:", error);
        res.status(500).json({ message: "İstifadəçi məlumatları oxunarkən daxili server xətası baş verdi." });
    }
};

exports.updateUserByPassword = (req, res) => {
    const { ownerPassword, newUserData } = req.body;
    const { usernameToUpdate } = req.params;

    if (!ownerPassword || !newUserData || !usernameToUpdate) {
        return res.status(400).json({ message: "Bütün məlumatlar tam göndərilməyib." });
    }

    const allUsers = fileStore.getUsers();
    const owner = Object.values(allUsers).find(u => u.role === 'owner');

    if (!owner || !bcrypt.compareSync(ownerPassword, owner.password)) {
        return res.status(401).json({ message: "Owner parolu yanlışdır." });
    }

    if (!allUsers[usernameToUpdate]) {
        return res.status(404).json({ message: "Redaktə ediləcək istifadəçi tapılmadı." });
    }

    allUsers[usernameToUpdate].displayName = newUserData.displayName || allUsers[usernameToUpdate].displayName;
    allUsers[usernameToUpdate].email = newUserData.email || allUsers[usernameToUpdate].email;

    if (newUserData.newPassword && newUserData.newPassword.length >= 6) {
        const salt = bcrypt.genSaltSync(10);
        allUsers[usernameToUpdate].password = bcrypt.hashSync(newUserData.newPassword, salt);
    } else if (newUserData.newPassword && newUserData.newPassword.length > 0) {
        return res.status(400).json({ message: "Yeni şifrə ən az 6 simvoldan ibarət olmalıdır." });
    }

    fileStore.saveAllUsers(allUsers);
    
    const logUser = req.session.user || { displayName: 'Owner (Panel)', role: 'owner' };
    const logMessage = `<b>${usernameToUpdate}</b> adlı istifadəçinin məlumatlarını yenilədi.`;
    telegram.sendLog(telegram.formatLog(logUser, logMessage));
    logAction(req, 'UPDATE_USER_BY_PASSWORD', { targetUser: usernameToUpdate });

    res.status(200).json({ message: "İstifadəçi məlumatları uğurla yeniləndi." });
};
