// Dune SQL Logger - Content Script
// Intercepts window.fetch to capture SQL queries and execution results.

(function() {
    const originalFetch = window.fetch;

    window.fetch = async function(...args) {
        const [resource, config] = args;
        
        // We'll let the request happen first
        const response = await originalFetch.apply(this, args);
        
        // Clone response to read it without consuming the stream for the app
        const clone = response.clone();

        try {
            // Basic URL check
            const url = typeof resource === 'string' ? resource : resource.url;

            // 1. Intercept GraphQL FindQuery (The Query Text)
            if (url.includes('api/graphql') && url.includes('operationName=FindQuery')) {
                clone.json().then(data => {
                    // Send to background script (we need to use a custom event or window.postMessage 
                    // because we are in MAIN world and chrome.runtime might not be fully available/reliable depending on context)
                    // Actually, since we are in MAIN world, we cannot use chrome.runtime.sendMessage directly.
                    // We need to relay this to an ISOLATED content script or just use window.postMessage to talk to ourself
                    // if we had a split setup. 
                    // However, let's just log it for now as per Task 1.2
                    console.log('[DUNE-LOGGER] Captured FindQuery:', data);
                    
                    // We will need a bridge to get this to the background script later.
                    // Common pattern: window.postMessage -> content_script (ISOLATED) -> chrome.runtime.sendMessage
                }).catch(err => console.error('[DUNE-LOGGER] Error parsing FindQuery:', err));
            }

            // 2. Intercept Execution Request (The Result/Error)
            if (url.includes('/api/query/') && url.includes('/execute')) {
                clone.json().then(data => {
                    console.log('[DUNE-LOGGER] Captured Execution:', data);
                }).catch(err => console.error('[DUNE-LOGGER] Error parsing Execution:', err));
            }

        } catch (err) {
            console.error('[DUNE-LOGGER] Interception error:', err);
        }

        return response;
    };

    console.log('[DUNE-LOGGER] Fetch interceptor installed.');
})();
