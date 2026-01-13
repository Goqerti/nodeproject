const fileStore = require('../services/fileStore');
const { v4: uuidv4 } = require('uuid');

exports.getAllPartners = (req, res) => {
    try {
        const partners = fileStore.getPartners();
        // Ən yenilər yuxarıda görünsün
        partners.reverse(); 
        res.json(partners);
    } catch (error) {
        console.error('Partnyorları oxuyarkən xəta:', error);
        res.status(500).json({ message: 'Məlumatları oxumaq mümkün olmadı', error: error.message });
    }
};

exports.createPartner = (req, res) => {
    try {
        const { 
            companyName, 
            country, 
            phone, 
            entryDates, 
            shortDesc, 
            fullDesc, 
            notes 
        } = req.body;

        if (!companyName) {
            return res.status(400).json({ message: 'Şirkət adı mütləqdir' });
        }

        const newPartner = {
            id: uuidv4(),
            companyName,
            country: country || '',
            phone: phone || '',
            entryDates: Array.isArray(entryDates) ? entryDates : [],
            shortDesc: shortDesc || '',
            fullDesc: fullDesc || '',
            notes: notes || '',
            createdAt: new Date().toISOString(),
            createdBy: req.user ? req.user.username : 'system'
        };

        // Mövcud partnyorları oxu, yenisini əlavə et və hamısını yadda saxla
        const partners = fileStore.getPartners();
        partners.push(newPartner);
        fileStore.saveAllPartners(partners);

        res.status(201).json(newPartner);
    } catch (error) {
        console.error('Partnyor yaradarkən xəta:', error);
        res.status(500).json({ message: 'Partnyor yaratmaq mümkün olmadı', error: error.message });
    }
};

exports.updatePartner = (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const partners = fileStore.getPartners();
        const index = partners.findIndex(p => p.id === id);

        if (index === -1) {
            return res.status(404).json({ message: 'Partnyor tapılmadı' });
        }

        // Məlumatları yeniləyirik
        const updatedPartner = {
            ...partners[index],
            ...updateData,
            id: id, // ID dəyişdirilə bilməz
            updatedAt: new Date().toISOString(),
            updatedBy: req.user ? req.user.username : 'system'
        };
        
        // entryDates massiv olduğundan əmin olaq
        if (updateData.entryDates && !Array.isArray(updateData.entryDates)) {
             updatedPartner.entryDates = [];
        }

        partners[index] = updatedPartner;
        fileStore.saveAllPartners(partners);

        res.json(updatedPartner);
    } catch (error) {
        console.error('Partnyoru yeniləyərkən xəta:', error);
        res.status(500).json({ message: 'Yenilənmə zamanı xəta baş verdi', error: error.message });
    }
};

exports.deletePartner = (req, res) => {
    try {
        const { id } = req.params;
        let partners = fileStore.getPartners();
        
        const initialLength = partners.length;
        partners = partners.filter(p => p.id !== id);

        if (partners.length === initialLength) {
            return res.status(404).json({ message: 'Partnyor tapılmadı' });
        }

        fileStore.saveAllPartners(partners);
        res.json({ message: 'Partnyor uğurla silindi' });
    } catch (error) {
        console.error('Partnyoru silərkən xəta:', error);
        res.status(500).json({ message: 'Silinmə zamanı xəta baş verdi', error: error.message });
    }
};