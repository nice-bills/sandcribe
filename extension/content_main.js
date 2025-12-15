// content_main.js
// Runs in MAIN world. Intercepts fetch requests.

(function() {
    console.log('[DUNE-LOGGER-MAIN] Script started in MAIN world.');

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
                
                // --- 1. Intercept GraphQL FindQuery (Page Load) ---
                if (url.includes('api/graphql')) {
                    if (url.includes('operationName=FindQuery')) {
                         // console.log('[DUNE-LOGGER-DEBUG] Found FindQuery request');
                    }
                    
                    clone.json().then(data => {
                        // Check if this response has query text
                        if (data?.data?.query?.ownerFields?.query || data?.data?.query_v2?.ownerFields?.query) {
                             console.log('[DUNE-LOGGER-MAIN] Found Query Text in GraphQL');
                             window.postMessage({
                                type: 'DUNE_LOGGER_FIND_QUERY',
                                payload: data
                            }, window.location.origin);
                        }
                    }).catch(err => {});
                }

                // --- 2. Intercept Execution Request (Run Button) ---
                if (url.includes('core-api.dune.com/public/execution')) {
                    let queryText = null;

                    // Method A: Check request body for override
                    if (config && config.body) {
                        try {
                            const body = JSON.parse(config.body);
                            if (body.query_override) {
                                queryText = body.query_override;
                            }
                        } catch (e) {}
                    }

                    // Method B: Check Next.js Data (Reliable for saved queries)
                    if (!queryText && window.__NEXT_DATA__) {
                        try {
                            const queryData = window.__NEXT_DATA__?.props?.pageProps?.query;
                            if (queryData && queryData.ownerFields && queryData.ownerFields.query) {
                                queryText = queryData.ownerFields.query;
                                console.log('[DUNE-LOGGER-MAIN] Found SQL in __NEXT_DATA__');
                            }
                        } catch (e) {}
                    }

                    // Method C: Monaco Editor (Active Editor State)
                    // We use 'window.monaco' because we are in the MAIN world
                    if (!queryText && window.monaco && window.monaco.editor) {
                        try {
                            const models = window.monaco.editor.getModels();
                            if (models.length > 0) {
                                // Get text from the first model
                                queryText = models[0].getValue();
                                console.log('[DUNE-LOGGER-MAIN] Found SQL via window.monaco');
                            }
                        } catch (e) {
                            console.error('[DUNE-LOGGER-MAIN] Monaco access error:', e);
                        }
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
