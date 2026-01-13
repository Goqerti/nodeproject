// controllers/taskController.js
const { v4: uuidv4 } = require('uuid');
const fileStore = require('../services/fileStore');
const { logAction } = require('../services/auditLogService');
const telegram = require('../services/telegramService');

/**
 * Tapşırıqları gətirir: həm istifadəçiyə təyin edilənlər, həm də onun təyin etdikləri.
 */
exports.getTasks = (req, res) => {
    try {
        const currentUser = req.session.user.username;
        const allTasks = fileStore.getTasks();
        
        const tasksAssignedToMe = allTasks.filter(task => task.assignedTo === currentUser);
        const tasksAssignedByMe = allTasks.filter(task => task.assignedBy === currentUser);

        res.json({
            assignedToMe: tasksAssignedToMe.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
            assignedByMe: tasksAssignedByMe.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        });
    } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({ message: "Tapşırıqlar gətirilərkən xəta baş verdi." });
    }
};

/**
 * Yeni tapşırıq yaradır.
 */
exports.createTask = (req, res) => {
    try {
        const { assignedTo, description, relatedOrder, dueDate } = req.body;
        if (!assignedTo || !description) {
            return res.status(400).json({ message: "İcraçı və tapşırıq mətni mütləq daxil edilməlidir." });
        }

        const users = fileStore.getUsers();
        let assignedToUser = users[assignedTo];
        
        if (!assignedToUser) {
            return res.status(404).json({ message: "Təyin edilən istifadəçi tapılmadı." });
        }

        const newTask = {
            id: uuidv4(),
            assignedBy: req.session.user.username,
            assignedByDisplayName: req.session.user.displayName,
            assignedTo,
            assignedToDisplayName: assignedToUser.displayName,
            description,
            relatedOrder: relatedOrder || null,
            dueDate: dueDate || null,
            status: 'pending', // 'pending' or 'completed'
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        const allTasks = fileStore.getTasks();
        allTasks.push(newTask);
        fileStore.saveAllTasks(allTasks);

        const logMessage = `<b>${newTask.assignedToDisplayName}</b> adlı istifadəçiyə yeni tapşırıq verdi: <i>${description}</i>`;
        telegram.sendSimpleMessage(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'CREATE_TASK', { assignedTo, description });

        res.status(201).json(newTask);
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ message: "Tapşırıq yaradılarkən server xətası baş verdi." });
    }
};

/**
 * Tapşırığın statusunu yeniləyir.
 */
exports.updateTaskStatus = (req, res) => {
    try {
        const { taskId } = req.params;
        const { status } = req.body;

        if (status !== 'completed') {
            return res.status(400).json({ message: "Yalnız 'completed' statusu təyin edilə bilər." });
        }

        const allTasks = fileStore.getTasks();
        const taskIndex = allTasks.findIndex(t => t.id === taskId);

        if (taskIndex === -1) {
            return res.status(404).json({ message: "Tapşırıq tapılmadı." });
        }

        if (allTasks[taskIndex].assignedTo !== req.session.user.username) {
            return res.status(403).json({ message: "Yalnız sizə təyin edilmiş tapşırıqları tamamlaya bilərsiniz." });
        }

        allTasks[taskIndex].status = 'completed';
        allTasks[taskIndex].completedAt = new Date().toISOString();

        fileStore.saveAllTasks(allTasks);
        
        const completedTask = allTasks[taskIndex];
        const logMessage = `<b>${completedTask.assignedByDisplayName}</b> tərəfindən verilən tapşırığı tamamladı: <i>${completedTask.description}</i>`;
        telegram.sendSimpleMessage(telegram.formatLog(req.session.user, logMessage));
        logAction(req, 'COMPLETE_TASK', { taskId });

        res.status(200).json(allTasks[taskIndex]);
    } catch (error) {
        console.error("Error updating task status:", error);
        res.status(500).json({ message: "Tapşırıq statusu yenilənərkən server xətası baş verdi." });
    }
};

/**
 * Gözləmədə olan tapşırıqların sayını gətirir.
 */
exports.getPendingTaskCount = (req, res) => {
    try {
        const currentUser = req.session.user.username;
        const allTasks = fileStore.getTasks();
        const pendingCount = allTasks.filter(task => task.assignedTo === currentUser && task.status === 'pending').length;
        res.json({ count: pendingCount });
    } catch (error) {
        res.status(500).json({ message: "Tapşırıq sayı gətirilərkən xəta baş verdi." });
    }
};

/**
 * Tapşırığı silir.
 */
exports.deleteTask = (req, res) => {
    try {
        const { taskId } = req.params;
        const allTasks = fileStore.getTasks();
        const taskIndex = allTasks.findIndex(t => t.id === taskId);

        if (taskIndex === -1) {
            return res.status(404).json({ message: "Tapşırıq tapılmadı." });
        }

        // Yalnız tapşırığı verən və ya owner silə bilər
        if (allTasks[taskIndex].assignedBy !== req.session.user.username && req.session.user.role !== 'owner') {
            return res.status(403).json({ message: "Bu tapşırığı silməyə icazəniz yoxdur." });
        }

        const deletedTask = allTasks[taskIndex];
        allTasks.splice(taskIndex, 1);
        fileStore.saveAllTasks(allTasks);

        logAction(req, 'DELETE_TASK', { taskId, description: deletedTask.description });
        res.status(200).json({ message: "Tapşırıq uğurla silindi." });

    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ message: "Tapşırıq silinərkən server xətası baş verdi." });
    }
};
