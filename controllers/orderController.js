// controllers/orderController.js

const fileStore = require('../services/fileStore');
const telegram = require('../services/telegramService');
const { logAction } = require('../services/auditLogService');
const fs = require('fs');
const path = require('path');

// Arxiv faylının yolu
const archiveFilePath = path.join(__dirname, '../sifarişlər_archive.txt');

// --- Köməkçi Funksiyalar ---

const calculateGelir = (order) => {
    const alishAmount = order.alish?.amount || 0;
    const satishAmount = order.satish?.amount || 0;
    if (order.alish?.currency === order.satish?.currency) {
        return { amount: parseFloat((satishAmount - alishAmount).toFixed(2)), currency: order.satish.currency };
    }
    return { amount: 0, currency: 'N/A', note: 'Fərqli valyutalar' };
};

const formatChanges = (original, updated) => {
    const changes = [];
    const fieldsToTrack = {
        status: "Status",
        xariciSirket: "Xarici şirkət",
        rezNomresi: "Rez. nömrəsi",
        paymentStatus: "Ödəniş statusu"
    };
    
    // Turistləri müqayisə et
    const originalTouristsStr = Array.isArray(original.tourists) ? original.tourists.join(', ') : (original.turist || '');
    const updatedTouristsStr = Array.isArray(updated.tourists) ? updated.tourists.join(', ') : (updated.turist || '');
    
    if (originalTouristsStr !== updatedTouristsStr) {
        changes.push(`- <i>Turistlər</i>: '${originalTouristsStr}' -> '${updatedTouristsStr}'`);
    }
    
    // Digər sahələri müqayisə et
    for (const key in fieldsToTrack) {
        if (original[key] !== updated[key]) {
            changes.push(`- <i>${fieldsToTrack[key]}</i>: '${original[key] || ""}' -> '${updated[key] || ""}'`);
        }
    }
    
    // Qiymətlər
    const originalAlish = `${(original.alish?.amount || 0).toFixed(2)} ${original.alish?.currency || ''}`;
    const updatedAlish = `${(updated.alish?.amount || 0).toFixed(2)} ${updated.alish?.currency || ''}`;
    if (originalAlish !== updatedAlish) changes.push(`- <i>Alış qiyməti</i>: '${originalAlish}' -> '${updatedAlish}'`);

    const originalSatish = `${(original.satish?.amount || 0).toFixed(2)} ${original.satish?.currency || ''}`;
    const updatedSatish = `${(updated.satish?.amount || 0).toFixed(2)} ${updated.satish?.currency || ''}`;
    if (originalSatish !== updatedSatish) changes.push(`- <i>Satış qiyməti</i>: '${originalSatish}' -> '${updatedSatish}'`);

    return changes.length > 0 ? `\n<b>Dəyişikliklər:</b>\n${changes.join('\n')}` : '';
};

const ensurePaymentDetails = (order) => {
    if (!order.paymentDetails) order.paymentDetails = {};
    const details = order.paymentDetails;
    
    details.hotels = (order.hotels || []).map(h => {
        const existing = details.hotels?.find(hd => hd.name === h.otelAdi);
        return { name: h.otelAdi, paid: existing?.paid || false, receiptPath: h.confirmationPath || existing?.receiptPath || null };
    });
    
    if (!details.transport) details.transport = { paid: false, receiptPath: null };
    
    const costKeys = ['paket', 'beledci', 'muzey', 'viza', 'diger'];
    if (!details.detailedCosts) details.detailedCosts = {};
    costKeys.forEach(key => {
        if (!details.detailedCosts[key]) details.detailedCosts[key] = { paid: false, receiptPath: null };
    });
    return order;
};

// --- Controller Funksiyaları ---

exports.getAllOrders = (req, res) => {
    try {
        const orders = fileStore.getOrders().map(ensurePaymentDetails);
        res.json(orders.map(o => ({ ...o, gelir: calculateGelir(o) })));
    } catch (error) {
        console.error("Sifarişlər gətirilərkən xəta:", error);
        res.status(500).json({ message: "Server xətası." });
    }
};

exports.createOrder = (req, res) => {
    try {
        const newOrderData = req.body;
        
        // Turist yoxlanışı (həm array, həm string dəstəyi)
        if ((!newOrderData.tourists || !newOrderData.tourists.length) && !newOrderData.turist) {
             return res.status(400).json({ message: 'Turist adları daxil edilməlidir.' });
        }
        
        const orders = fileStore.getOrders();
        let nextSatisNo = 1695;
        if (orders.length > 0) {
            const maxSatisNo = Math.max(...orders.map(o => parseInt(o.satisNo)).filter(num => !isNaN(num)), 0);
            nextSatisNo = maxSatisNo >= 1695 ? maxSatisNo + 1 : 1695;
        }
        
        let orderToSave = {
            satisNo: String(nextSatisNo),
            creationTimestamp: new Date().toISOString(),
            createdBy: req.session.user.displayName,
            ...newOrderData,
            paymentStatus: newOrderData.paymentStatus || 'Ödənilməyib',
            paymentDueDate: newOrderData.paymentDueDate || null,
        };
        
        // Legacy support: turist string sahəsini də doldururuq
        if(orderToSave.tourists && orderToSave.tourists.length > 0) {
            orderToSave.turist = orderToSave.tourists[0];
        } else if (orderToSave.turist) {
            orderToSave.tourists = [orderToSave.turist];
        }
        
        orderToSave = ensurePaymentDetails(orderToSave);
        
        orders.push(orderToSave);
        fileStore.saveAllOrders(orders);
        
        const gelir = calculateGelir(orderToSave);
        if (gelir.amount < 0) {
            telegram.sendSimpleMessage(`🔴 **DİQQƏT: MƏNFİ GƏLİR!**\nİstifadəçi *${req.session.user.displayName}* tərəfindən yaradılan №${orderToSave.satisNo} sifariş mənfi gəlirlə (${gelir.amount.toFixed(2)} ${gelir.currency}) yadda saxlanıldı!`);
        }
        
        const primaryTourist = (orderToSave.tourists && orderToSave.tourists[0]) || orderToSave.turist;
        telegram.sendLog(telegram.formatLog(req.session.user, `yeni sifariş (№${orderToSave.satisNo}) yaratdı: <b>${primaryTourist}</b>`));
        logAction(req, 'CREATE_ORDER', { satisNo: orderToSave.satisNo, tourist: primaryTourist });
        
        res.status(201).json({ ...orderToSave, gelir });
    } catch (error) {
        console.error("Sifariş yaradılarkən xəta:", error);
        res.status(500).json({ message: 'Serverdə daxili xəta baş verdi.' });
    }
};

exports.updateOrder = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {}; 
    
    if (role !== 'owner' && !userPermissions.canEditOrder) {
        return res.status(403).json({ message: 'Sifarişi redaktə etməyə icazəniz yoxdur.' });
    }
    
    try {
        const { satisNo } = req.params;
        const updatedOrderData = req.body;
        let orders = fileStore.getOrders();
        const orderIndex = orders.findIndex(o => String(o.satisNo) === String(satisNo));
        
        if (orderIndex === -1) return res.status(404).json({ message: `Sifariş (${satisNo}) tapılmadı.` });
        
        const originalOrder = { ...orders[orderIndex] };
        let orderToUpdate = { ...orders[orderIndex] };
        
        const canEditFinancials = role === 'owner' || userPermissions.canEditFinancials;
        if (!canEditFinancials) {
            delete updatedOrderData.alish;
            delete updatedOrderData.satish;
            delete updatedOrderData.detailedCosts;
        }
        
        Object.assign(orderToUpdate, updatedOrderData);
        
        // Legacy support update
        if(orderToUpdate.tourists && orderToUpdate.tourists.length > 0) {
            orderToUpdate.turist = orderToUpdate.tourists[0];
        }

        orders[orderIndex] = orderToUpdate;
        fileStore.saveAllOrders(orders);
        
        const changesText = formatChanges(originalOrder, orderToUpdate);
        let telegramMessage = `sifarişə (№${satisNo}) düzəliş etdi.`;
        if (changesText) telegramMessage += changesText;
        
        telegram.sendLog(telegram.formatLog(req.session.user, telegramMessage));
        logAction(req, 'UPDATE_ORDER', { satisNo: satisNo, changes: changesText.replace(/<\/?b>|<\/?i>/g, '') });

        res.status(200).json({ message: 'Sifariş uğurla yeniləndi.'});
    } catch (error) {
        console.error("Sifariş yenilənərkən xəta:", error);
        res.status(500).json({ message: 'Serverdə daxili xəta baş verdi.' });
    }
};

exports.deleteOrder = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};
    
    if (role !== 'owner' && !userPermissions.canDeleteOrder) {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    try {
        let orders = fileStore.getOrders();
        const orderToDelete = orders.find(o => String(o.satisNo) === req.params.satisNo);
        if (!orderToDelete) return res.status(404).json({ message: `Sifariş tapılmadı.` });
        
        const updatedOrders = orders.filter(order => String(order.satisNo) !== req.params.satisNo);
        fileStore.saveAllOrders(updatedOrders);

        const primaryTourist = (orderToDelete.tourists && orderToDelete.tourists[0]) || orderToDelete.turist;
        telegram.sendLog(telegram.formatLog(req.session.user, `sifarişi (№${orderToDelete.satisNo}) sildi.`));
        logAction(req, 'DELETE_ORDER', { satisNo: orderToDelete.satisNo, tourist: primaryTourist });

        res.status(200).json({ message: `Sifariş uğurla silindi.` });
    } catch (error) {
        console.error("Sifariş silinərkən xəta:", error);
        res.status(500).json({ message: 'Sifariş silinərkən xəta.' });
    }
};

// --- ARXİVLƏMƏ FUNKSİYALARI ---

// 1. Tək Sifarişi Arxivləmək
exports.archiveOrder = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};
    
    if (role !== 'owner' && !userPermissions.canArchiveOrder) {
         return res.status(403).json({ message: 'Sifarişi arxivləmək üçün icazəniz yoxdur.' });
    }

    try {
        const { satisNo } = req.params;
        let orders = fileStore.getOrders();
        
        const orderIndex = orders.findIndex(o => String(o.satisNo) === String(satisNo));
        if (orderIndex === -1) return res.status(404).json({ message: "Sifariş tapılmadı" });

        const orderToArchive = orders[orderIndex];

        const updatedOrders = orders.filter(o => String(o.satisNo) !== String(satisNo));
        fileStore.saveAllOrders(updatedOrders);

        let archiveData = [];
        if (fs.existsSync(archiveFilePath)) {
            const content = fs.readFileSync(archiveFilePath, 'utf8');
            archiveData = content ? JSON.parse(content) : [];
        }

        orderToArchive.archivedAt = new Date().toISOString();
        orderToArchive.archivedBy = username;
        archiveData.push(orderToArchive);
        
        fs.writeFileSync(archiveFilePath, JSON.stringify(archiveData, null, 2), 'utf8');

        telegram.sendLog(telegram.formatLog(req.session.user, `sifarişi (№${satisNo}) arxivə göndərdi.`));
        logAction(req, 'ARCHIVE_ORDER', { satisNo: satisNo });

        res.json({ success: true, message: "Sifariş arxivləndi!" });
    } catch (error) {
        console.error("Arxivləmə xətası:", error);
        res.status(500).json({ success: false, message: "Xəta baş verdi" });
    }
};

// 2. Toplu Arxivləmək (Ctrl+O)
exports.archiveMultipleOrders = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};

    if (role !== 'owner' && !userPermissions.canArchiveOrder) {
        return res.status(403).json({ message: 'Arxivləmək üçün icazəniz yoxdur.' });
    }

    try {
        const { satisNos } = req.body;
        if (!Array.isArray(satisNos) || satisNos.length === 0) {
            return res.status(400).json({ message: "Sifariş seçilməyib." });
        }

        let orders = fileStore.getOrders();
        let archiveData = [];
        if (fs.existsSync(archiveFilePath)) {
            const content = fs.readFileSync(archiveFilePath, 'utf8');
            archiveData = content ? JSON.parse(content) : [];
        }

        let archivedCount = 0;
        const ordersToArchive = orders.filter(o => satisNos.includes(String(o.satisNo)));
        
        ordersToArchive.forEach(order => {
            order.archivedAt = new Date().toISOString();
            order.archivedBy = username;
            archiveData.push(order);
            archivedCount++;
        });

        const updatedOrders = orders.filter(o => !satisNos.includes(String(o.satisNo)));
        
        fileStore.saveAllOrders(updatedOrders);
        fs.writeFileSync(archiveFilePath, JSON.stringify(archiveData, null, 2), 'utf8');

        telegram.sendLog(telegram.formatLog(req.session.user, `toplu şəkildə <b>${archivedCount}</b> sifarişi arxivə göndərdi.`));
        logAction(req, 'BULK_ARCHIVE', { count: archivedCount });

        res.json({ success: true, message: `${archivedCount} sifariş arxivləndi.` });
    } catch (error) {
        console.error("Toplu arxiv xətası:", error);
        res.status(500).json({ success: false, message: "Server xətası." });
    }
};

// 3. Arxivdən Geri Qaytarmaq (Restore)
exports.restoreOrderFromArchive = (req, res) => {
    const { username, role } = req.session.user;
    const userPermissions = fileStore.getPermissions()[username] || {};
    
    if (role !== 'owner' && !userPermissions.canArchiveOrder) {
         return res.status(403).json({ message: 'Bu əməliyyat üçün icazəniz yoxdur.' });
    }

    try {
        const { satisNo } = req.params;
        let archiveData = [];
        if (fs.existsSync(archiveFilePath)) {
            const content = fs.readFileSync(archiveFilePath, 'utf8');
            archiveData = content ? JSON.parse(content) : [];
        }

        const orderIndex = archiveData.findIndex(o => String(o.satisNo) === String(satisNo));
        if (orderIndex === -1) return res.status(404).json({ message: "Sifariş arxivdə tapılmadı." });

        const orderToRestore = archiveData[orderIndex];
        let activeOrders = fileStore.getOrders();
        
        if (activeOrders.some(o => String(o.satisNo) === String(satisNo))) {
            return res.status(400).json({ message: "Bu sifariş artıq aktiv siyahıda mövcuddur." });
        }

        delete orderToRestore.archivedAt;
        delete orderToRestore.archivedBy;

        activeOrders.push(orderToRestore);
        fileStore.saveAllOrders(activeOrders);

        archiveData.splice(orderIndex, 1);
        fs.writeFileSync(archiveFilePath, JSON.stringify(archiveData, null, 2), 'utf8');

        telegram.sendLog(telegram.formatLog(req.session.user, `sifarişi (№${satisNo}) arxivdən geri qaytardı.`));
        logAction(req, 'RESTORE_ORDER', { satisNo });

        res.json({ success: true, message: "Sifariş arxivdən geri qaytarıldı." });
    } catch (error) {
        console.error("Geri qaytarma xətası:", error);
        res.status(500).json({ success: false, message: "Xəta baş verdi." });
    }
};

exports.getArchivedOrders = (req, res) => {
    if (!fs.existsSync(archiveFilePath)) return res.json([]);
    const data = fs.readFileSync(archiveFilePath, 'utf8');
    try {
        res.json(JSON.parse(data || '[]'));
    } catch {
        res.json([]);
    }
};

// --- DIGƏR ---

exports.updateOrderNote = (req, res) => {
    try {
        const { satisNo } = req.params;
        const { qeyd } = req.body;
        let orders = fileStore.getOrders();
        const orderIndex = orders.findIndex(o => String(o.satisNo) === String(satisNo));
        if (orderIndex === -1) return res.status(404).json({ message: "Tapılmadı" });
        
        orders[orderIndex].qeyd = qeyd || '';
        fileStore.saveAllOrders(orders);
        res.status(200).json({ message: "Qeyd yeniləndi." });
    } catch (error) {
        res.status(500).json({ message: "Xəta." });
    }
};

exports.searchOrderByRezNo = (req, res) => {
    try {
        const { rezNomresi } = req.params;
        const orders = fileStore.getOrders();
        const order = orders.find(o => String(o.rezNomresi).toLowerCase() === String(rezNomresi).toLowerCase());
        if (order) res.json({...order, gelir: calculateGelir(order)}); 
        else res.status(404).json({ message: "Tapılmadı" });
    } catch (error) {
        res.status(500).json({ message: "Xəta." });
    }
};

exports.getReservations = (req, res) => {
    try {
        const activeOrders = fileStore.getOrders().filter(order => order.status === 'Davam edir' || !order.status);
        let allReservations = [];
        activeOrders.forEach(order => {
            const primaryTourist = (order.tourists && order.tourists[0]) || order.turist || '-';
            if (Array.isArray(order.hotels)) {
                order.hotels.forEach(hotel => {
                    if (hotel.otelAdi && hotel.girisTarixi) {
                        allReservations.push({
                            satisNo: order.satisNo,
                            turist: primaryTourist,
                            otelAdi: hotel.otelAdi,
                            girisTarixi: hotel.girisTarixi,
                            cixisTarixi: hotel.cixisTarixi,
                            adultGuests: order.adultGuests || 0,
                            childGuests: order.childGuests || 0,
                        });
                    }
                });
            }
        });
        res.json(allReservations);
    } catch (error) {
        res.status(500).json({ message: "Xəta." });
    }
};

exports.getReports = (req, res) => {
    try {
        const report = { totalAlish: { AZN: 0, USD: 0, EUR: 0 }, totalSatish: { AZN: 0, USD: 0, EUR: 0 }, totalGelir: { AZN: 0, USD: 0, EUR: 0 }, byHotel: {} };
        res.json(report); 
    } catch (error) {
        res.status(500).json({ message: "Xəta." });
    }
};

exports.getOrdersByCompany = (req, res) => {
    try {
        const orders = fileStore.getOrders();
        const companyName = req.query.company;
        if (!companyName) {
            const comps = [...new Set(orders.map(o => o.xariciSirket).filter(n => n))];
            return res.json(comps.sort());
        }
        const filtered = orders.filter(o => o.xariciSirket === companyName);
        res.json({ orders: filtered, summary: {} });
    } catch (error) {
        res.status(500).json({ message: "Xəta." });
    }
};

exports.getDebts = (req, res) => {
    try {
        let debts = fileStore.getOrders().filter(order => 
            order.xariciSirket && (!order.paymentStatus || order.paymentStatus === 'Ödənilməyib')
        );
        if (req.query.company) {
            debts = debts.filter(d => d.xariciSirket.toLowerCase().includes(req.query.company.toLowerCase()));
        }
        res.json(debts);
    } catch (error) {
        res.status(500).json({ message: "Xəta." });
    }
};

exports.getNotifications = (req, res) => {
    try {
        const orders = fileStore.getOrders();
        const notifications = [];
        const today = new Date(); today.setHours(0,0,0,0);
        const limit = new Date(today); limit.setDate(today.getDate() + 3);

        orders.forEach(order => {
            if (order.hotels) order.hotels.forEach(hotel => {
                if (!hotel.girisTarixi) return;
                const checkIn = new Date(hotel.girisTarixi);
                if (checkIn >= today && checkIn <= limit) {
                    let probs = [];
                    if (!hotel.otelAdi) probs.push("Otel adı yoxdur");
                    if (!order.transport?.surucuMelumatlari) probs.push("Transport yoxdur");
                    if (probs.length > 0) {
                        notifications.push({
                            satisNo: order.satisNo,
                            turist: (order.tourists||[])[0] || order.turist,
                            girisTarixi: hotel.girisTarixi,
                            problem: probs.join(', ')
                        });
                    }
                }
            });
        });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Xəta." });
    }
};

// --- EKSİK OLAN FUNKSİYA: HOTEL KONFİRMASİYA LİNKİNİ YENİLƏMƏK ---
exports.updateHotelConfirmation = (req, res) => {
    try {
        const { satisNo } = req.params;
        const { otelAdi, confirmationPath } = req.body;

        if (!otelAdi) return res.status(400).json({ message: "Otel adı göndərilməyib." });

        let orders = fileStore.getOrders();
        const orderIndex = orders.findIndex(o => String(o.satisNo) === String(satisNo));

        if (orderIndex === -1) return res.status(404).json({ message: "Sifariş tapılmadı." });

        let order = orders[orderIndex];
        if (!order.hotels || !Array.isArray(order.hotels)) order.hotels = [];

        const hotelIndex = order.hotels.findIndex(h => h.otelAdi === otelAdi);
        if (hotelIndex === -1) return res.status(404).json({ message: `'${otelAdi}' tapılmadı.` });

        // Linki yenilə
        orders[orderIndex].hotels[hotelIndex].confirmationPath = confirmationPath || null;
        
        fileStore.saveAllOrders(orders);
        res.status(200).json({ message: "Sənəd linki uğurla yadda saxlandı." });
    } catch (error) {
        console.error("Sənəd linki xətası:", error);
        res.status(500).json({ message: "Server xətası." });
    }
};