// public/finance.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elementləri ---
    const expensesTableBody = document.getElementById('expensesTableBody');
    const modal = document.getElementById('expenseModal');
    const showModalBtn = document.getElementById('showAddExpenseModalBtn');
    const closeModalBtn = modal.querySelector('.close-button');
    const expenseForm = document.getElementById('expenseForm');
    const modalTitle = document.getElementById('modalTitle');
    const submitButton = document.getElementById('submitButton');
    const expenseIdInput = document.getElementById('expenseId');
    const totalAmountSpan = document.getElementById('totalAmount');
    const detailsModal = document.getElementById('detailsModal');
    const detailsContent = document.getElementById('detailsContent');
    const closeDetailsModalBtn = detailsModal.querySelector('.close-button');
    const expenseItemsContainer = document.getElementById('expenseItemsContainer');

    // --- XƏRC PAKETLƏRİ ÜÇÜN FUNKSİYALAR ---
    const fetchAndRenderPackages = async () => {
        try {
            const response = await fetch('/api/expenses');
            if (!response.ok) {
                if(response.status === 403) {
                    alert('Bu bölməyə giriş icazəniz yoxdur.');
                    window.location.href = '/';
                    return;
                }
                throw new Error('Xərc paketləri yüklənə bilmədi.');
            }
            const packages = await response.json();
            renderPackagesTable(packages);
        } catch (error) {
            if (expensesTableBody) {
                expensesTableBody.innerHTML = `<tr><td colspan="4" class="error-message">${error.message}</td></tr>`;
            }
        }
    };

    const renderPackagesTable = (packages) => {
        if (!expensesTableBody) return;
        expensesTableBody.innerHTML = '';
        if (packages.length === 0) {
            expensesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Heç bir xərc paketi əlavə edilməyib.</td></tr>`;
            return;
        }
        packages.forEach(pkg => {
            const row = expensesTableBody.insertRow();
            row.insertCell().textContent = new Date(pkg.creationTimestamp).toLocaleDateString('az-AZ');
            row.insertCell().textContent = `${pkg.totalAmount.toFixed(2)} ${pkg.currency}`;
            row.insertCell().textContent = pkg.createdBy;
            const actionsCell = row.insertCell();
            const detailsButton = document.createElement('button');
            detailsButton.className = 'action-btn note';
            detailsButton.innerHTML = '📄';
            detailsButton.title = 'Detallara bax';
            detailsButton.onclick = () => showDetailsModal(pkg);
            actionsCell.appendChild(detailsButton);
            const editButton = document.createElement('button');
            editButton.className = 'action-btn edit';
            editButton.innerHTML = '✏️';
            editButton.title = 'Düzəliş et';
            editButton.onclick = () => openModalForEdit(pkg);
            actionsCell.appendChild(editButton);
            const deleteButton = document.createElement('button');
            deleteButton.className = 'action-btn delete';
            deleteButton.innerHTML = '🗑️';
            deleteButton.title = 'Sil';
            deleteButton.onclick = () => handleDeletePackage(pkg.id);
            actionsCell.appendChild(deleteButton);
        });
    };
    
    const calculateTotal = () => {
        let total = 0;
        if (expenseItemsContainer) {
            expenseItemsContainer.querySelectorAll('.cost-input').forEach(input => {
                total += parseFloat(input.value) || 0;
            });
        }
        if (totalAmountSpan) {
            totalAmountSpan.textContent = total.toFixed(2);
        }
    };

    const createExpenseItemHTML = (key, name, itemData = {}) => {
        const entryId = `${key}-${Date.now()}${Math.random()}`;
        const today = new Date().toISOString().split('T')[0];
        return `
            <div class="expense-item" data-key="${key}">
                <label for="cost-${key}">${name}:</label>
                <input type="number" id="cost-${key}" class="cost-input" value="${itemData.amount || 0}" step="0.01">
                <input type="date" class="expense-date" value="${itemData.date || today}">
                <div class="file-status-wrapper">
                    <label for="file-${entryId}" class="file-upload-label">Çek</label>
                    <input type="file" id="file-${entryId}" class="expense-receipt-upload" accept="image/*,application/pdf">
                    <a href="${itemData.receiptPath || '#'}" class="view-receipt-link" target="_blank" style="display: ${itemData.receiptPath ? 'inline-flex' : 'none'};">🔗</a>
                    <input type="hidden" class="receipt-path-input" value="${itemData.receiptPath || ''}">
                </div>
                <input type="text" class="comment-input" placeholder="Kimə/Nə üçün şərh..." value="${itemData.comment || ''}">
            </div>
        `;
    };

    const populateExpenseForm = (details = {}) => {
        const expenseTypes = { icare: 'İcarə', kommunal: 'Kommunal', telefon: 'Telefon', ofis: 'Ofis xərcləri', reklam: 'Reklam', maas: 'Maaş', sosial_sigorta: 'Sosial sığorta', icbari_sigorta: 'İcbari sığorta', yanacaq: 'Maşın yanacaq', gunluk: 'Günlük xərclər', diger: 'Digər' };
        if (expenseItemsContainer) {
            expenseItemsContainer.innerHTML = '';
            for (const [key, name] of Object.entries(expenseTypes)) {
                expenseItemsContainer.innerHTML += createExpenseItemHTML(key, name, details[key]);
            }
        }
        calculateTotal();
    };
    
    const openModalForCreate = () => {
        if (!expenseForm || !modal) return;
        expenseForm.reset();
        expenseIdInput.value = '';
        modalTitle.textContent = 'Yeni Xərc Paketi';
        submitButton.textContent = 'Paketi Yadda Saxla';
        populateExpenseForm();
        modal.style.display = 'flex';
    };

    const openModalForEdit = (pkg) => {
        if (!expenseForm || !modal) return;
        expenseForm.reset();
        expenseIdInput.value = pkg.id;
        modalTitle.textContent = 'Xərc Paketinə Düzəliş Et';
        submitButton.textContent = 'Dəyişiklikləri Yadda Saxla';
        populateExpenseForm(pkg.details);
        modal.style.display = 'flex';
    };

    const handleFileUpload = async (fileInput) => {
        const file = fileInput.files[0];
        if (!file) return;

        const wrapper = fileInput.closest('.file-status-wrapper');
        const link = wrapper.querySelector('.view-receipt-link');
        const pathInput = wrapper.querySelector('.receipt-path-input');
        const label = wrapper.querySelector('.file-upload-label');

        const originalLabelText = label.textContent;
        label.textContent = 'Yüklənir...';
        link.style.display = 'none';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!response.ok) throw new Error((await response.json()).message || 'Yükləmə xətası.');
            
            const result = await response.json();
            pathInput.value = result.filePath;
            link.href = result.filePath;
            link.style.display = 'inline-flex';
            label.textContent = 'Dəyiş';
        } catch (error) {
            alert(`Xəta: ${error.message}`);
            label.textContent = originalLabelText;
        }
    };

    const showDetailsModal = (pkg) => {
        if (!detailsContent || !detailsModal) return;
        let contentHtml = '';
        for(const key in pkg.details) {
            const item = pkg.details[key];
            if(item.amount > 0) {
                 contentHtml += `
                    <div class="info-grid">
                        <strong>${key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong>
                        <span>${item.amount.toFixed(2)} ${pkg.currency}</span>
                        <strong>Tarix:</strong>
                        <span>${item.date ? new Date(item.date).toLocaleDateString('az-AZ') : '<i>(qeyd edilməyib)</i>'}</span>
                        <strong>Şərh:</strong>
                        <span>${item.comment || '<i>(boş)</i>'}</span>
                    </div><hr class="dashed">`;
            }
        }
        detailsContent.innerHTML = contentHtml || '<p>Bu paketdə heç bir xərc detalı tapılmadı.</p>';
        detailsModal.style.display = 'flex';
    };

    const handleDeletePackage = async (id) => {
        if (!confirm('Bu xərc paketini silmək istədiyinizə əminsiniz?')) return;
        try {
            const response = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message);
            }
            await fetchAndRenderPackages();
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    };
    
    // --- Hadisə Dinləyiciləri ---
    if(showModalBtn) showModalBtn.addEventListener('click', openModalForCreate);
    if(closeModalBtn) closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    if(closeDetailsModalBtn) closeDetailsModalBtn.addEventListener('click', () => { detailsModal.style.display = 'none'; });
    
    window.addEventListener('click', (e) => { 
        if (modal && e.target === modal) modal.style.display = 'none'; 
        if (detailsModal && e.target === detailsModal) detailsModal.style.display = 'none';
    });
    
    if (expenseItemsContainer) {
        expenseItemsContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('expense-receipt-upload')) {
                handleFileUpload(e.target);
            }
        });
        expenseItemsContainer.addEventListener('input', (e) => {
            if (e.target.classList.contains('cost-input')) {
                calculateTotal();
            }
        });
    }

    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = expenseIdInput.value;
            const url = id ? `/api/expenses/${id}` : '/api/expenses';
            const method = id ? 'PUT' : 'POST';
            
            const details = {};
            expenseItemsContainer.querySelectorAll('.expense-item').forEach(item => {
                const key = item.dataset.key;
                details[key] = {
                    amount: parseFloat(item.querySelector('.cost-input').value) || 0,
                    comment: item.querySelector('.comment-input').value.trim(),
                    receiptPath: item.querySelector('.receipt-path-input').value.trim(),
                    date: item.querySelector('.expense-date').value
                };
            });

            const packageData = {
                totalAmount: parseFloat(totalAmountSpan.textContent),
                currency: 'AZN',
                details
            };

            try {
                const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packageData) });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.message || 'Əməliyyat uğursuz oldu.');
                }
                
                modal.style.display = 'none';
                await fetchAndRenderPackages();

            } catch (error) {
                alert(`Xəta: ${error.message}`);
            }
        });
    }

    // Səhifə yüklənəndə ilkin məlumatları gətir
    if (expensesTableBody) {
        fetchAndRenderPackages();
    }
});
