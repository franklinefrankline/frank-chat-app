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
    const CLOUD_API_FALLBACK = 'https://frank-chat-app.vercel.app';
    const DEFAULT_PROD_WS = '';

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
    } else if (host.endsWith('.vercel.app') || host.includes('vercel.app')) {
        apiBase = window.location.origin;
    } else {
        apiBase = CLOUD_API_FALLBACK;
    }

    // Determine if running on a serverless host without native persistent WebSocket
    const isVercelHost = host.endsWith('.vercel.app') || host.includes('vercel.app');
    let isServerless = isVercelHost;

    if (injectedConfig.WS_BASE) {
        wsBase = injectedConfig.WS_BASE;
        isServerless = false;
    } else if (storedWsUrl) {
        wsBase = storedWsUrl;
        isServerless = false;
    } else if (isLocal) {
        const wsProtocol = isHttps ? 'wss:' : 'ws:';
        const wsHost = window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
            ? window.location.host
            : 'localhost:8000';
        wsBase = `${wsProtocol}//${wsHost}`;
        isServerless = false;
    } else if (DEFAULT_PROD_WS) {
        wsBase = DEFAULT_PROD_WS;
        isServerless = false;
    } else if (isVercelHost) {
        // Vercel Serverless Functions do not support persistent WebSockets.
        // Leave wsBase empty to enable high-fidelity Real-Time Sync Engine with zero 404 errors.
        wsBase = '';
        isServerless = true;
    } else {
        const wsProtocol = isHttps ? 'wss:' : 'ws:';
        wsBase = `${wsProtocol}//${window.location.host}`;
    }

    // Ensure no trailing slashes
    apiBase = apiBase.replace(/\/+$/, '');
    if (wsBase) wsBase = wsBase.replace(/\/+$/, '');

    window.FRANK_CONFIG = {
        BRAND_NAME: 'FRANK',
        TAGLINE: 'Think',
        FRONTEND_URL: 'https://frank-chat-app.vercel.app',
        API_BASE: apiBase,
        CLOUD_API: CLOUD_API_FALLBACK,
        WS_BASE: wsBase,
        IS_LOCAL: isLocal,
        IS_SECURE: isHttps,
        IS_SERVERLESS: isServerless,
        VERSION: '2.0.0'
    };

    console.log(`[FRANK] Initialized v2.0.0 (API: ${apiBase}, WS: ${wsBase || 'Serverless Real-Time Sync'})`);
})();
