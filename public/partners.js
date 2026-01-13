document.addEventListener('DOMContentLoaded', () => {
    loadPartners();
    setupModal();
    setupDynamicDates();
});

const API_URL = '/api/partners';
const datesContainer = document.getElementById('dates-container');

// --- Dinamik Tarix Funksiyaları ---
function setupDynamicDates() {
    const addDateBtn = document.getElementById('add-date-btn');
    if(addDateBtn) {
        addDateBtn.addEventListener('click', () => {
            addDateInput(); 
        });
    }
}

function addDateInput(value = '') {
    const div = document.createElement('div');
    div.className = 'date-input-group';
    div.style.display = 'flex';
    div.style.marginBottom = '5px';
    
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'form-input'; 
    input.value = value;
    input.style.flex = '1';
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.className = 'btn btn-danger btn-small';
    removeBtn.style.marginLeft = '5px';
    removeBtn.onclick = () => div.remove();

    div.appendChild(input);
    div.appendChild(removeBtn);
    datesContainer.appendChild(div);
}

function getEnteredDates() {
    const inputs = datesContainer.querySelectorAll('input[type="date"]');
    const dates = [];
    inputs.forEach(input => {
        if(input.value) dates.push(input.value);
    });
    return dates;
}

// --- Əsas Funksiyalar (Burada Düzəliş Edildi) ---
async function loadPartners() {
    try {
        const response = await fetch(API_URL);

        // Əgər sessiya bitibsə (401), girişə yönləndir
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            throw new Error(`Server xətası: ${response.status}`);
        }

        const partners = await response.json();
        
        // Gələn məlumatın Array olub-olmadığını yoxlayırıq
        if (!Array.isArray(partners)) {
            console.error('Serverdən səhv format gəldi:', partners);
            return;
        }

        const tbody = document.querySelector('#partners-table tbody');
        tbody.innerHTML = '';

        partners.forEach(p => {
            const tr = document.createElement('tr');
            const datesStr = (p.entryDates || []).join(', ');
            
            tr.innerHTML = `
                <td>${p.companyName || ''}</td>
                <td>${p.country || ''}</td>
                <td>${p.phone || ''}</td>
                <td>${datesStr}</td>
                <td>${p.shortDesc || ''}</td>
                <td>
                    <button onclick="editPartner('${p.id}')" class="btn btn-small btn-warning"><i class="fas fa-edit"></i></button>
                    <button onclick="deletePartner('${p.id}')" class="btn btn-small btn-danger"><i class="fas fa-trash"></i></button>
                    <button onclick="showDetails('${p.id}')" class="btn btn-small btn-info"><i class="fas fa-info-circle"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Yüklənmə xətası:', error);
    }
}

// Modal funksiyaları
function openModal() {
    document.getElementById('partner-modal').style.display = 'block';
    datesContainer.innerHTML = ''; 
    addDateInput(); 
}

document.getElementById('partner-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        companyName: document.getElementById('p-name').value,
        country: document.getElementById('p-country').value,
        phone: document.getElementById('p-phone').value,
        entryDates: getEnteredDates(), 
        shortDesc: document.getElementById('p-short-desc').value,
        fullDesc: document.getElementById('p-full-desc').value,
        notes: document.getElementById('p-notes').value
    };

    const id = document.getElementById('partner-id').value;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/${id}` : API_URL;

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (response.ok) {
            document.getElementById('partner-modal').style.display = 'none';
            loadPartners();
        } else {
            alert('Xəta baş verdi.');
        }
    } catch (error) {
        console.error('Save error:', error);
    }
});

function setupModal() {
    const modal = document.getElementById('partner-modal');
    const btn = document.getElementById('add-partner-btn');
    const span = document.getElementsByClassName("close")[0];
    
    if(btn) {
        btn.onclick = () => {
            document.getElementById('partner-form').reset();
            document.getElementById('partner-id').value = '';
            openModal();
        }
    }
    if(span) span.onclick = () => modal.style.display = "none";
    window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; }
}

window.editPartner = async (id) => {
    try {
        const response = await fetch(API_URL);
        if (response.status === 401) return window.location.href = '/login.html';
        
        const partners = await response.json();
        const p = partners.find(x => x.id === id);

        if(p) {
            document.getElementById('partner-id').value = p.id;
            document.getElementById('p-name').value = p.companyName;
            document.getElementById('p-country').value = p.country;
            document.getElementById('p-phone').value = p.phone;
            document.getElementById('p-short-desc').value = p.shortDesc;
            document.getElementById('p-full-desc').value = p.fullDesc;
            document.getElementById('p-notes').value = p.notes;
            
            datesContainer.innerHTML = '';
            if(p.entryDates && p.entryDates.length > 0) {
                p.entryDates.forEach(date => addDateInput(date));
            } else {
                addDateInput();
            }
            
            document.getElementById('partner-modal').style.display = 'block';
        }
    } catch (error) {
        console.error(error);
    }
};

window.deletePartner = async (id) => {
    if(confirm('Silmək istədiyinizə əminsiniz?')) {
        try {
            const response = await fetch(`${API_URL}/${id}`, {
                method: 'DELETE'
            });
            
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }

            loadPartners();
        } catch (error) {
            console.error(error);
        }
    }
};

window.showDetails = async (id) => {
    // Detalları göstərmək üçün sadə alert və ya yeni modal yaza bilərsiniz
    // Hələlik konsola yazaq
    console.log("Show details for:", id);
    editPartner(id); // Müvəqqəti olaraq edit modalını açır
};