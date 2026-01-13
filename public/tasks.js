// public/tasks.js
document.addEventListener('DOMContentLoaded', async () => {
    
    // --- DOM Elementləri ---
    const tasksToMeTableBody = document.getElementById('tasksToMeTableBody');
    const tasksByMeTableBody = document.getElementById('tasksByMeTableBody');
    const modal = document.getElementById('taskModal');
    const showModalBtn = document.getElementById('showAddTaskModalBtn');
    const closeModalBtn = modal.querySelector('.close-button');
    const taskForm = document.getElementById('taskForm');
    const assignedToSelect = document.getElementById('assignedTo');

    // --- İlkin Məlumatların Yüklənməsi ---
    let allUsers = [];

    const loadInitialData = async () => {
        try {
            // İstifadəçi siyahısını yükləyirik
            const usersResponse = await fetch('/api/users');
            if (!usersResponse.ok) throw new Error('İstifadəçi siyahısı yüklənə bilmədi.');
            allUsers = await usersResponse.json();
            
            // Tapşırıqları yükləyirik
            await fetchAndRenderTasks();
        } catch (error) {
            alert(error.message);
        }
    };

    // --- Əsas Funksiyalar ---
    const fetchAndRenderTasks = async () => {
        try {
            const response = await fetch('/api/tasks');
            if (!response.ok) throw new Error('Tapşırıqları yükləmək mümkün olmadı.');
            
            const { assignedToMe, assignedByMe } = await response.json();
            
            renderTasksTable(assignedToMe, tasksToMeTableBody, true);
            renderTasksTable(assignedByMe, tasksByMeTableBody, false);
        } catch (error) {
            console.error("Tapşırıqlar yüklənərkən xəta:", error);
        }
    };

    const renderTasksTable = (tasks, tbody, isAssignedToMe) => {
        tbody.innerHTML = '';
        if (tasks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Heç bir tapşırıq tapılmadı.</td></tr>`;
            return;
        }

        tasks.forEach(task => {
            const row = tbody.insertRow();
            row.className = 'task-row';
            if (task.status === 'completed') {
                row.classList.add('completed');
            } else if (task.dueDate && new Date(task.dueDate) < new Date()) {
                row.classList.add('overdue');
            }

            if (isAssignedToMe) {
                row.insertCell().textContent = task.assignedByDisplayName;
            } else {
                row.insertCell().textContent = task.assignedToDisplayName;
            }

            row.insertCell().textContent = task.description;
            row.insertCell().textContent = task.relatedOrder || '-';
            row.insertCell().textContent = task.dueDate ? new Date(task.dueDate).toLocaleDateString('az-AZ') : '-';
            row.insertCell().textContent = task.status === 'completed' ? 'Tamamlanıb' : 'Gözləmədə';

            if (isAssignedToMe) {
                const actionsCell = row.insertCell();
                if (task.status === 'pending') {
                    const completeBtn = document.createElement('button');
                    completeBtn.className = 'complete-btn';
                    completeBtn.textContent = 'Tamamla';
                    completeBtn.onclick = () => handleCompleteTask(task.id);
                    actionsCell.appendChild(completeBtn);
                } else {
                    actionsCell.textContent = '✅';
                }
            }
        });
    };

    const populateUsersDropdown = () => {
        assignedToSelect.innerHTML = '<option value="">-- İstifadəçi seçin --</option>';
        allUsers.forEach(user => {
            if (user.role !== 'owner') { // Owner-a tapşırıq vermək olmasın
                const option = document.createElement('option');
                option.value = user.username;
                option.textContent = user.displayName;
                assignedToSelect.appendChild(option);
            }
        });
    };

    const openModalForCreate = () => {
        taskForm.reset();
        populateUsersDropdown();
        modal.style.display = 'flex';
    };

    const handleCompleteTask = async (taskId) => {
        if (!confirm("Bu tapşırığı tamamladığınıza əminsiniz?")) return;
        try {
            const response = await fetch(`/api/tasks/${taskId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed' })
            });
            if (!response.ok) throw new Error((await response.json()).message);
            await fetchAndRenderTasks();
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    };

    // --- Hadisə Dinləyiciləri ---
    showModalBtn.addEventListener('click', openModalForCreate);
    closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const taskData = {
            assignedTo: document.getElementById('assignedTo').value,
            description: document.getElementById('description').value,
            relatedOrder: document.getElementById('relatedOrder').value,
            dueDate: document.getElementById('dueDate').value,
        };

        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Tapşırıq yaradıla bilmədi.');
            }
            
            modal.style.display = 'none';
            await fetchAndRenderTasks();

        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    });

    // --- İlkin Yükləmə ---
    loadInitialData();
});
