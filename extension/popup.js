document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

function saveIntent(executionId, newIntent) {
    chrome.storage.local.get(['dune_executions'], (result) => {
        const history = result.dune_executions || [];
        const index = history.findIndex(r => r.execution_id === executionId);
        
        if (index !== -1) {
            history[index].user_intent = newIntent;
            chrome.storage.local.set({ dune_executions: history }, () => {
                loadData(); // Re-render
            });
        }
    });
}

function loadData() {
    chrome.storage.local.get(['dune_executions', 'dune_stats'], (result) => {
        const stats = result.dune_stats || { total: 0, errors: 0, successes: 0, fixes: 0 };
        const history = result.dune_executions || [];

        // Update stats
        document.getElementById('total-count').textContent = stats.total;
        document.getElementById('error-count').textContent = stats.errors;
        document.getElementById('fix-count').textContent = stats.fixes;

        // Render list (last 10)
        const tbody = document.getElementById('execution-list');
        const emptyState = document.getElementById('empty-state');
        tbody.innerHTML = '';

        if (history.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // Show newest first
        const recent = history.slice().reverse().slice(0, 10);

        recent.forEach(record => {
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
                statusHtml = '<span class="status-badge status-error">Error</span>';
            }

            // Intent / ID Column
            const intentDisplay = record.user_intent 
                ? `<span class="intent-text" title="${record.user_intent}">${record.user_intent.substring(0, 15)}${record.user_intent.length > 15 ? '...' : ''}</span>` 
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
