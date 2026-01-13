// public/permissions.js

document.addEventListener('DOMContentLoaded', () => {
    // Elementlər
    const authSection = document.getElementById('auth-section');
    const permissionsSection = document.getElementById('permissions-section');
    const ownerPasswordInput = document.getElementById('ownerPassword');
    const verifyOwnerBtn = document.getElementById('verifyOwnerBtn');
    const tableBody = document.getElementById('permissionsTableBody');
    const saveBtn = document.getElementById('savePermissionsBtn');

    // 1. TƏSDİQLƏ DÜYMƏSİ
    verifyOwnerBtn.addEventListener('click', async () => {
        const password = ownerPasswordInput.value.trim();
        if (!password) {
            alert("Zəhmət olmasa şifrəni daxil edin.");
            return;
        }

        try {
            // Şifrə ilə istifadəçiləri və icazələri çəkirik
            const [usersRes, permsRes] = await Promise.all([
                fetch('/api/users/get-by-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                }),
                fetch('/api/permissions/get-by-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                })
            ]);

            if (!usersRes.ok || !permsRes.ok) {
                const err = await usersRes.json().catch(() => ({}));
                throw new Error(err.message || "Yanlış şifrə və ya xəta.");
            }

            const usersList = await usersRes.json();
            const permissionsData = await permsRes.json();

            // Uğurlu giriş -> Paneli dəyiş
            authSection.style.display = 'none';
            permissionsSection.style.display = 'block';
            
            renderTable(usersList, permissionsData);

        } catch (error) {
            alert(error.message);
            console.error(error);
        }
    });

    // Enter düyməsi ilə təsdiqləmə
    ownerPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyOwnerBtn.click();
    });

    // 2. CƏDVƏLİ QURMAQ
    function renderTable(usersList, permissionsData) {
        tableBody.innerHTML = '';
        
        // Owner xaric digərlərini göstər
        const filterUsers = usersList.filter(u => u.role !== 'owner');

        if (filterUsers.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">İstifadəçi tapılmadı.</td></tr>';
            return;
        }

        filterUsers.forEach(user => {
            const p = permissionsData[user.username] || {};
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td style="text-align: left; font-weight: 500;">
                    ${user.displayName} <br>
                    <small style="color:#888">${user.username}</small>
                </td>
                
                <td><input type="checkbox" class="perm-check" data-user="${user.username}" data-type="canEditOrder" ${p.canEditOrder ? 'checked' : ''}></td>
                <td><input type="checkbox" class="perm-check" data-user="${user.username}" data-type="canDeleteOrder" ${p.canDeleteOrder ? 'checked' : ''}></td>
                <td><input type="checkbox" class="perm-check" data-user="${user.username}" data-type="canEditFinancials" ${p.canEditFinancials ? 'checked' : ''}></td>
                <td><input type="checkbox" class="perm-check" data-user="${user.username}" data-type="finance_canChangePayments" ${p.finance_canChangePayments ? 'checked' : ''}></td>
                
                <td style="background-color: #fffbeb;">
                    <input type="checkbox" class="perm-check" data-user="${user.username}" data-type="canViewFinancials" ${p.canViewFinancials ? 'checked' : ''}>
                </td>
                <td style="background-color: #f0fdf4;">
                    <input type="checkbox" class="perm-check" data-user="${user.username}" data-type="canArchiveOrder" ${p.canArchiveOrder ? 'checked' : ''}>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    // 3. YADDA SAXLA (Şifrə ilə birlikdə göndəririk)
    saveBtn.addEventListener('click', async () => {
        const password = ownerPasswordInput.value.trim(); // Şifrəni yenidən götürürük
        const newPermissions = {};

        document.querySelectorAll('.perm-check').forEach(cb => {
            const u = cb.dataset.user;
            const t = cb.dataset.type;
            if (!newPermissions[u]) newPermissions[u] = {};
            newPermissions[u][t] = cb.checked;
        });

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saxlanılır...";

            const res = await fetch('/api/permissions/save-by-password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    password: password, 
                    permissions: newPermissions 
                })
            });

            if (res.ok) {
                alert("İcazələr uğurla yeniləndi!");
            } else {
                const err = await res.json();
                alert("Xəta: " + err.message);
            }
        } catch (error) {
            console.error(error);
            alert("Server xətası.");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Yadda Saxla";
        }
    });
});