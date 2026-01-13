// public/inventory.js
document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('inventoryTableBody');
    const modal = document.getElementById('itemModal');
    const showModalBtn = document.getElementById('showAddItemModalBtn'); 
    const closeModalBtn = modal.querySelector('.close-button');
    const itemForm = document.getElementById('itemForm');
    const modalTitle = document.getElementById('modalTitle');
    const submitButton = document.getElementById('submitButton');
    const itemIdInput = document.getElementById('itemId');

    const detailsModal = document.getElementById('detailsModal');
    const detailsContent = document.getElementById('detailsContent');
    // `detailsModal` null ola biləcəyi üçün yoxlama əlavə edirik
    const closeDetailsModalBtn = detailsModal ? detailsModal.querySelector('.close-button') : null;

    const fetchAndRenderInventory = async () => {
        try {
            const response = await fetch('/api/inventory');
            if (!response.ok) {
                if (response.status === 403) {
                    alert('Bu bölməyə giriş icazəniz yoxdur.');
                    window.location.href = '/';
                    return;
                }
                throw new Error('Avadanlıq siyahısı yüklənə bilmədi.');
            }
            const items = await response.json();
            renderInventoryTable(items);
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="8" class="error-message">${error.message}</td></tr>`;
        }
    };

    const renderInventoryTable = (items) => {
        tableBody.innerHTML = '';
        if (items.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Heç bir avadanlıq qeydiyyata alınmayıb.</td></tr>`;
            return;
        }
        items.forEach(item => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = item.inventoryCode;
            row.insertCell().textContent = item.name;
            row.insertCell().textContent = item.category;
            row.insertCell().textContent = item.assignedTo;
            row.insertCell().textContent = item.status;
            row.insertCell().textContent = item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString('az-AZ') : '-';
            
            // Qiymətin rəqəm olduğundan əmin olub, sonra toFixed() tətbiq edirik
            row.insertCell().textContent = (parseFloat(item.purchasePrice) || 0).toFixed(2);
            
            const actionsCell = row.insertCell();
            
            const printBtn = document.createElement('button');
            printBtn.className = 'action-btn print-label';
            printBtn.innerHTML = '🖨️';
            printBtn.title = 'Etiket Çap Et';
            printBtn.onclick = () => printLabel(item);
            actionsCell.appendChild(printBtn);

            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn edit';
            editBtn.innerHTML = '✏️';
            editBtn.title = 'Düzəliş et';
            editBtn.onclick = () => openModalForEdit(item);
            actionsCell.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Sil';
            deleteBtn.onclick = () => handleDeleteItem(item.id);
            actionsCell.appendChild(deleteBtn);
        });
    };

    const openModalForCreate = () => {
        itemForm.reset();
        itemIdInput.value = '';
        modalTitle.textContent = 'Yeni Avadanlıq';
        submitButton.textContent = 'Yadda Saxla';
        modal.style.display = 'flex';
    };

    const openModalForEdit = (item) => {
        itemForm.reset();
        itemIdInput.value = item.id;
        document.getElementById('name').value = item.name;
        document.getElementById('category').value = item.category;
        document.getElementById('purchasePrice').value = item.purchasePrice;
        document.getElementById('purchaseDate').value = item.purchaseDate;
        document.getElementById('assignedTo').value = item.assignedTo;
        document.getElementById('status').value = item.status;
        document.getElementById('notes').value = item.notes;
        modalTitle.textContent = 'Avadanlığa Düzəliş Et';
        submitButton.textContent = 'Dəyişiklikləri Yadda Saxla';
        modal.style.display = 'flex';
    };

    const handleDeleteItem = async (id) => {
        if (!confirm('Bu avadanlığı silmək istədiyinizə əminsiniz?')) return;
        try {
            const response = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).message);
            await fetchAndRenderInventory();
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    };

    const printLabel = (item) => {
        const labelWindow = window.open('', 'PRINT', 'height=400,width=600');
        labelWindow.document.write('<html><head><title>Etiket</title>');
        labelWindow.document.write('<style>body{font-family: sans-serif; text-align: center; margin: 20px;} .code{font-size: 2em; font-weight: bold; margin-top: 20px;} .name{font-size: 1.2em;}</style>');
        labelWindow.document.write('</head><body>');
        labelWindow.document.write(`<div class="code">${item.inventoryCode}</div>`);
        labelWindow.document.write(`<div class="name">${item.name}</div>`);
        labelWindow.document.write('</body></html>');
        labelWindow.document.close();
        labelWindow.focus();
        labelWindow.print();
        labelWindow.close();
    };

    if(showModalBtn) showModalBtn.addEventListener('click', openModalForCreate);
    if(closeModalBtn) closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    
    // `detailsModal` üçün yoxlama
    if(closeDetailsModalBtn) {
        closeDetailsModalBtn.addEventListener('click', () => detailsModal.style.display = 'none');
    }
    
    window.addEventListener('click', (e) => { 
        if (e.target === modal) modal.style.display = 'none'; 
        if (detailsModal && e.target === detailsModal) detailsModal.style.display = 'none';
    });

    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = itemIdInput.value;
        const url = id ? `/api/inventory/${id}` : '/api/inventory';
        const method = id ? 'PUT' : 'POST';
        
        const data = {
            name: document.getElementById('name').value,
            category: document.getElementById('category').value,
            purchasePrice: parseFloat(document.getElementById('purchasePrice').value) || 0,
            purchaseDate: document.getElementById('purchaseDate').value,
            assignedTo: document.getElementById('assignedTo').value,
            status: document.getElementById('status').value,
            notes: document.getElementById('notes').value,
        };

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error((await response.json()).message);
            modal.style.display = 'none';
            await fetchAndRenderInventory();
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    });

    fetchAndRenderInventory();
});
