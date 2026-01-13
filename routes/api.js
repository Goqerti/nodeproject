// routes/api.js

const express = require('express');
const router = express.Router();

// Controller-lərin import edilməsi
const userController = require('../controllers/userController');
const permissionController = require('../controllers/permissionController');
const orderController = require('../controllers/orderController');
const musicController = require('../controllers/musicController');
const expenseController = require('../controllers/expenseController');
const partnerController = require('../controllers/partnerController');
const inventoryController = require('../controllers/inventoryController');
const transportController = require('../controllers/transportController');

// Middleware
const authMiddleware = require('../middleware/authMiddleware');
const { requireLogin, requireOwnerRole, requireFinanceOrOwner } = authMiddleware;

// ============================================================
// 1. PUBLIC ROUTES (Giriş tələb etməyən marşrutlar)
// ============================================================

router.post('/verify-owner', userController.verifyOwner);
router.post('/users/create', userController.createUser);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// --- İCAZƏLƏR SƏHİFƏSİ ÜÇÜN XÜSUSİ MARŞRUTLAR (Şifrə ilə işləyən) ---
// Bu marşrutlar permissions.html səhifəsində owner parolu ilə data çəkmək üçündür
router.post('/users/get-by-password', userController.getUsersByPassword);
router.put('/users/update-by-password/:usernameToUpdate', userController.updateUserByPassword);
router.post('/permissions/get-by-password', permissionController.getPermissionsByPassword);
router.put('/permissions/save-by-password', permissionController.savePermissionsByPassword);


// ============================================================
// 2. AUTHENTICATED ROUTES (Giriş tələb edən marşrutlar)
// ============================================================

// Bütün aşağıdakı marşrutlar üçün login vacibdir
router.use(requireLogin);

// --- User & Permissions (Sessiya əsaslı) ---
router.get('/user/me', userController.getCurrentUser);
router.get('/user/permissions', permissionController.getUserPermissions);
router.get('/permissions', requireOwnerRole, permissionController.getAllPermissions);
router.put('/permissions', requireOwnerRole, permissionController.updateAllPermissions);

// --- User Management (Owner only) ---
router.get('/users', requireOwnerRole, userController.getAllUsers);
router.put('/users/:username', requireOwnerRole, userController.updateUser);
router.delete('/users/:username', requireOwnerRole, userController.deleteUser);

// --- ORDERS (SİFARİŞLƏR) ---
router.get('/orders', orderController.getAllOrders);
router.post('/orders', orderController.createOrder);
router.put('/orders/:satisNo', orderController.updateOrder);
router.delete('/orders/:satisNo', orderController.deleteOrder);
router.put('/orders/:satisNo/note', orderController.updateOrderNote);
router.get('/orders/search/rez/:rezNomresi', orderController.searchOrderByRezNo);

// --- ARXİV SİSTEMİ ---
router.get('/orders/archive', orderController.getArchivedOrders);           // Arxivə baxış
router.post('/orders/archive-bulk', orderController.archiveMultipleOrders); // Toplu arxivləmə (Ctrl+O)
router.post('/orders/archive/:satisNo', orderController.archiveOrder);      // Tək arxivləmə
router.post('/orders/restore/:satisNo', orderController.restoreOrderFromArchive); // Arxivdən geri qaytarma

// --- HESABATLAR VƏ DATA ---
router.get('/reservations', orderController.getReservations);
router.get('/reports', orderController.getReports);
router.get('/reports/by-company', orderController.getOrdersByCompany);
router.get('/debts', orderController.getDebts);
router.get('/notifications', orderController.getNotifications);
// Sənəd yükləmə linkini yeniləmək üçün
router.put('/orders/:satisNo/confirmation', orderController.updateHotelConfirmation);

// --- EXPENSES (XƏRCLƏR) ---
router.get('/expenses', requireFinanceOrOwner, expenseController.getAllExpenses);
router.post('/expenses', requireFinanceOrOwner, expenseController.createExpense);
router.put('/expenses/:id', requireFinanceOrOwner, expenseController.updateExpense);
router.delete('/expenses/:id', requireFinanceOrOwner, expenseController.deleteExpense);
router.get('/expenses/filter', requireFinanceOrOwner, expenseController.getFilteredExpenses);

// --- INVENTORY (İNVENTAR) ---
router.get('/inventory', requireFinanceOrOwner, inventoryController.getAllItems);
router.post('/inventory', requireFinanceOrOwner, inventoryController.createItem);
router.put('/inventory/:id', requireFinanceOrOwner, inventoryController.updateItem);
router.delete('/inventory/:id', requireFinanceOrOwner, inventoryController.deleteItem);

// --- TRANSPORT ---
router.get('/transport', transportController.getAllPackages);
router.post('/transport', transportController.createPackage);
router.put('/transport/:id', transportController.updatePackage);
router.delete('/transport/:id', transportController.deletePackage);

// --- MUSIC ---
router.get('/music/play', musicController.playSong);

// --- PARTNYORLAR ---
router.get('/partners', partnerController.getAllPartners);
router.post('/partners', partnerController.createPartner);
router.put('/partners/:id', partnerController.updatePartner);
router.delete('/partners/:id', partnerController.deletePartner);

module.exports = router;