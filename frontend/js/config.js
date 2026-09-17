/**
 * FRANK Runtime Client Configuration
 * Dynamic backend resolution, protocol switching, and environment customization.
 */
(function() {
    'use strict';

    // Check if configuration is injected via window or localStorage
    const storedApiUrl = localStorage.getItem('frank_api_url');
    const storedWsUrl = localStorage.getItem('frank_ws_url');
    const injectedConfig = window.__FRANK_CONFIG__ || {};

    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || host.startsWith('192.168.');
    const isHttps = window.location.protocol === 'https:';

    // Production backend defaults (can be overridden via localStorage or window.__FRANK_CONFIG__)
    const DEFAULT_PROD_API = 'https://frank-chat-app.onrender.com';
    const DEFAULT_PROD_WS = 'wss://frank-chat-app.onrender.com';

    let apiBase = '';
    let wsBase = '';

    if (injectedConfig.API_BASE) {
        apiBase = injectedConfig.API_BASE;
    } else if (storedApiUrl) {
        apiBase = storedApiUrl;
    } else if (isLocal) {
        // If served by FastAPI directly on port 8000, use relative or origin
        apiBase = window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
            ? window.location.origin
            : 'http://localhost:8000';
    } else {
        // Production host (e.g., frank-chat-vercel.app)
        apiBase = DEFAULT_PROD_API;
    }

    if (injectedConfig.WS_BASE) {
        wsBase = injectedConfig.WS_BASE;
    } else if (storedWsUrl) {
        wsBase = storedWsUrl;
    } else if (isLocal) {
        const wsProtocol = isHttps ? 'wss:' : 'ws:';
        const wsHost = window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
            ? window.location.host
            : 'localhost:8000';
        wsBase = `${wsProtocol}//${wsHost}`;
    } else {
        wsBase = DEFAULT_PROD_WS;
    }

    // Ensure no trailing slashes
    apiBase = apiBase.replace(/\/+$/, '');
    wsBase = wsBase.replace(/\/+$/, '');

    window.FRANK_CONFIG = {
        BRAND_NAME: 'FRANK',
        TAGLINE: 'Think',
        FRONTEND_URL: 'https://frank-chat-app.vercel.app',
        API_BASE: apiBase,
        WS_BASE: wsBase,
        IS_LOCAL: isLocal,
        IS_SECURE: isHttps,
        VERSION: '2.0.0'
    };

    console.log(`[FRANK] Initialized v2.0.0 (API: ${apiBase}, WS: ${wsBase})`);
})();
