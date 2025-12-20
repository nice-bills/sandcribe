let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    document.getElementById('export-btn').addEventListener('click', exportCSV);
    
    // Bind filter buttons
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update state
            currentFilter = btn.getAttribute('data-filter');
            loadData();
        });
    });
});

function exportCSV() {
    // ... (existing exportCSV code) ...
}

function saveIntent(executionId, newIntent) {
    // ... (existing saveIntent code) ...
}

function loadData() {
    chrome.storage.local.get(['dune_executions', 'dune_stats'], (result) => {
        const stats = result.dune_stats || { total: 0, errors: 0, successes: 0, fixes: 0 };
        let history = result.dune_executions || [];

        // Update stats
        document.getElementById('total-count').textContent = stats.total;
        document.getElementById('error-count').textContent = stats.errors;
        document.getElementById('fix-count').textContent = stats.fixes;

        // Render list
        const tbody = document.getElementById('execution-list');
        const emptyState = document.getElementById('empty-state');
        tbody.innerHTML = '';

        // Apply Filter
        if (currentFilter === 'error') {
            history = history.filter(r => r.status === 'error');
        } else if (currentFilter === 'success') {
            history = history.filter(r => r.status === 'success');
        } else if (currentFilter === 'fixed') {
            history = history.filter(r => r.has_fix);
        }

        if (history.length === 0) {
            emptyState.textContent = currentFilter === 'all' ? "No data captured yet." : "No matching queries found.";
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // Show newest first (limit 10 of filtered results)
        const recent = history.slice().reverse().slice(0, 10);

        recent.forEach(record => {
            // ... (rest of rendering logic remains same) ...
            const tr = document.createElement('tr');
            
            // Time
            const date = new Date(record.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // Status Logic
            let statusHtml = '';
            if (record.has_fix) {
                statusHtml = '<span class="status-badge status-fixed">Fixed</span>';
            } else if (record.status === 'success') {
                statusHtml = '<span class="status-badge status-success">Success</span>';
            } else {
                // Show error type if available, else generic Error
                const errLabel = record.error_type || 'Error';
                statusHtml = `<span class="status-badge status-error" title="${record.error_message || ''}">${errLabel}</span>`;
            }

            // Intent / ID Column
            let intentText = record.user_intent;
            let displayIntent = '';
            
            if (intentText) {
                // Cleanup common AI prefixes
                intentText = intentText.replace(/^(Certainly!|Sure!|Here are|Here is).+?:\s*/i, '');
                
                // Truncate for display
                const MAX_LEN = 40;
                displayIntent = intentText.length > MAX_LEN 
                    ? intentText.substring(0, MAX_LEN) + '...'
                    : intentText;
            }

            const intentDisplay = intentText 
                ? `<span class="intent-text" title="${record.user_intent}">${displayIntent}</span>` 
                : `<span class="query-id">#${record.query_id || '???'}</span>`;

            tr.innerHTML = `
                <td>${timeStr}</td>
                <td class="id-cell" title="Click to edit intent">
                    ${intentDisplay} <span class="edit-icon">✎</span>
                </td>
                <td>${statusHtml}</td>
            `;

            // Bind Edit Event
            const idCell = tr.querySelector('.id-cell');
            idCell.addEventListener('click', () => {
                const current = record.user_intent || '';
                const input = prompt("Enter query intent/description:", current);
                if (input !== null) { // If not cancelled
                    saveIntent(record.execution_id, input);
                }
            });

            tbody.appendChild(tr);
        });
    });
}
