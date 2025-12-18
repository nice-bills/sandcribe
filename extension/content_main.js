// content_main.js
// Runs in MAIN world. Intercepts fetch requests.

// Helper to inject script and get SQL
async function injectScriptToGetSQL() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.textContent = `
            try {
                if (window.monaco && window.monaco.editor) {
                    const models = window.monaco.editor.getModels();
                    if (models.length > 0) {
                        document.body.setAttribute('data-dune-sql', models[0].getValue());
                    }
                }
            } catch(e) { console.error('DuneLogger injection error:', e); }
        `;
        document.head.appendChild(script);
        script.remove();
        
        // Give it a tick to execute
        setTimeout(() => {
            const sql = document.body.getAttribute('data-dune-sql');
            document.body.removeAttribute('data-dune-sql'); // Cleanup
            resolve(sql);
        }, 50);
    });
}

(function() {
    const isIframe = window.self !== window.top;
    console.log(`[DUNE-LOGGER-MAIN] Script started in ${isIframe ? 'IFRAME' : 'TOP'} world.`);

    const originalFetch = window.fetch;

    window.fetch = async function(...args) {
        const [resource, config] = args;
        
        // Ensure we don't break the original fetch
        let response;
        try {
            response = await originalFetch.apply(this, args);
        } catch (e) {
            // If original fetch fails, we can't do anything
            throw e;
        }

        const clone = response.clone();

        try {
            let url = '';
            if (typeof resource === 'string') {
                url = resource;
            } else if (resource instanceof Request) {
                url = resource.url;
            } else if (resource && resource.url) {
                url = resource.url;
            }

            if (typeof url === 'string') {
                
                // --- 1. Intercept ALL GraphQL Requests ---
                if (url.includes('graphql')) {
                    const urlObj = new URL(url, window.location.origin);
                    const opName = urlObj.searchParams.get('operationName');
                    
                    clone.json().then(data => {
                        // Debug log to find the "Update/Save" operation
                        if (opName) {
                            // Check if variables contain SQL
                            if (config && config.body) {
                                try {
                                    const reqBody = JSON.parse(config.body);
                                    if (reqBody.variables && (reqBody.variables.query_sql || reqBody.variables.query || reqBody.variables.sql)) {
                                        // console.log(`[DUNE-LOGGER-DEBUG] GraphQL ${opName} has SQL in variables!`, reqBody.variables);
                                    }
                                } catch(e) {}
                            }

                            // logic to capture from FindQuery response (existing)
                            if (opName === 'FindQuery') {
                                if (data?.data?.query?.ownerFields?.query || data?.data?.query_v2?.ownerFields?.query) {
                                     console.log('[DUNE-LOGGER-MAIN] Found Query Text in GraphQL FindQuery');
                                     window.postMessage({
                                        type: 'DUNE_LOGGER_FIND_QUERY',
                                        payload: data
                                    }, window.location.origin);
                                }
                            }
                        }
                    }).catch(err => {});
                }

                // --- 2. Intercept Execution Request (Run Button) ---
                if (url.includes('core-api.dune.com/public/execution')) {
                    let queryText = null;

                    // Method A: Injection Trick (Most Robust)
                    try {
                        queryText = await injectScriptToGetSQL();
                        if (queryText) console.log('[DUNE-LOGGER-MAIN] Found SQL via Script Injection');
                    } catch (e) {
                        console.error('[DUNE-LOGGER-MAIN] Injection error:', e);
                    }

                    // Method B: DOM Scraping (Fallback)
                    if (!queryText) {
                         try {
                            const lines = document.querySelectorAll('.view-line');
                            if (lines.length > 0) {
                                const textLines = [];
                                lines.forEach(line => {
                                    textLines.push(line.innerText.replace(/\u00a0/g, ' '));
                                });
                                queryText = textLines.join('\n');
                                console.log('[DUNE-LOGGER-MAIN] Found SQL via DOM scraping (.view-line)');
                            }
                        } catch (e) {}
                    }

                    // Method C: Check Next.js Data (Reliable for saved queries if DOM fails)
                    if (!queryText && window.__NEXT_DATA__) {
                        try {
                            const queryData = window.__NEXT_DATA__?.props?.pageProps?.query;
                            if (queryData && queryData.ownerFields && queryData.ownerFields.query) {
                                queryText = queryData.ownerFields.query;
                                console.log('[DUNE-LOGGER-MAIN] Found SQL in __NEXT_DATA__');
                            }
                        } catch (e) {}
                    }

                    // Process the execution response
                    clone.json().then(data => {
                        // Extract query_id from URL (e.g., /queries/123456)
                        const match = window.location.pathname.match(/\/queries\/(\d+)/);
                        const queryId = match ? parseInt(match[1]) : null;

                        // Attach extra info to payload
                        data.query_id = queryId;
                        data.query_text = queryText; 

                        window.postMessage({
                            type: 'DUNE_LOGGER_EXECUTION',
                            payload: data
                        }, window.location.origin);
                    }).catch(err => console.error('[DUNE-LOGGER-MAIN] Error parsing Execution:', err));
                }
            }
        } catch (err) {
            console.error('[DUNE-LOGGER-MAIN] Interception error:', err);
        }

        return response;
    };
})();
