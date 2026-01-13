// public/finance-expense-search.js
document.addEventListener('DOMContentLoaded', () => {
    const filterCategorySelect = document.getElementById('filterCategory');
    const filterMonthInput = document.getElementById('filterMonth');
    const filterExpensesBtn = document.getElementById('filterExpensesBtn');
    const filteredExpensesTableBody = document.getElementById('filteredExpensesTableBody');

    const handleFilterExpenses = async () => {
        const category = filterCategorySelect.value;
        const month = filterMonthInput.value;

        if (!category || !month) {
            alert("Zəhmət olmasa, həm kateqoriya, həm də ay/il seçin.");
            return;
        }
        
        filteredExpensesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Yüklənir...</td></tr>`;

        try {
            const response = await fetch(`/api/expenses/filter?category=${category}&month=${month}`);
            if (!response.ok) {
                if(response.status === 403) {
                    alert('Bu bölməyə giriş icazəniz yoxdur.');
                    window.location.href = '/';
                    return;
                }
                const err = await response.json();
                throw new Error(err.message || 'Filterləmə zamanı xəta baş verdi.');
            }
            const filteredExpenses = await response.json();
            renderFilteredExpensesTable(filteredExpenses);
        } catch (error) {
            filteredExpensesTableBody.innerHTML = `<tr><td colspan="4" class="error-message">${error.message}</td></tr>`;
        }
    };

    const renderFilteredExpensesTable = (expenses) => {
        filteredExpensesTableBody.innerHTML = '';
        if (expenses.length === 0) {
            filteredExpensesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Seçilmiş filterlərə uyğun xərc tapılmadı.</td></tr>`;
            return;
        }
        expenses.forEach(expense => {
            const row = filteredExpensesTableBody.insertRow();
            row.insertCell().textContent = new Date(expense.date).toLocaleDateString('az-AZ');
            row.insertCell().textContent = `${expense.amount.toFixed(2)} ${expense.currency}`;
            row.insertCell().textContent = expense.comment;
            row.insertCell().textContent = expense.createdBy;
        });
    };

    filterExpensesBtn.addEventListener('click', handleFilterExpenses);
});
