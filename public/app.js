// public/app.js

// --- Qlobal Tab Dəyişmə Funksiyası (Maliyyə Modalı üçün) ---
// HTML-dən onclick="switchFinancialTab(...)" işləməsi üçün window obyektinə bərkidirik.
window.switchFinancialTab = function(tabId) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
    
    // Kliklənən tabı aktiv et
    const activeTabBtn = Array.from(document.querySelectorAll('.modal-tab')).find(t => t.getAttribute('onclick').includes(tabId));
    if(activeTabBtn) activeTabBtn.classList.add('active');
    
    document.getElementById(tabId).classList.add('active');
};

document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. DİL VƏ TƏRCÜMƏ SİSTEMİ ---
    await i18n.loadTranslations(localStorage.getItem('lang') || 'az');
    i18n.translatePage();
    i18n.setupLanguageSwitcher('lang-switcher-main', () => {
        fetchOrdersAndRender();
        fetchAndRenderDebts();
    });

    // --- 2. QLOBAL DƏYİŞƏNLƏR ---
    let currentUserRole = null;
    let currentUserDisplayName = null;
    let currentUserPermissions = {};
    let currentOrders = [];
    let editingOrderId = null;
    let wanderingInterval = null;
    
    // Arxiv Rejimi
    let isArchiveMode = false;
    
    // Toplu Seçim (Bulk Action) Rejimi
    let isMultiSelectMode = false;
    let selectedOrderIds = new Set();

    // --- 3. DOM ELEMENTLƏRİ ---
    const addOrderForm = document.getElementById('addOrderForm');
    const modal = document.getElementById('addOrderModal');
    const showAddOrderFormBtn = document.getElementById('showAddOrderFormBtn');
    const addHotelBtn = document.getElementById('addHotelBtn');
    const hotelEntriesContainer = document.getElementById('hotelEntriesContainer');
    const ordersTableBody = document.getElementById('ordersTableBody');
    const modalTitle = modal?.querySelector('h3');
    const modalSubmitButton = modal?.querySelector('button[type="submit"]');
    const closeButton = modal?.querySelector('.modal-content .close-button');
    
    // Naviqasiya Düymələri
    const navSatishlarBtn = document.getElementById('navSatishlarBtn');
    const navRezervasiyalarBtn = document.getElementById('navRezervasiyalarBtn');
    const navBildirishlerBtn = document.getElementById('navBildirishlerBtn');
    const navChatBtn = document.getElementById('navChatBtn');
    const navAxtarishBtn = document.getElementById('navAxtarishBtn');
    const navHesabatBtn = document.getElementById('navHesabatBtn');
    const navBorclarBtn = document.getElementById('navBorclarBtn');
    const navTransportBtn = document.getElementById('navTransportBtn');
    const navTasksBtn = document.getElementById('navTasksBtn');

    // Görünüşlər (Views)
    const views = {
        satishlar: document.getElementById('satishlarView'),
        rezervasiyalar: document.getElementById('rezervasiyalarView'),
        bildirishler: document.getElementById('bildirishlerView'),
        chat: document.getElementById('chatView'),
        axtarish: document.getElementById('searchView'),
        hesabat: document.getElementById('hesabatView'),
        borclar: document.getElementById('borclarView')
    };

    // Filterlər
    const filterRezNoInput = document.getElementById('filterRezNo');
    const notificationCountBadge = document.getElementById('notification-count');
    const tasksCountBadge = document.getElementById('tasks-count');
    const totalOrdersEl = document.getElementById('totalOrders');
    
    // Maliyyə Modalı Elementləri
    const showTotalBtn = document.getElementById('showTotalBtn');
    const financialModal = document.getElementById('financialModal');
    
    // Hesabatlar Elementləri
    const reportTypeSelect = document.getElementById('reportTypeSelect');
    const reportEntitySelect = document.getElementById('reportEntitySelect');
    const getDetailedReportBtn = document.getElementById('getDetailedReportBtn');
    
    // Toplu Seçim Paneli
    const bulkActionPanel = document.getElementById('bulkActionPanel');
    const bulkCount = document.getElementById('bulkCount');
    const bulkArchiveBtn = document.getElementById('bulkArchiveBtn');
    const bulkCancelBtn = document.getElementById('bulkCancelBtn');

    // Tənzimləmələr Paneli
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettingsPanelBtn = document.getElementById('closeSettingsPanelBtn');
    const mascotOnBtn = document.getElementById('mascotOnBtn');
    const mascotOffBtn = document.getElementById('mascotOffBtn');

    // --- 4. İSTİFADƏÇİ MƏLUMATLARININ YÜKLƏNMƏSİ ---
    try {
        const [userRes, permsRes] = await Promise.all([
            fetch('/api/user/me'),
            fetch('/api/user/permissions')
        ]);
        if (!userRes.ok || !permsRes.ok) {
            window.location.href = '/login.html';
            return;
        }
        const user = await userRes.json();
        currentUserRole = user.role;
        currentUserDisplayName = user.displayName;
        currentUserPermissions = await permsRes.json();
        
        // Headerdə adı göstər
        document.getElementById('main-header-title').textContent = currentUserDisplayName;
        
        // Maliyyə naviqasiya düyməsi (Yalnız Owner və Finance)
        const navFinanceBtn = document.getElementById('navFinanceBtn');
        if (navFinanceBtn && (currentUserRole === 'owner' || currentUserRole === 'finance')) {
             navFinanceBtn.style.display = 'inline-flex';
        }

        // Maliyyə Hesabatı düyməsi (İcazəyə görə)
        if (showTotalBtn) {
            if (currentUserRole !== 'owner' && !currentUserPermissions.canViewFinancials) {
                showTotalBtn.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('Login Error:', error);
        window.location.href = '/login.html';
    }

    // --- 5. AUTOCOMPLETE (AVTOMATİK TAMAMLAMA) SİSTEMİ ---
    // Bazadakı otel adlarını real vaxtda süzgəcdən keçirib təklif edir.

    function getUniqueHotelNames() {
        const names = new Set();
        if (currentOrders && Array.isArray(currentOrders)) {
            currentOrders.forEach(order => {
                if (order.hotels && Array.isArray(order.hotels)) {
                    order.hotels.forEach(hotel => {
                        if (hotel.otelAdi && hotel.otelAdi.trim() !== "") {
                            names.add(hotel.otelAdi.trim());
                        }
                    });
                }
            });
        }
        return Array.from(names).sort();
    }

    function setupAutocomplete(inp) {
        let currentFocus;
        
        // Inputa yazı yazıldıqda
        inp.addEventListener("input", function(e) {
            let a, b, i, val = this.value;
            
            // Açıq olan siyahıları bağla
            closeAllLists();
            if (!val) { return false; }
            currentFocus = -1;

            // Siyahı div-ni yarat
            a = document.createElement("DIV");
            a.setAttribute("id", this.id + "autocomplete-list");
            a.setAttribute("class", "autocomplete-items");
            
            // Input-un valideyninə əlavə et
            this.parentNode.appendChild(a);

            // Bazadakı adları gətir
            const hotelNames = getUniqueHotelNames();
            
            for (i = 0; i < hotelNames.length; i++) {
                // Hərf uyğunluğunu yoxla (Case-insensitive)
                if (hotelNames[i].toUpperCase().includes(val.toUpperCase())) {
                    
                    b = document.createElement("DIV");
                    
                    // Uyğun gələn hissəni qalınlaşdır
                    const startIndex = hotelNames[i].toUpperCase().indexOf(val.toUpperCase());
                    const matchPart = hotelNames[i].substr(startIndex, val.length);
                    const beforeMatch = hotelNames[i].substr(0, startIndex);
                    const afterMatch = hotelNames[i].substr(startIndex + val.length);
                    
                    b.innerHTML = beforeMatch + "<strong>" + matchPart + "</strong>" + afterMatch;
                    b.innerHTML += "<input type='hidden' value='" + hotelNames[i] + "'>";
                    
                    // Kliklənəndə inputa yaz
                    b.addEventListener("click", function(e) {
                        inp.value = this.getElementsByTagName("input")[0].value;
                        closeAllLists();
                    });
                    a.appendChild(b);
                }
            }
        });

        // Klaviatura düymələri
        inp.addEventListener("keydown", function(e) {
            let x = document.getElementById(this.id + "autocomplete-list");
            if (x) x = x.getElementsByTagName("div");
            if (e.keyCode == 40) { // Aşağı ox
                currentFocus++;
                addActive(x);
            } else if (e.keyCode == 38) { // Yuxarı ox
                currentFocus--;
                addActive(x);
            } else if (e.keyCode == 13) { // Enter
                e.preventDefault();
                if (currentFocus > -1) {
                    if (x) x[currentFocus].click();
                }
            }
        });

        function addActive(x) {
            if (!x) return false;
            removeActive(x);
            if (currentFocus >= x.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (x.length - 1);
            x[currentFocus].classList.add("autocomplete-active");
        }

        function removeActive(x) {
            for (let i = 0; i < x.length; i++) {
                x[i].classList.remove("autocomplete-active");
            }
        }

        function closeAllLists(elmnt) {
            var x = document.getElementsByClassName("autocomplete-items");
            for (let i = 0; i < x.length; i++) {
                if (elmnt != x[i] && elmnt != inp) {
                    x[i].parentNode.removeChild(x[i]);
                }
            }
        }

        document.addEventListener("click", function (e) {
            closeAllLists(e.target);
        });
    }

    // --- 6. FORM VƏ HESABLAMA FUNKSİYALARI ---

    // Otel Sətri Əlavə Et (Autocomplete qoşulmuş halda)
    const addHotelEntry = (hotel = {}) => {
        if (!hotelEntriesContainer) return;
        const entryId = `hotel-entry-${Date.now()}${Math.random()}`;
        const hotelEntryDiv = document.createElement('div');
        hotelEntryDiv.className = 'hotel-entry';
        
        hotelEntryDiv.innerHTML = `
            <div class="form-group-inline">
                <div style="position: relative; flex-grow: 1;">
                    <input type="text" class="hotel_otelAdi" id="input-${entryId}" placeholder="Otel Adı" value="${hotel.otelAdi || ''}" autocomplete="off">
                </div>
                <input type="number" step="0.01" class="hotel-price-input cost-input" placeholder="Qiymət" value="${hotel.qiymet || 0}">
                <button type="button" class="action-btn-small remove-hotel-btn">-</button>
            </div>
            <div class="form-group-inline">
                <input type="text" class="hotel_otaqKategoriyasi" placeholder="Otaq Kateqoriyası" value="${hotel.otaqKategoriyasi || ''}">
            </div>
            <div class="form-group-inline">
                <div><label>Giriş Tarixi:</label><input type="date" class="hotel_girisTarixi" value="${hotel.girisTarixi || ''}"></div>
                <div><label>Çıxış Tarixi:</label><input type="date" class="hotel_cixisTarixi" value="${hotel.cixisTarixi || ''}"></div>
            </div>
            <div class="file-upload-wrapper">
                <label class="file-upload-label">Sənəd Seç <input type="file" class="hotel-confirmation-upload" style="display:none"></label>
                <span class="file-status"></span>
                <a href="${hotel.confirmationPath || '#'}" class="view-confirmation" target="_blank" style="display: ${hotel.confirmationPath ? 'inline' : 'none'};">🔗</a>
                <input type="hidden" class="hotel-confirmation-path" value="${hotel.confirmationPath || ''}">
            </div>
            <hr class="dashed">
        `;
        hotelEntriesContainer.appendChild(hotelEntryDiv);
        
        // Yeni yaranan inputa autocomplete-i qoşuruq
        setupAutocomplete(hotelEntryDiv.querySelector('.hotel_otelAdi'));
    };

    const calculateGelir = (order) => {
        const alish = order.alish?.amount || 0;
        const satish = order.satish?.amount || 0;
        if (order.alish?.currency === order.satish?.currency) {
            return { amount: (satish - alish).toFixed(2), currency: order.satish.currency };
        }
        return { amount: 0, currency: 'N/A', note: 'Fərqli' };
    };

    const calculateTotalCost = () => {
        let total = 0;
        document.querySelectorAll('#addOrderForm .cost-input').forEach(input => {
            if (!input.disabled) total += parseFloat(input.value) || 0;
        });
        const alishInp = document.getElementById('alishAmount');
        if(alishInp) alishInp.value = total.toFixed(2);
    };

    const resetModalToCreateMode = () => {
        if (addOrderForm) addOrderForm.reset();
        if (hotelEntriesContainer) hotelEntriesContainer.innerHTML = '';
        addHotelEntry();
        calculateTotalCost();
        if (modalTitle) modalTitle.textContent = i18n.t('modalTitleNewOrder');
        if (modalSubmitButton) modalSubmitButton.textContent = i18n.t('addOrderButton');
        editingOrderId = null;
    };

    // --- 7. MƏLUMATLARIN YÜKLƏNMƏSİ VƏ GÖSTƏRİLMƏSİ ---

    const fetchOrdersAndRender = async () => {
        try {
            // Rejimə uyğun API seçimi
            const endpoint = isArchiveMode ? '/api/orders/archive' : '/api/orders';
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error("Məlumat yüklənmədi");
            currentOrders = await response.json();
            
            // Filterləmə
            const filterRez = filterRezNoInput.value.trim().toLowerCase();
            const filterD = document.getElementById('filterDate').value;
            const filterM = document.getElementById('filterMonth').value;
            const filterY = document.getElementById('filterYear').value;

            let filtered = currentOrders;
            if(filterRez) filtered = filtered.filter(o => o.rezNomresi?.toLowerCase().includes(filterRez));
            if(filterD) filtered = filtered.filter(o => o.creationTimestamp.startsWith(filterD));
            else if(filterM) filtered = filtered.filter(o => o.creationTimestamp.startsWith(filterM));
            else if(filterY) filtered = filtered.filter(o => new Date(o.creationTimestamp).getFullYear() == filterY);

            renderOrdersTable(filtered);
        } catch (error) {
            console.error(error);
            ordersTableBody.innerHTML = `<tr><td colspan="15" style="color:red;text-align:center">${error.message}</td></tr>`;
        }
    };

    const renderOrdersTable = (orders) => {
        ordersTableBody.innerHTML = '';
        if (totalOrdersEl) totalOrdersEl.textContent = orders.length;
        if (orders.length === 0) {
            ordersTableBody.innerHTML = `<tr><td colspan="15" style="text-align:center;">Məlumat yoxdur.</td></tr>`;
            return;
        }

        // Sıralama: Ən yeni yuxarıda
        orders.sort((a, b) => new Date(b.creationTimestamp) - new Date(a.creationTimestamp));

        orders.forEach(order => {
            const row = ordersTableBody.insertRow();
            row.dataset.id = order.satisNo;

            // TOPLU SEÇİM LOGİKASI (Click Handler)
            if (currentUserRole === 'owner' || currentUserPermissions.canArchiveOrder) {
                row.addEventListener('click', (e) => {
                    // Əgər rejim aktivdirsə və kliklənən yer düymə deyilsə
                    if (isMultiSelectMode && !e.target.closest('button')) {
                        if (selectedOrderIds.has(order.satisNo)) {
                            selectedOrderIds.delete(order.satisNo);
                            row.classList.remove('selected-row');
                        } else {
                            selectedOrderIds.add(order.satisNo);
                            row.classList.add('selected-row');
                        }
                        bulkCount.textContent = `${selectedOrderIds.size} sifariş seçilib`;
                    }
                });
            }

            // Sütunlar
            let i = 0;
            row.insertCell(i++).textContent = order.satisNo;
            row.insertCell(i++).textContent = new Date(order.creationTimestamp).toLocaleString('az-AZ');
            row.insertCell(i++).textContent = order.rezNomresi || '-';
            
            const touristCell = row.insertCell(i++);
            const tList = order.tourists || [order.turist];
            touristCell.textContent = tList.length > 1 ? `${tList[0]} (+${tList.length-1})` : (tList[0] || '-');
            
            row.insertCell(i++).textContent = order.adultGuests || '0';
            row.insertCell(i++).textContent = order.childGuests || '0';
            row.insertCell(i++).textContent = order.xariciSirket || '-';
            row.insertCell(i++).textContent = order.hotels?.[0]?.otelAdi || '-';
            row.insertCell(i++).textContent = order.hotels?.[0]?.girisTarixi || '-';
            row.insertCell(i++).textContent = `${(order.alish?.amount || 0).toFixed(2)} ${order.alish?.currency || ''}`;
            row.insertCell(i++).textContent = `${(order.satish?.amount || 0).toFixed(2)} ${order.satish?.currency || ''}`;
            
            const income = calculateGelir(order);
            row.insertCell(i++).textContent = `${income.amount} ${income.currency}`;
            
            const statusKey = { 'Davam edir': 'statusInProgress', 'Bitdi': 'statusCompleted', 'Ləğv edildi': 'statusCancelled' }[order.status] || 'statusInProgress';
            row.insertCell(i++).textContent = i18n.t(statusKey);

            // ƏMƏLİYYATLAR SÜTUNU
            const actionCell = row.insertCell(i++);
            
            // Rejimə görə düymələr
            if (!isArchiveMode) {
                // AKTUAL REJİM DÜYMƏLƏRİ
                if(currentUserPermissions.canEditOrder) {
                    const editBtn = createActionBtn('✏️', () => handleEditOrder(order.satisNo), 'edit');
                    actionCell.appendChild(editBtn);
                }
                if(currentUserPermissions.canDeleteOrder) {
                    const delBtn = createActionBtn('🗑️', () => handleDeleteOrder(order.satisNo), 'delete');
                    actionCell.appendChild(delBtn);
                }
                // Arxivlə Düyməsi (İcazə ilə)
                if(currentUserRole === 'owner' || currentUserPermissions.canArchiveOrder) {
                    const arcBtn = createActionBtn('📁', (e) => { e.stopPropagation(); handleArchiveOrder(order.satisNo); }, 'archive');
                    arcBtn.style.backgroundColor = '#17a2b8'; arcBtn.style.color = 'white';
                    arcBtn.title = "Arxivlə";
                    actionCell.appendChild(arcBtn);
                }
            } else {
                // ARXİV REJİMİ DÜYMƏLƏRİ
                // Geri Qaytar (Restore)
                if(currentUserRole === 'owner' || currentUserPermissions.canArchiveOrder) {
                    const restoreBtn = document.createElement('button');
                    restoreBtn.className = 'action-btn';
                    restoreBtn.innerHTML = '<i class="fas fa-undo"></i>';
                    restoreBtn.title = "Geri Qaytar (Aktual siyahıya)";
                    restoreBtn.style.backgroundColor = '#28a745'; 
                    restoreBtn.style.color = 'white';
                    restoreBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if(!confirm(`Sifariş №${order.satisNo} arxivdən geri qaytarılsın?`)) return;
                        try {
                            const res = await fetch(`/api/orders/restore/${order.satisNo}`, { method: 'POST' });
                            const d = await res.json();
                            if(res.ok) {
                                alert(d.message);
                                fetchOrdersAndRender();
                            } else {
                                alert(d.message);
                            }
                        } catch(err) { alert("Xəta: " + err.message); }
                    };
                    actionCell.appendChild(restoreBtn);
                }
            }

            // Qeyd düyməsi (Hər iki rejimdə)
            const noteCell = row.insertCell(i++);
            const noteBtn = createActionBtn('📄', (e) => { e.stopPropagation(); handleShowNoteModal(order.satisNo); }, 'note');
            noteCell.appendChild(noteBtn);
        });
    };

    function createActionBtn(icon, onClick, cls) {
        const btn = document.createElement('button');
        btn.className = `action-btn ${cls}`;
        btn.innerHTML = icon;
        btn.onclick = onClick;
        return btn;
    }

    // --- 8. ARXİV VƏ TOPLU SEÇİM FUNKSİONALLIĞI ---

    // Arxivə Baxış / Qayıt Düyməsini Yaratmaq
    if (document.querySelector('#satishlarView .actions') && !document.getElementById('viewArchiveBtn')) {
        const btn = document.createElement('button');
        btn.id = 'viewArchiveBtn';
        btn.innerHTML = '<i class="fas fa-archive"></i> Arxivə Bax';
        btn.style.cssText = "margin-left:10px; padding:12px; background:#6c757d; color:white; border:none; border-radius:8px; cursor:pointer;";
        
        btn.onclick = () => {
            isArchiveMode = !isArchiveMode;
            btn.innerHTML = isArchiveMode ? '<i class="fas fa-arrow-left"></i> Aktuallara Qayıt' : '<i class="fas fa-archive"></i> Arxivə Bax';
            btn.style.background = isArchiveMode ? '#28a745' : '#6c757d';
            
            // Arxiv rejimində maliyyə hesabatı və toplu seçim gizlənir
            if(isArchiveMode) {
                if(showTotalBtn) showTotalBtn.style.display = 'none';
                if(isMultiSelectMode) toggleMultiSelectMode(true); // Rejimi söndür
            } else {
                // Aktuala qayıdanda maliyyəni göstər (icazə varsa)
                if(showTotalBtn && (currentUserRole === 'owner' || currentUserPermissions.canViewFinancials)) {
                    showTotalBtn.style.display = 'inline-flex';
                }
            }
            fetchOrdersAndRender();
        };
        document.querySelector('#satishlarView .actions').appendChild(btn);
    }

    // CTRL + O (Toplu Seçim Rejimi)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            // Yalnız icazəsi olanlar və yalnız aktual siyahıda
            if(currentUserRole !== 'owner' && !currentUserPermissions.canArchiveOrder) return;
            if (isArchiveMode) return; 

            toggleMultiSelectMode();
        }
    });

    function toggleMultiSelectMode(forceOff = false) {
        if (forceOff) isMultiSelectMode = false;
        else isMultiSelectMode = !isMultiSelectMode;

        if (isMultiSelectMode) {
            bulkActionPanel.style.display = 'block';
            document.body.style.cursor = 'cell'; // Kursoru dəyiş
        } else {
            bulkActionPanel.style.display = 'none';
            document.body.style.cursor = 'default';
            selectedOrderIds.clear();
            document.querySelectorAll('.selected-row').forEach(r => r.classList.remove('selected-row'));
        }
        bulkCount.textContent = "0 sifariş seçilib";
    }

    // Toplu Arxivləməni Təsdiqlə
    if(bulkArchiveBtn) {
        bulkArchiveBtn.addEventListener('click', async () => {
            if (!selectedOrderIds.size) return alert("Heç bir sifariş seçilməyib!");
            if (!confirm(`${selectedOrderIds.size} ədəd sifariş arxivlənsin?`)) return;
            
            try {
                const res = await fetch('/api/orders/archive-bulk', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ satisNos: Array.from(selectedOrderIds) })
                });
                const d = await res.json();
                if(d.success) {
                    toggleMultiSelectMode(true); // Rejimi söndür
                    fetchOrdersAndRender();
                    alert(d.message);
                } else {
                    alert(d.message);
                }
            } catch(e) { 
                alert("Server xətası"); 
            }
        });
    }
    
    // Toplu seçimi ləğv et
    if(bulkCancelBtn) bulkCancelBtn.addEventListener('click', () => toggleMultiSelectMode(true));

    // Tək arxivləmə funksiyası
    async function handleArchiveOrder(satisNo) {
        if(!confirm(`Sifariş №${satisNo} arxivə göndərilsin?`)) return;
        await fetch(`/api/orders/archive/${satisNo}`, {method:'POST'});
        fetchOrdersAndRender();
    }

    // --- 9. MALİYYƏ MODALI (Şifrəli + Tablı) ---
    if (showTotalBtn) {
        showTotalBtn.addEventListener('click', () => {
            if (currentUserRole !== 'owner' && !currentUserPermissions.canViewFinancials) {
                alert("Sizin bu bölməyə giriş icazəniz yoxdur."); return;
            }
            
            const pass = prompt("Şifrəli Bölmə: Zəhmət olmasa şifrəni daxil edin:");
            if (pass === "admin123") {
                renderDetailedFinancialModal();
            } else if (pass !== null) {
                alert("Şifrə yanlışdır!");
            }
        });
    }

    async function renderDetailedFinancialModal() {
        try {
            const res = await fetch('/api/orders'); // Yalnız aktivləri gətirir
            const orders = await res.json();
            
            let totals = { AZN: createStat(), USD: createStat(), EUR: createStat() };
            let compStats = {};
            let hotelStats = {};

            orders.forEach(o => {
                const curr = o.satish?.currency || 'AZN';
                if(!totals[curr]) totals[curr] = createStat();
                
                // Ümumi
                addToStat(totals[curr], o);

                // Şirkət
                const comp = o.xariciSirket || "Digər";
                if(!compStats[comp]) compStats[comp] = { AZN: createStat(), USD: createStat(), EUR: createStat() };
                addToStat(compStats[comp][curr], o);

                // Otel
                if(o.hotels && Array.isArray(o.hotels)) {
                    o.hotels.forEach(h => {
                        const hn = h.otelAdi || "Digər";
                        if(!hotelStats[hn]) hotelStats[hn] = { AZN: createStat(), USD: createStat(), EUR: createStat() };
                        addToStat(hotelStats[hn][curr], o); 
                    });
                }
            });

            // 1. Ümumi Tab Render
            let genHtml = '';
            Object.keys(totals).forEach(c => {
                if(totals[c].satish > 0 || totals[c].alish > 0 || totals[c].debt > 0) genHtml += createStatCard(c, totals[c]);
            });
            document.getElementById('financialDataContent').innerHTML = genHtml || '<p>Məlumat yoxdur</p>';

            // 2. Şirkət Tab Render
            let cHtml = '<table class="mini-report-table"><thead><tr><th>Şirkət</th><th>Val</th><th>Alış</th><th>Satış</th><th>Gəlir</th><th>Borc</th></tr></thead><tbody>';
            Object.keys(compStats).sort().forEach(c => {
                Object.keys(compStats[c]).forEach(cur => {
                    const d = compStats[c][cur];
                    if(d.satish > 0 || d.alish > 0 || d.debt > 0) {
                        cHtml += `<tr><td>${c}</td><td>${cur}</td><td>${d.alish.toFixed(2)}</td><td>${d.satish.toFixed(2)}</td><td style="color:${d.gelir<0?'red':'green'}">${d.gelir.toFixed(2)}</td><td style="color:red">${d.debt.toFixed(2)}</td></tr>`;
                    }
                });
            });
            document.getElementById('financialCompaniesContent').innerHTML = cHtml + '</tbody></table>';

            // 3. Otel Tab Render
            let hHtml = '<table class="mini-report-table"><thead><tr><th>Otel</th><th>Val</th><th>Alış</th><th>Satış</th><th>Gəlir</th></tr></thead><tbody>';
            Object.keys(hotelStats).sort().forEach(h => {
                Object.keys(hotelStats[h]).forEach(cur => {
                    const d = hotelStats[h][cur];
                    if(d.satish > 0 || d.alish > 0) {
                        hHtml += `<tr><td>${h}</td><td>${cur}</td><td>${d.alish.toFixed(2)}</td><td>${d.satish.toFixed(2)}</td><td style="color:${d.gelir<0?'red':'green'}">${d.gelir.toFixed(2)}</td></tr>`;
                    }
                });
            });
            document.getElementById('financialHotelsContent').innerHTML = hHtml + '</tbody></table>';

            financialModal.style.display = 'block';

        } catch(e) { console.error(e); alert("Hesabat xətası"); }
    }
    
    function createStat() { return { alish: 0, satish: 0, gelir: 0, debt: 0 }; }
    function addToStat(obj, o) {
        obj.alish += (o.alish?.amount || 0);
        obj.satish += (o.satish?.amount || 0);
        if(o.alish?.currency === o.satish?.currency) obj.gelir += ((o.satish?.amount||0) - (o.alish?.amount||0));
        if(!o.paymentStatus || o.paymentStatus === 'Ödənilməyib') obj.debt += (o.satish?.amount||0);
    }
    function createStatCard(title, d) {
        return `<div class="currency-card"><h4>${title}</h4><p>Alış: ${d.alish.toFixed(2)}</p><p>Satış: ${d.satish.toFixed(2)}</p><p>Gəlir: <b style="color:${d.gelir<0?'red':'green'}">${d.gelir.toFixed(2)}</b></p><p>Borc: <b style="color:red">${d.debt.toFixed(2)}</b></p></div>`;
    }

    // --- 10. REZERVASİYALAR (Yenidən Köhnəyə) ---
    const fetchReservationsAndRender = async () => {
        try {
            const res = await fetch('/api/reservations');
            if(!res.ok) return;
            let list = await res.json();
            
            const h = document.getElementById('reservationFilterHotelName').value.trim().toLowerCase();
            const d = document.getElementById('reservationFilterDate').value;
            const m = document.getElementById('reservationFilterMonth').value;
            
            if(h) list = list.filter(r => r.otelAdi.toLowerCase().includes(h));
            if(d) list = list.filter(r => r.girisTarixi === d);
            else if(m) list = list.filter(r => r.girisTarixi.startsWith(m));

            // SORT: Ən gələcək/yeni tarix yuxarıda (b - a)
            list.sort((a, b) => new Date(b.girisTarixi) - new Date(a.girisTarixi));

            const tbody = document.getElementById('reservationsTableBody');
            tbody.innerHTML = '';
            
            if(list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Məlumat yoxdur</td></tr>';
                return;
            }

            list.forEach(r => {
                const tr = tbody.insertRow();
                tr.insertCell().textContent = r.satisNo;
                tr.insertCell().textContent = r.turist;
                tr.insertCell().textContent = r.otelAdi;
                tr.insertCell().textContent = r.girisTarixi;
                tr.insertCell().textContent = r.cixisTarixi;
                tr.insertCell().textContent = r.adultGuests;
                tr.insertCell().textContent = r.childGuests;
                const ac = tr.insertCell();
                if(currentUserPermissions.canEditOrder) {
                    const btn = document.createElement('button'); btn.innerHTML='✏️'; btn.className='action-btn edit';
                    btn.onclick = () => { 
                        setupNavigation().showView('satishlar'); 
                        handleEditOrder(r.satisNo); 
                    };
                    ac.appendChild(btn);
                }
            });
        } catch(e) { console.error(e); }
    };

    // --- 11. HESABAT FİLTRLƏRİ (Şirkət və Otel Dropdown) ---
    if(reportTypeSelect) {
        async function popFilters() {
            try {
                const res = await fetch('/api/orders');
                const data = await res.json();
                const set = new Set();
                const type = reportTypeSelect.value;
                
                data.forEach(o => {
                    if(type==='company' && o.xariciSirket) set.add(o.xariciSirket);
                    if(type==='hotel' && o.hotels) o.hotels.forEach(h=>set.add(h.otelAdi));
                });
                
                reportEntitySelect.innerHTML = '<option value="">--Seçin--</option>';
                Array.from(set).sort().forEach(x => {
                    const op = document.createElement('option'); op.value=x; op.textContent=x;
                    reportEntitySelect.appendChild(op);
                });
            } catch(e){}
        }
        
        reportTypeSelect.addEventListener('change', popFilters);
        document.getElementById('navHesabatBtn').addEventListener('click', popFilters);
        
        getDetailedReportBtn.addEventListener('click', async () => {
            const type = reportTypeSelect.value;
            const val = reportEntitySelect.value;
            if(!val) return alert("Seçim edin");
            
            const res = await fetch('/api/orders');
            const data = await res.json();
            
            let filtered = [];
            if(type==='company') filtered = data.filter(o => o.xariciSirket === val);
            else filtered = data.filter(o => o.hotels && o.hotels.some(h => h.otelAdi === val));
            
            const tbody = document.getElementById('detailedReportTableBody');
            tbody.innerHTML = '';
            document.getElementById('detailedReportResult').style.display = 'block';
            document.getElementById('detailedReportSummary').style.display = 'grid';
            document.getElementById('detailedReportSummary').innerHTML = `<div class="stat-card"><h4>${val}</h4><p>${filtered.length} sifariş</p></div>`;

            filtered.forEach(o => {
                const tr = tbody.insertRow();
                tr.insertCell().textContent = o.satisNo;
                tr.insertCell().textContent = (o.tourists||[])[0] || o.turist;
                tr.insertCell().textContent = val;
                tr.insertCell().textContent = (o.alish?.amount||0).toFixed(2);
                tr.insertCell().textContent = (o.satish?.amount||0).toFixed(2);
                
                let inc = 0; 
                if(o.alish?.currency===o.satish?.currency) inc = (o.satish?.amount||0) - (o.alish?.amount||0);
                const tdInc = tr.insertCell();
                tdInc.textContent = inc.toFixed(2);
                if(inc<0) tdInc.style.color='red';
                
                const ac = tr.insertCell();
                const b = document.createElement('button'); b.textContent='Bax'; b.className='action-btn edit';
                b.onclick = () => { setupNavigation().showView('satishlar'); handleEditOrder(o.satisNo); };
                ac.appendChild(b);
            });
        });
    }

    // --- 12. BORCLAR VƏ BİLDİRİŞLƏR ---
    const fetchAndRenderDebts = async () => {
        if (!document.getElementById('borclarView')) return;
        try {
            const searchTerm = document.getElementById('borclarSearchInput').value.trim();
            const res = await fetch(`/api/debts${searchTerm ? '?company='+searchTerm : ''}`);
            const data = await res.json();
            const tbody = document.getElementById('borclarTableBody');
            tbody.innerHTML = '';
            
            if(data.length === 0) { tbody.innerHTML='<tr><td colspan="6">Borc yoxdur</td></tr>'; return;}
            
            data.forEach(d => {
                const tr = tbody.insertRow();
                tr.insertCell().textContent = d.xariciSirket;
                tr.insertCell().textContent = d.satisNo;
                tr.insertCell().textContent = (d.tourists||[])[0];
                tr.insertCell().textContent = `${(d.satish?.amount||0)} ${d.satish?.currency}`;
                tr.insertCell().textContent = d.paymentDueDate || '-';
                const btn = document.createElement('button'); btn.textContent='Keç'; btn.className='action-btn edit';
                btn.onclick = () => { setupNavigation().showView('satishlar'); handleEditOrder(d.satisNo); };
                tr.insertCell().appendChild(btn);
            });
        } catch(e){}
    };
    
    // --- 13. STANDART FUNKSİYALAR (Redaktə, Silmə, Qeyd, Setup) ---
    
    function handleEditOrder(satisNo) {
        const order = currentOrders.find(o => String(o.satisNo) === String(satisNo));
        if(!order) return;
        resetModalToCreateMode();
        editingOrderId = satisNo;
        
        // Helper
        const setVal = (id, v) => { const el=document.getElementById(id); if(el) el.value = (v!==undefined && v!==null)?v:''; };
        
        setVal('xariciSirket', order.xariciSirket);
        setVal('adultGuests', order.adultGuests);
        setVal('childGuests', order.childGuests);
        setVal('rezNomresi', order.rezNomresi);
        setVal('transport_surucuMelumatlari', order.transport?.surucuMelumatlari);
        setVal('transport_xerci', order.transport?.xerci);
        setVal('transport_odenisKartMelumatlari', order.transport?.odenisKartMelumatlari);
        setVal('transport_turTevsiri', order.transport?.turTevsiri);
        setVal('transport_elaveXidmetler', order.transport?.elaveXidmetler);
        setVal('status', order.status);
        setVal('qeyd', order.qeyd);
        setVal('alishCurrency', order.alish?.currency);
        setVal('satishAmount', order.satish?.amount);
        setVal('satishCurrency', order.satish?.currency);
        setVal('paymentStatus', order.paymentStatus);
        setVal('paymentDueDate', order.paymentDueDate);
        
        const costs = order.detailedCosts || {};
        setVal('detailedCost_paket', costs.paketXerci);
        setVal('detailedCost_beledci', costs.beledciXerci);
        setVal('detailedCost_muzey', costs.muzeyXerci);
        setVal('detailedCost_viza', costs.vizaXerci);
        setVal('detailedCost_diger', costs.digerXercler);

        // Turist adları
        const tCont = document.getElementById('touristsContainer');
        tCont.innerHTML = '';
        const tList = order.tourists || [order.turist];
        tList.forEach((t, i) => {
            const div = document.createElement('div'); div.className='form-group';
            div.innerHTML = `<label>Turist ${i+1}:</label><input type="text" class="tourist-name-input" value="${t}" required>`;
            tCont.appendChild(div);
        });

        // Hotellər
        hotelEntriesContainer.innerHTML = '';
        if(order.hotels && order.hotels.length) order.hotels.forEach(h => addHotelEntry(h));
        else addHotelEntry();

        calculateTotalCost();
        
        // İcazə yoxdursa maliyyəni kilidlə
        const disabled = !currentUserPermissions.canEditFinancials;
        document.querySelectorAll('.cost-input, #satishAmount, #satishCurrency, #alishCurrency').forEach(el => el.disabled = disabled);

        modalTitle.textContent = `Sifarişə Düzəliş (№${satisNo})`;
        modalSubmitButton.textContent = 'Yadda Saxla';
        modal.style.display = 'block';
    }

    function handleShowNoteModal(satisNo) {
        const order = currentOrders.find(o => String(o.satisNo) === String(satisNo));
        if (!order) return;
        document.getElementById('noteSatisNo').value = order.satisNo;
        document.getElementById('noteText').value = order.qeyd || '';
        document.getElementById('noteModalTitle').textContent = `Qeyd (№${order.satisNo})`;
        document.getElementById('noteModal').style.display = 'block';
    }

    async function handleDeleteOrder(satisNo) {
        if(!confirm("Bu sifarişi silmək istədiyinizə əminsiniz?")) return;
        try {
            await fetch(`/api/orders/${satisNo}`, {method:'DELETE'});
            fetchOrdersAndRender();
        } catch(e) { alert("Xəta"); }
    }
    
    // Tənzimləmələr Paneli Toggle
    if(settingsBtn) settingsBtn.onclick = (e) => { e.stopPropagation(); settingsPanel.classList.toggle('visible'); };
    if(closeSettingsPanelBtn) closeSettingsPanelBtn.onclick = () => settingsPanel.classList.remove('visible');
    window.addEventListener('click', (e) => {
        if(settingsPanel && !settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) settingsPanel.classList.remove('visible');
    });

    // Naviqasiya Setup
    const setupNavigation = () => {
        const showView = (viewId) => {
            Object.values(views).forEach(v => v ? v.style.display = 'none' : null);
            Object.values(navButtons).forEach(b => b ? b.classList.remove('active') : null);
            
            if (views[viewId]) views[viewId].style.display = 'block';
            else if(viewId === 'satishlar') views.satishlar.style.display = 'block'; // Fallback
            
            const btnKey = viewId === 'satishlar' ? 'navSatishlarBtn' : 'nav'+viewId.charAt(0).toUpperCase()+viewId.slice(1)+'Btn';
            const btn = document.getElementById(btnKey);
            if(btn) btn.classList.add('active');

            if (viewId === 'rezervasiyalar') fetchReservationsAndRender();
            if (viewId === 'borclar') fetchAndRenderDebts();
        };
        
        [navSatishlarBtn, navRezervasiyalarBtn, navBildirishlerBtn, navChatBtn, navAxtarishBtn, navHesabatBtn, navBorclarBtn].forEach(btn => {
            if(btn) btn.addEventListener('click', () => showView(btn.id.replace('nav','').replace('Btn','').toLowerCase()));
        });
        return { showView };
    };
    
    // Init Events
    if(showAddOrderFormBtn) showAddOrderFormBtn.onclick = () => { resetModalToCreateMode(); modal.style.display='block'; };
    if(closeButton) closeButton.onclick = () => modal.style.display='none';
    if(document.getElementById('closeNoteModalBtn')) document.getElementById('closeNoteModalBtn').onclick = () => document.getElementById('noteModal').style.display='none';
    
    window.onclick = (e) => { 
        if(e.target===modal || e.target===document.getElementById('noteModal') || e.target===financialModal) e.target.style.display='none'; 
    };
    if(addHotelBtn) addHotelBtn.onclick = () => addHotelEntry();
    
    // Form Submit
    addOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const getV = (id) => document.getElementById(id)?.value || '';
        
        // Turistləri topla
        const tourists = [];
        document.querySelectorAll('.tourist-name-input').forEach(i => { if(i.value) tourists.push(i.value); });
        
        const orderData = {
            tourists: tourists,
            xariciSirket: getV('xariciSirket'),
            adultGuests: getV('adultGuests'),
            childGuests: getV('childGuests'),
            rezNomresi: getV('rezNomresi'),
            status: getV('status'),
            qeyd: getV('qeyd'),
            transport: {
                surucuMelumatlari: getV('transport_surucuMelumatlari'),
                xerci: parseFloat(getV('transport_xerci'))||0,
                odenisKartMelumatlari: getV('transport_odenisKartMelumatlari'),
                turTevsiri: getV('transport_turTevsiri'),
                elaveXidmetler: getV('transport_elaveXidmetler')
            },
            hotels: Array.from(document.querySelectorAll('.hotel-entry')).map(e => ({
                otelAdi: e.querySelector('.hotel_otelAdi').value,
                otaqKategoriyasi: e.querySelector('.hotel_otaqKategoriyasi').value,
                girisTarixi: e.querySelector('.hotel_girisTarixi').value,
                cixisTarixi: e.querySelector('.hotel_cixisTarixi').value,
                qiymet: parseFloat(e.querySelector('.hotel-price-input').value)||0,
                confirmationPath: e.querySelector('.hotel-confirmation-path').value
            })).filter(h=>h.otelAdi),
            alish: { amount: parseFloat(getV('alishAmount'))||0, currency: getV('alishCurrency') },
            satish: { amount: parseFloat(getV('satishAmount'))||0, currency: getV('satishCurrency') },
            detailedCosts: {
                paketXerci: parseFloat(getV('detailedCost_paket'))||0,
                beledciXerci: parseFloat(getV('detailedCost_beledci'))||0,
                muzeyXerci: parseFloat(getV('detailedCost_muzey'))||0,
                vizaXerci: parseFloat(getV('detailedCost_viza'))||0,
                digerXercler: parseFloat(getV('detailedCost_diger'))||0,
            },
            paymentStatus: getV('paymentStatus'),
            paymentDueDate: getV('paymentDueDate')
        };

        const url = editingOrderId ? `/api/orders/${editingOrderId}` : '/api/orders';
        const method = editingOrderId ? 'PUT' : 'POST';
        
        try {
            await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(orderData)});
            modal.style.display='none';
            fetchOrdersAndRender();
        } catch(e) { alert("Xəta: " + e.message); }
    });

    if(addOrderForm) document.body.addEventListener('input', (e) => { if (e.target.matches('#addOrderForm .cost-input')) calculateTotalCost(); });
    if(document.getElementById('applyFiltersBtn')) document.getElementById('applyFiltersBtn').onclick = fetchOrdersAndRender;
    if(document.getElementById('resetFiltersBtn')) document.getElementById('resetFiltersBtn').onclick = () => { filterRezNoInput.value=''; fetchOrdersAndRender(); };

    // --- BAŞLANĞIC ---
    const navigation = setupNavigation();
    navigation.showView('satishlar');
    fetchOrdersAndRender();
    fetchAndRenderDebts();
    
    // Maskot
    function startMascotLifeCycle() {
        if (wanderingInterval) return;
        const cont = document.getElementById('mascot-container');
        if(!cont) return;
        wanderingInterval = setInterval(() => {
            if (localStorage.getItem('mascot_enabled') === 'false') { cont.style.display='none'; return; }
            cont.style.display='block';
            const w = window.innerWidth, h = window.innerHeight;
            const x = Math.floor(Math.random() * (w - 200));
            const y = Math.floor(Math.random() * (h - 200));
            cont.style.transform = `translate(${x}px, ${y}px)`;
        }, 8000);
    }
    
    if(mascotOnBtn && mascotOffBtn) {
        mascotOnBtn.onclick = () => { localStorage.setItem('mascot_enabled','true'); startMascotLifeCycle(); };
        mascotOffBtn.onclick = () => { localStorage.setItem('mascot_enabled','false'); document.getElementById('mascot-container').style.display='none'; };
    }
    startMascotLifeCycle();
});