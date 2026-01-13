// public/transport.js
document.addEventListener('DOMContentLoaded', async () => {
    
    // --- Qlobal Dəyişənlər ---
    let allPackages = [];
    let editingPackageId = null;
    let currentUserPermissions = {};

    // --- DOM Elementləri ---
    const tableBody = document.getElementById('transportTableBody');
    const modal = document.getElementById('packageModal');
    const showModalBtn = document.getElementById('showAddPackageModalBtn');
    const closeModalBtn = modal.querySelector('.close-button');
    const packageForm = document.getElementById('packageForm');
    const guestCountInput = document.getElementById('guestCount');
    const guestNamesContainer = document.getElementById('guestNamesContainer');
    const otherCostsContainer = document.getElementById('otherCostsContainer');
    const addOtherCostBtn = document.getElementById('addOtherCostBtn');
    const totalCostSpan = document.getElementById('totalCost');
    const filterMonthInput = document.getElementById('filterMonth');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');

    const packageIdInput = document.createElement('input');
    packageIdInput.type = 'hidden';
    packageIdInput.id = 'editingPackageId';
    packageForm.appendChild(packageIdInput);

    // --- İcazələrin Yüklənməsi ---
    try {
        const response = await fetch('/api/user/permissions');
        if (!response.ok) {
            if(response.status === 401 || response.status === 403) window.location.href = '/login.html';
            throw new Error('İcazələr yüklənə bilmədi.');
        }
        currentUserPermissions = await response.json();
    } catch (error) {
        alert(error.message);
    }

    // --- Əsas Funksiyalar ---
    const fetchAndRenderPackages = async () => {
        try {
            const response = await fetch('/api/transport');
            if (!response.ok) {
                if(response.status === 403) {
                    document.body.innerHTML = '<h1>Bu bölməyə giriş icazəniz yoxdur.</h1><a href="/">Əsas səhifəyə qayıt</a>';
                    return;
                }
                throw new Error('Transport paketləri yüklənə bilmədi.');
            }
            allPackages = await response.json();
            filterAndRender();
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="7" class="error-message">${error.message}</td></tr>`;
        }
    };

    const filterAndRender = () => {
        const filterMonth = filterMonthInput.value;
        let packagesToRender = allPackages;

        if (filterMonth) {
            packagesToRender = allPackages.filter(pkg => pkg.departureDate && pkg.departureDate.startsWith(filterMonth));
        }

        packagesToRender.sort((a, b) => new Date(b.creationTimestamp) - new Date(a.creationTimestamp));
        renderTable(packagesToRender);
    };

    const renderTable = (packages) => {
        tableBody.innerHTML = '';
        if (packages.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Filterə uyğun transport paketi tapılmadı.</td></tr>`;
            return;
        }
        packages.forEach(pkg => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = new Date(pkg.creationTimestamp).toLocaleDateString('az-AZ');
            row.insertCell().textContent = pkg.driverName;
            row.insertCell().textContent = pkg.destination;
            row.insertCell().textContent = `${pkg.vehicleModel || ''} (${pkg.vehiclePlate || ''})`;
            row.insertCell().textContent = (pkg.totalCost || 0).toFixed(2);
            row.insertCell().textContent = pkg.createdBy;
            
            const actionsCell = row.insertCell();
            if (currentUserPermissions.transport_canEdit) {
                const editBtn = document.createElement('button');
                editBtn.className = 'action-btn edit';
                editBtn.innerHTML = '✏️';
                editBtn.title = 'Düzəliş et';
                editBtn.onclick = () => openModalForEdit(pkg);
                actionsCell.appendChild(editBtn);
            }

            if (currentUserPermissions.transport_canDelete) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'action-btn delete';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = 'Sil';
                deleteBtn.onclick = () => handleDeletePackage(pkg.id);
                actionsCell.appendChild(deleteBtn);
            }
        });
    };

    const updateGuestInputs = () => {
        const count = parseInt(guestCountInput.value) || 0;
        guestNamesContainer.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Sərnişin ${i + 1} adı`;
            input.className = 'guest-name-input';
            guestNamesContainer.appendChild(input);
        }
    };

    const addOtherCostRow = (cost = {}) => {
        const row = document.createElement('div');
        row.className = 'other-cost-item';
        row.innerHTML = `
            <input type="text" class="other-cost-name" placeholder="Xərcin adı" value="${cost.name || ''}">
            <input type="number" class="other-cost-amount cost-input" value="${cost.amount || 0}" step="0.01">
            <button type="button" class="action-btn-small remove-hotel-btn">-</button>
        `;
        otherCostsContainer.appendChild(row);
        row.querySelector('.remove-hotel-btn').addEventListener('click', () => {
            row.remove();
            calculateTotal();
        });
        row.querySelector('.cost-input').addEventListener('input', calculateTotal);
    };

    const calculateTotal = () => {
        let total = 0;
        modal.querySelectorAll('.cost-input').forEach(input => {
            total += parseFloat(input.value) || 0;
        });
        totalCostSpan.textContent = total.toFixed(2);
    };

    const openModalForCreate = () => {
        packageForm.reset();
        guestNamesContainer.innerHTML = '';
        otherCostsContainer.innerHTML = '';
        editingPackageId = null;
        packageIdInput.value = '';
        updateGuestInputs();
        calculateTotal();
        modal.querySelector('h3').textContent = "Yeni Transport Paketi";
        modal.style.display = 'flex';
    };

    const openModalForEdit = (pkg) => {
        packageForm.reset();
        guestNamesContainer.innerHTML = '';
        otherCostsContainer.innerHTML = '';
        
        editingPackageId = pkg.id;
        packageIdInput.value = pkg.id;

        document.getElementById('driverName').value = pkg.driverName;
        document.getElementById('driverPayment').value = pkg.driverPayment;
        document.getElementById('destination').value = pkg.destination;
        document.getElementById('departureDate').value = pkg.departureDate;
        document.getElementById('arrivalDate').value = pkg.arrivalDate;
        document.getElementById('vehicleModel').value = pkg.vehicleModel;
        document.getElementById('vehiclePlate').value = pkg.vehiclePlate;

        guestCountInput.value = pkg.guestCount;
        updateGuestInputs();
        if (pkg.guestNames && Array.isArray(pkg.guestNames)) {
            pkg.guestNames.forEach((name, index) => {
                const input = guestNamesContainer.querySelectorAll('.guest-name-input')[index];
                if (input) input.value = name;
            });
        }

        if (pkg.otherCosts && Array.isArray(pkg.otherCosts)) {
            pkg.otherCosts.forEach(cost => addOtherCostRow(cost));
        }
        
        calculateTotal();
        modal.querySelector('h3').textContent = "Transport Paketinə Düzəliş Et";
        modal.style.display = 'flex';
    };

    const handleDeletePackage = async (id) => {
        if (!confirm('Bu transport paketini silmək istədiyinizə əminsiniz?')) return;
        try {
            const response = await fetch(`/api/transport/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).message);
            fetchAndRenderPackages();
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    };

    // --- Hadisə Dinləyiciləri ---
    showModalBtn.addEventListener('click', openModalForCreate);
    closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    guestCountInput.addEventListener('input', updateGuestInputs);
    addOtherCostBtn.addEventListener('click', addOtherCostRow);
    modal.addEventListener('input', (e) => {
        if (e.target.classList.contains('cost-input')) {
            calculateTotal();
        }
    });
    applyFiltersBtn.addEventListener('click', filterAndRender);
    resetFiltersBtn.addEventListener('click', () => {
        filterMonthInput.value = '';
        filterAndRender();
    });

    packageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const guestNames = Array.from(guestNamesContainer.querySelectorAll('.guest-name-input')).map(input => input.value.trim()).filter(Boolean);
        const otherCosts = Array.from(otherCostsContainer.querySelectorAll('.other-cost-item')).map(row => ({
            name: row.querySelector('.other-cost-name').value.trim(),
            amount: parseFloat(row.querySelector('.other-cost-amount').value) || 0
        })).filter(cost => cost.name && cost.amount > 0);

        const packageData = {
            driverName: document.getElementById('driverName').value,
            driverPayment: parseFloat(document.getElementById('driverPayment').value) || 0,
            destination: document.getElementById('destination').value,
            departureDate: document.getElementById('departureDate').value,
            arrivalDate: document.getElementById('arrivalDate').value,
            vehicleModel: document.getElementById('vehicleModel').value,
            vehiclePlate: document.getElementById('vehiclePlate').value,
            guestCount: parseInt(guestCountInput.value) || 0,
            guestNames: guestNames,
            otherCosts: otherCosts,
            totalCost: parseFloat(totalCostSpan.textContent)
        };

        const id = editingPackageId;
        const url = id ? `/api/transport/${id}` : '/api/transport';
        const method = id ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(packageData)
            });
            if (!response.ok) throw new Error((await response.json()).message);
            
            modal.style.display = 'none';
            editingPackageId = null;
            await fetchAndRenderPackages();
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    });

    // İlkin yükləmə
    fetchAndRenderPackages();
});
