// controllers/inventoryController.js
const { v4: uuidv4 } = require('uuid');
const fileStore = require('../services/fileStore');
const telegram = require('../services/telegramService');

// Kateqoriya üçün prefiks təyin edirik
const getPrefix = (category) => {
    switch (category.toLowerCase()) {
        case 'kompüter': return 'KOMP';
        case 'mebel': return 'MEB';
        case 'printer': return 'PRN';
        case 'ofis ləvazimatı': return 'OFS';
        default: return 'DIG';
    }
};

// Yeni inventar kodu generasiya edən funksiya
const generateInventoryCode = (category, allItems) => {
    const prefix = getPrefix(category);
    const categoryItems = allItems.filter(item => item.inventoryCode.startsWith(prefix));
    const lastNumber = categoryItems.reduce((max, item) => {
        const number = parseInt(item.inventoryCode.split('-')[2], 10);
        return number > max ? number : max;
    }, 0);
    const newNumber = (lastNumber + 1).toString().padStart(3, '0');
    return `AZW-${prefix}-${newNumber}`;
};

exports.getAllItems = (req, res) => {
    try {
        const items = fileStore.getInventory();
        res.json(items.sort((a, b) => new Date(b.creationTimestamp) - new Date(a.creationTimestamp)));
    } catch (error) {
        res.status(500).json({ message: "Avadanlıq siyahısı gətirilərkən xəta baş verdi." });
    }
};

exports.createItem = (req, res) => {
    try {
        const { name, category, purchasePrice, purchaseDate, assignedTo, status, notes } = req.body;
        if (!name || !category) {
            return res.status(400).json({ message: "Avadanlıq adı və kateqoriya mütləq daxil edilməlidir." });
        }

        const allItems = fileStore.getInventory();
        const newItem = {
            id: uuidv4(),
            inventoryCode: generateInventoryCode(category, allItems),
            name,
            category,
            purchasePrice: parseFloat(purchasePrice) || 0,
            purchaseDate: purchaseDate || null,
            assignedTo: assignedTo || 'Anbarda',
            status: status || 'İstifadədə',
            notes: notes || '',
            createdBy: req.session.user.displayName,
            creationTimestamp: new Date().toISOString()
        };

        allItems.push(newItem);
        fileStore.saveAllInventory(allItems);
        
        const logMessage = `yeni avadanlıq (${newItem.inventoryCode}: ${newItem.name}) qeydiyyata aldı.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));

        res.status(201).json(newItem);
    } catch (error) {
        console.error("Avadanlıq yaradılarkən xəta:", error);
        res.status(500).json({ message: "Avadanlıq yaradılarkən server xətası baş verdi." });
    }
};

exports.updateItem = (req, res) => {
    try {
        const { id } = req.params;
        const dataToUpdate = req.body;
        let allItems = fileStore.getInventory();
        const itemIndex = allItems.findIndex(item => item.id === id);

        if (itemIndex === -1) {
            return res.status(404).json({ message: "Düzəliş üçün avadanlıq tapılmadı." });
        }

        const originalItem = allItems[itemIndex];
        
        // Kateqoriya dəyişərsə, yeni kod generasiya etməliyik.
        if (dataToUpdate.category && dataToUpdate.category !== originalItem.category) {
            dataToUpdate.inventoryCode = generateInventoryCode(dataToUpdate.category, allItems);
        }

        // Bütün məlumatları yeniləyirik
        allItems[itemIndex] = { ...originalItem, ...dataToUpdate };
        fileStore.saveAllInventory(allItems);

        const logMessage = `avadanlıq məlumatını (${originalItem.inventoryCode}) yenilədi.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));

        res.status(200).json(allItems[itemIndex]);
    } catch (error) {
        console.error("Avadanlıq yenilənərkən xəta:", error);
        res.status(500).json({ message: "Avadanlıq yenilənərkən daxili server xətası baş verdi." });
    }
};

exports.deleteItem = (req, res) => {
    try {
        const { id } = req.params;
        let allItems = fileStore.getInventory();
        const itemToDelete = allItems.find(item => item.id === id);

        if (!itemToDelete) {
            return res.status(404).json({ message: "Silinmək üçün avadanlıq tapılmadı." });
        }

        const updatedItems = allItems.filter(item => item.id !== id);
        fileStore.saveAllInventory(updatedItems);
        
        const logMessage = `avadanlığı (${itemToDelete.inventoryCode}: ${itemToDelete.name}) sistemdən sildi.`;
        telegram.sendLog(telegram.formatLog(req.session.user, logMessage));

        res.status(200).json({ message: "Avadanlıq uğurla silindi." });
    } catch (error) {
        console.error("Avadanlıq silinərkən xəta:", error);
        res.status(500).json({ message: "Avadanlıq silinərkən daxili server xətası baş verdi." });
    }
};
