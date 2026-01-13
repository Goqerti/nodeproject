// public/finance-reports.js

document.addEventListener('DOMContentLoaded', () => {
    initReports();
    setupModalListeners();
    setupFormListeners();
});

// Qlobal dəyişənlər
let allOrders = [];
let allExpenses = [];
let hotelChartInstance = null;

// --- BAŞLANĞIC YÜKLƏNMƏ ---
async function initReports() {
    try {
        // 1. Sifarişləri gətir
        const orderRes = await fetch('/api/orders');

        // --- YENİ: Sessiya bitibsə (401), girişə yönləndir ---
        if (orderRes.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!orderRes.ok) throw new Error('Sifarişləri yükləmək mümkün olmadı');
        allOrders = await orderRes.json();

        // 2. Xərcləri gətir
        const expenseRes = await fetch('/api/expenses');
        if (expenseRes.ok) {
            allExpenses = await expenseRes.json();
        }

        // 3. Hesabatları Yarat
        renderHotelTurnover(allOrders);
        populateCompanyFilter(allOrders);

    } catch (error) {
        console.error('Hesabat xətası:', error);
        // Xəta 401 deyilsə, istifadəçiyə bildir
        if (!error.message.includes('Sifarişləri yükləmək mümkün olmadı')) {
             alert('Məlumatları yükləyərkən xəta baş verdi.');
        }
    }
}

// ============================================================
// 1. OTELLƏRLƏ DÖVRİYYƏ HESABATI
// ============================================================
function renderHotelTurnover(orders) {
    const hotelStats = {};
    let totalRevenue = 0;

    orders.forEach(order => {
        let hotelName = "Digər";
        
        if (order.hotel) {
            hotelName = (typeof order.hotel === 'object') ? (order.hotel.name || "Digər") : order.hotel;
        } else if (order.pickupLocation) {
            hotelName = order.pickupLocation;
        }
        
        hotelName = hotelName.toString().trim();
        if (!hotelName || hotelName === '-') hotelName = "Digər";

        const price = parseFloat(order.price || 0);
        
        if (!hotelStats[hotelName]) {
            hotelStats[hotelName] = { count: 0, revenue: 0 };
        }

        hotelStats[hotelName].count += 1;
        hotelStats[hotelName].revenue += price;
        totalRevenue += price;
    });

    const sortedHotels = Object.entries(hotelStats)
        .map(([name, data]) => ({
            name,
            ...data,
            percentage: totalRevenue > 0 ? ((data.revenue / totalRevenue) * 100).toFixed(1) : 0
        }))
        .sort((a, b) => b.revenue - a.revenue);

    // A. Qrafik
    const ctx = document.getElementById('hotelTurnoverChart');
    if (ctx) {
        if (hotelChartInstance) {
            hotelChartInstance.destroy();
        }

        const topHotels = sortedHotels.slice(0, 15); 

        hotelChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: topHotels.map(h => h.name.length > 15 ? h.name.substring(0, 15) + '...' : h.name),
                datasets: [{
                    label: 'Dövriyyə (AZN)',
                    data: topHotels.map(h => h.revenue),
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return formatCurrency(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    // B. Cədvəl
    const tbody = document.querySelector('#hotel-turnover-table tbody');
    if (tbody) {
        tbody.innerHTML = '';
        sortedHotels.forEach(hotel => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:bold;">${hotel.name}</td>
                <td style="text-align: center;">${hotel.count}</td>
                <td style="text-align: right; color:green; font-weight:bold;">${formatCurrency(hotel.revenue)}</td>
                <td style="padding-left: 20px;">
                    <div style="display: flex; align-items: center;">
                        <div style="width: 100px; background: #eee; height: 8px; border-radius: 4px; margin-right: 10px;">
                            <div style="width: ${hotel.percentage}%; background: #36a2eb; height: 100%; border-radius: 4px;"></div>
                        </div>
                        <span>${hotel.percentage}%</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// ============================================================
// 2. XARİCİ ŞİRKƏT HESABATI
// ============================================================

function populateCompanyFilter(orders) {
    const companySelect = document.getElementById('companyFilterSelect');
    if (!companySelect) return;

    const companies = new Set();
    orders.forEach(o => {
        if (o.companyName) companies.add(o.companyName.trim());
    });

    companySelect.innerHTML = '<option value="">Bütün Şirkətlər</option>';
    Array.from(companies).sort().forEach(comp => {
        const option = document.createElement('option');
        option.value = comp;
        option.textContent = comp;
        companySelect.appendChild(option);
    });

    const btn = document.getElementById('getCompanyReportBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            const selectedCompany = companySelect.value;
            if (!selectedCompany) {
                alert('Zəhmət olmasa şirkət seçin.');
                return;
            }
            renderCompanyReport(selectedCompany);
        });
    }
}

function renderCompanyReport(companyName) {
    const filteredOrders = allOrders.filter(o => o.companyName === companyName);
    const tbody = document.getElementById('companyOrdersTableBody');
    const summaryDiv = document.getElementById('companyReportSummary');
    const resultDiv = document.getElementById('companyReportResult');

    if (!tbody || !summaryDiv || !resultDiv) return;

    summaryDiv.style.display = 'grid';
    resultDiv.style.display = 'block';
    tbody.innerHTML = '';

    let totalBuy = 0;
    let totalSale = 0;
    let totalProfit = 0;

    filteredOrders.forEach(order => {
        const buy = parseFloat(order.cost || 0);
        const sale = parseFloat(order.price || 0);
        const profit = sale - buy;

        totalBuy += buy;
        totalSale += sale;
        totalProfit += profit;

        const tr = document.createElement('tr');
        tr.className = `order-row ${getStatusClass(order.paymentStatus)}`;
        tr.innerHTML = `
            <td>${order.orderNumber || '-'}</td>
            <td>${formatTourists(order.tourists)}</td>
            <td>${formatCurrency(buy)}</td>
            <td>${formatCurrency(sale)}</td>
            <td style="color: ${profit >= 0 ? 'green' : 'red'}">${formatCurrency(profit)}</td>
            <td>
                <button onclick="editOrder('${order.id}')" class="btn-small btn-warning"><i class="fas fa-edit"></i></button>
                <button onclick="openNoteModal('${order.id}')" class="btn-small btn-info"><i class="fas fa-sticky-note"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    summaryDiv.innerHTML = `
        <div class="stat-card">
            <h4>Sifariş Sayı</h4>
            <p>${filteredOrders.length}</p>
        </div>
        <div class="stat-card">
            <h4>Ümumi Satış</h4>
            <p class="money-plus">${formatCurrency(totalSale)}</p>
        </div>
        <div class="stat-card">
            <h4>Ümumi Alış (Xərc)</h4>
            <p class="money-minus">${formatCurrency(totalBuy)}</p>
        </div>
        <div class="stat-card">
            <h4>Xalis Gəlir</h4>
            <p class="${totalProfit >= 0 ? 'money-plus' : 'money-minus'}">${formatCurrency(totalProfit)}</p>
        </div>
    `;
}

// ============================================================
// 3. MODALLAR VƏ REDAKTƏ (EDIT) FUNKSİYALARI
// ============================================================

window.openNoteModal = (id) => {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    
    document.getElementById('noteSatisNo').value = id;
    document.getElementById('noteText').value = order.notes || '';
    document.getElementById('noteModalTitle').textContent = `Qeyd: Sifariş #${order.orderNumber}`;
    document.getElementById('noteModal').style.display = 'flex';
};

window.editOrder = (id) => {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;

    const form = document.getElementById('addOrderForm');
    document.getElementById('editingOrderId').value = order.id;
    document.getElementById('editModalTitle').innerText = `Sifarişə Düzəliş: #${order.orderNumber}`;

    document.getElementById('adultGuests').value = order.adultGuests || 1;
    document.getElementById('childGuests').value = order.childGuests || 0;
    document.getElementById('xariciSirket').value = order.companyName || '';
    document.getElementById('rezNomresi').value = order.reservationNumber || '';
    document.getElementById('status').value = order.status || 'Davam edir';
    document.getElementById('qeyd').value = order.notes || '';
    document.getElementById('paymentStatus').value = order.paymentStatus || 'Ödənilməyib';
    document.getElementById('paymentDueDate').value = order.paymentDueDate || '';
    
    document.getElementById('alishAmount').value = order.cost || 0;
    document.getElementById('alishCurrency').value = order.costCurrency || 'AZN';
    document.getElementById('satishAmount').value = order.price || 0;
    document.getElementById('satishCurrency').value = order.currency || 'AZN';

    const touristsContainer = document.getElementById('touristsContainer');
    const hotelContainer = document.getElementById('hotelEntriesContainer');
    const costsContainer = document.getElementById('costsContainer');

    touristsContainer.innerHTML = '';
    hotelContainer.innerHTML = '';
    costsContainer.innerHTML = '';

    if (Array.isArray(order.tourists) && order.tourists.length > 0) {
        order.tourists.forEach(t => addTouristInput(t));
    } else {
        addTouristInput();
    }

    if (Array.isArray(order.hotels) && order.hotels.length > 0) {
         order.hotels.forEach(h => addHotelInput(h));
    } else if (order.hotel && typeof order.hotel === 'string') {
         addHotelInput({ name: order.hotel });
    } else {
         addHotelInput();
    }

    if (Array.isArray(order.costs) && order.costs.length > 0) {
        order.costs.forEach(c => addCostInput(c));
    } else {
        addCostInput();
    }

    document.getElementById('addOrderModal').style.display = 'flex';
};

function addTouristInput(value = '') {
    const container = document.getElementById('touristsContainer');
    const div = document.createElement('div');
    div.className = 'form-group-inline';
    div.innerHTML = `
        <input type="text" name="touristName" placeholder="Ad və Soyad" value="${value}" required style="flex: 1;">
        <button type="button" class="btn-danger btn-small" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
}

function addHotelInput(data = {}) {
    const container = document.getElementById('hotelEntriesContainer');
    const div = document.createElement('div');
    div.className = 'hotel-entry';
    div.innerHTML = `
        <div class="form-group-inline">
             <input type="text" class="hotel-name" placeholder="Otel Adı" value="${data.name || ''}">
             <input type="date" class="check-in" value="${data.checkIn || ''}">
             <input type="date" class="check-out" value="${data.checkOut || ''}">
             <input type="number" class="hotel-price" placeholder="Qiymət" value="${data.price || 0}" step="0.01" onchange="calculateTotalCost()">
             <button type="button" class="btn-danger btn-small" onclick="this.parentElement.parentElement.remove(); calculateTotalCost()">Sil</button>
        </div>
    `;
    container.appendChild(div);
}

function addCostInput(data = {}) {
    const container = document.getElementById('costsContainer');
    const div = document.createElement('div');
    div.className = 'form-group-inline payment-item';
    div.innerHTML = `
        <input type="text" class="cost-name" placeholder="Xərc adı (məs: Transfer)" value="${data.name || ''}">
        <input type="number" class="cost-amount" placeholder="Məbləğ" value="${data.amount || 0}" step="0.01" onchange="calculateTotalCost()">
        <select class="cost-currency">
            <option value="AZN" ${data.currency === 'AZN' ? 'selected' : ''}>AZN</option>
            <option value="USD" ${data.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="EUR" ${data.currency === 'EUR' ? 'selected' : ''}>EUR</option>
        </select>
        <button type="button" class="payment-toggle-btn ${data.isPaid ? 'paid' : ''}" onclick="togglePaid(this)">${data.isPaid ? 'Ödənildi' : 'Ödənilməyib'}</button>
        <button type="button" class="btn-danger btn-small" onclick="this.parentElement.remove(); calculateTotalCost()">X</button>
    `;
    container.appendChild(div);
}

window.calculateTotalCost = () => {
    let total = 0;
    document.querySelectorAll('.hotel-price').forEach(inp => {
        total += parseFloat(inp.value || 0);
    });
    document.querySelectorAll('.cost-amount').forEach(inp => {
        total += parseFloat(inp.value || 0);
    });
    document.getElementById('alishAmount').value = total.toFixed(2);
};

window.togglePaid = (btn) => {
    btn.classList.toggle('paid');
    btn.innerText = btn.classList.contains('paid') ? 'Ödənildi' : 'Ödənilməyib';
};

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'addHotelBtn') {
        addHotelInput();
    }
});

function setupModalListeners() {
    document.querySelectorAll('.close-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        });
    });
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = "none";
        }
    };
}

function setupFormListeners() {
    const orderForm = document.getElementById('addOrderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editingOrderId').value;
            if (!id) return;

            const tourists = [];
            document.querySelectorAll('#touristsContainer input[name="touristName"]').forEach(inp => {
                if(inp.value) tourists.push(inp.value);
            });

            const hotels = [];
            document.querySelectorAll('.hotel-entry').forEach(div => {
                hotels.push({
                    name: div.querySelector('.hotel-name').value,
                    checkIn: div.querySelector('.check-in').value,
                    checkOut: div.querySelector('.check-out').value,
                    price: parseFloat(div.querySelector('.hotel-price').value || 0)
                });
            });

            const costs = [];
            document.querySelectorAll('#costsContainer .payment-item').forEach(div => {
                costs.push({
                    name: div.querySelector('.cost-name').value,
                    amount: parseFloat(div.querySelector('.cost-amount').value || 0),
                    currency: div.querySelector('.cost-currency').value,
                    isPaid: div.querySelector('.payment-toggle-btn').classList.contains('paid')
                });
            });

            const data = {
                adultGuests: document.getElementById('adultGuests').value,
                childGuests: document.getElementById('childGuests').value,
                tourists: tourists,
                companyName: document.getElementById('xariciSirket').value,
                reservationNumber: document.getElementById('rezNomresi').value,
                hotels: hotels,
                costs: costs,
                cost: document.getElementById('alishAmount').value,
                costCurrency: document.getElementById('alishCurrency').value,
                price: document.getElementById('satishAmount').value,
                currency: document.getElementById('satishCurrency').value,
                status: document.getElementById('status').value,
                notes: document.getElementById('qeyd').value,
                paymentStatus: document.getElementById('paymentStatus').value,
                paymentDueDate: document.getElementById('paymentDueDate').value
            };

            try {
                const res = await fetch(`/api/orders/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (res.status === 401) return window.location.href = '/login.html';

                if (res.ok) {
                    alert('Sifariş yeniləndi!');
                    document.getElementById('addOrderModal').style.display = 'none';
                    initReports(); 
                } else {
                    alert('Yenilənmə zamanı xəta.');
                }
            } catch (err) {
                console.error(err);
                alert('Server xətası.');
            }
        });
    }

    const noteForm = document.getElementById('noteForm');
    if (noteForm) {
        noteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('noteSatisNo').value;
            const notes = document.getElementById('noteText').value;

            try {
                const order = allOrders.find(o => o.id === id);
                if(order) {
                    const updatedData = { ...order, notes: notes };
                    const res = await fetch(`/api/orders/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedData)
                    });
                    
                    if (res.status === 401) return window.location.href = '/login.html';

                    if(res.ok) {
                        alert('Qeyd yadda saxlanıldı');
                        document.getElementById('noteModal').style.display = 'none';
                        initReports();
                    }
                }
            } catch (err) {
                console.error(err);
            }
        });
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN' }).format(amount);
}

function formatTourists(tourists) {
    if (!tourists) return '-';
    if (Array.isArray(tourists)) return tourists.join(', ');
    return tourists;
}

function getStatusClass(status) {
    if (status === 'Ödənilib') return 'status-paid';
    if (status === 'Qismən ödənilib') return 'status-partial';
    return 'status-unpaid';
}