// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const session = require('express-session');
const WebSocket = require('ws');
// UUID kitabxanası (CommonJS uyğunluğu üçün)
const { v4: uuidv4 } = require('uuid'); 
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

// Servisləri import edirik
const { startBackupSchedule } = require('./services/telegramBackupService');
const { startAllTasks } = require('./services/scheduledTasksService');
const { initializeBotListeners } = require('./services/telegramService');
const fileStore = require('./services/fileStore');

// Controllerləri və marşrutları import edirik
const userController = require('./controllers/userController');
const apiRoutes = require('./routes/api');
const { requireLogin, requireOwnerRole, requireFinanceOrOwner } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Proxy arxasında (məsələn cPanel/Nginx) işləyirsə IP-ləri düzgün görmək üçün
app.set('trust proxy', 1);

// --- Session Middleware ---
const sessionParser = session({
    secret: process.env.SESSION_SECRET || 'gizli_acar_soz_mutleq_deyishdirin',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // cPanel-də HTTP işlədirsizsə false olmalıdır. HTTPS varsa true edin.
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 saat
    }
});

// --- General Middleware ---
app.use(sessionParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Statik Fayllar (Vacib Düzəliş) ---
// 1. 'public' qovluğunu açırıq, amma 'index.html'-i avtomatik yükləməyə qoymuruq (onu qorumaq üçün).
// Bu, login.html, css, js və şəkillərin girişsiz işləməsini təmin edir.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// --- Səhifə Marşrutları ---

// Login və Logout
app.post('/login', userController.login);
app.get('/logout', userController.logout);

// Ana Səhifə (Yalnız giriş edənlər üçün)
app.get('/', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API Marşrutları ---
app.use('/api', apiRoutes);

// --- Fayl Yükləmə (Upload) ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/upload', requireLogin, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Fayl seçilməyib' });
    }
    try {
        // Şəkil yükləmə məntiqi (Imgur və ya lokal)
        const imageBuffer = req.file.buffer;
        const base64Image = imageBuffer.toString('base64');
        
        const formData = new FormData();
        formData.append('image', base64Image);

        const clientId = 'c35147b9eee5034'; // Öz Client ID-nizi yoxlayın
        const imgurResponse = await axios.post('https://api.imgur.com/3/image', formData, {
            headers: {
                Authorization: `Client-ID ${clientId}`,
                ...formData.getHeaders()
            }
        });

        if (imgurResponse.data && imgurResponse.data.success) {
            const link = imgurResponse.data.data.link;
            // Linki fayla yazırıq
            fileStore.appendToPhotoTxt({ 
                link: link, 
                user: req.session.user.username, 
                date: new Date().toISOString() 
            });
            res.json({ link: link });
        } else {
            throw new Error('Imgur upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Fayl yüklənərkən xəta baş verdi' });
    }
});

// --- Server Başlanğıc Funksiyası ---
const initializeApp = () => {
    // Məlumat fayllarının mövcudluğunu yoxla və ya yarat
    const filesToCheck = [
        'sifarişlər.txt', 
        'users.txt', 
        'xərclər.txt', 
        'chat_history.txt', 
        'inventory.txt', 
        'audit_log.txt', 
        'photo.txt', 
        'transport.txt', 
        'partnyorlar.txt',
        'sifarişlər_archive.txt' // Yeni fayl
    ];

    filesToCheck.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (!fs.existsSync(filePath)) {
            // ƏSAS DÜZƏLİŞ: 
            // Əgər fayl 'sifarişlər_archive.txt' və ya .json faylıdırsa, 
            // onu boş string ('') yox, boş array ('[]') kimi yarat.
            // Bu, frontend-də "orders.sort is not a function" xətasının qarşısını alır.
            const isJsonArray = file.endsWith('.json') || file.includes('archive');
            const initialContent = isJsonArray ? '[]' : '';
            
            fs.writeFileSync(filePath, initialContent);
        }
    });
    
    // Permissions faylı json olduğu üçün ayrıca baxırıq
    const permPath = path.join(__dirname, 'permissions.json');
    if (!fs.existsSync(permPath)) fs.writeFileSync(permPath, '{}');
};

const server = http.createServer(app);

// --- WebSocket Server ---
const wss = new WebSocket.Server({ noServer: true });
const clients = new Map();

wss.on('connection', (ws, request) => {
    const user = request.session.user;
    if (!user) { ws.close(); return; }

    const clientId = uuidv4();
    clients.set(clientId, { ws, user });
    console.log(`${user.displayName} chat-a qoşuldu.`);
    
    // Son 50 mesajı göndər
    const history = fileStore.getChatHistory().slice(-50);
    ws.send(JSON.stringify({ type: 'history', data: history }));

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            const messageData = {
                id: uuidv4(),
                sender: user.displayName,
                role: user.role,
                text: parsedMessage.text,
                timestamp: new Date().toISOString()
            };
            fileStore.appendToChatHistory(messageData);
            
            // Mesajı bütün aktiv istifadəçilərə göndər
            for (const client of clients.values()) {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify({ type: 'message', data: messageData }));
                }
            }
        } catch (e) {
            console.error("Gələn mesaj parse edilə bilmədi:", message);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`${user.displayName} chat-dan ayrıldı.`);
    });
});

// WebSocket Upgrade Handle
server.on('upgrade', (request, socket, head) => {
    sessionParser(request, {}, () => {
        if (!request.session.user) {
            socket.destroy();
            return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
});

// --- Serveri Başlat ---
server.listen(PORT, () => {
    initializeApp();
    initializeBotListeners(); // Telegram Botu
    startBackupSchedule(2);   // Yedəkləmə (hər 2 saatdan bir)
    startAllTasks();          // Planlanmış tapşırıqlar
    console.log(`Server http://localhost:${PORT} ünvanında işləyir`);
});

// Render və ya Sleep Mode qarşısını almaq üçün Ping (Opsional)
const PING_URL = process.env.RENDER_EXTERNAL_URL;
if (PING_URL) {
    setInterval(() => {
        const protocol = PING_URL.startsWith('https') ? https : http;
        protocol.get(PING_URL, (res) => {
            // Ping success
        }).on('error', (err) => {
            console.error("Ping error:", err.message);
        });
    }, 14 * 60 * 1000);
}