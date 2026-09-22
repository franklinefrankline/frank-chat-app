function updateSidebarPresence(isOnline) {
    const dot = document.getElementById('sidebarUserPresence');
    const label = document.getElementById('sidebarUserStatusLabel');
    const statusDot = document.getElementById('sidebarUserStatusDot');
    if (dot) {
        if (isOnline) {
            dot.classList.remove('offline');
            dot.classList.add('online');
        } else {
            dot.classList.remove('online');
            dot.classList.add('offline');
        }
    }
    if (label) {
        label.textContent = isOnline ? 'Online' : 'Offline';
    }
    if (statusDot) {
        statusDot.style.color = isOnline ? 'var(--success, #10B981)' : 'var(--text-muted, #94A3B8)';
    }
}
window.updateSidebarPresence = updateSidebarPresence;
window.addEventListener('online', () => updateSidebarPresence(true));
window.addEventListener('offline', () => updateSidebarPresence(false));

class ChatWebSocketClient {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.failedAttempts = 0;
        this.maxReconnectDelay = 30000;
        this.reconnectTimer = null;
        this.listeners = new Map();
        this.isConnected = false;
        this.isServerlessFallback = false;
    }

    connect() {
        const token = api.getToken();
        if (!token) return;

        // Clear any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || host.startsWith('192.168.');
        const isHttps = window.location.protocol === 'https:';

        // Check if serverless mode is explicitly signaled or detected on Vercel without external WS
        const isVercelHost = host.endsWith('.vercel.app') || host.includes('vercel.app');
        const hasExternalWs = window.FRANK_CONFIG && window.FRANK_CONFIG.WS_BASE;

        if (isVercelHost && !hasExternalWs) {
            this.isServerlessFallback = true;
            updateSidebarPresence(navigator.onLine);
            this.notify('status', { status: 'serverless_sync' });
            if (window.chatController && typeof window.chatController.activateRealTimeSync === 'function') {
                window.chatController.activateRealTimeSync();
            }
            return;
        }

        let wsUrl = '';
        if (hasExternalWs) {
            wsUrl = `${window.FRANK_CONFIG.WS_BASE}/ws/${token}`;
        } else if (isLocal) {
            const wsProtocol = isHttps ? 'wss:' : 'ws:';
            const wsHost = window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
                ? window.location.host
                : 'localhost:8000';
            wsUrl = `${wsProtocol}//${wsHost}/ws/${token}`;
        } else {
            // Production deployment with potential WebSocket reverse proxy on same host
            const wsProtocol = isHttps ? 'wss:' : 'ws:';
            wsUrl = `${wsProtocol}//${window.location.host}/ws/${token}`;
        }

        this.notify('status', { status: 'connecting' });

        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                this.isConnected = true;
                this.failedAttempts = 0;
                this.isServerlessFallback = false;
                this.reconnectAttempts = 0;
                updateSidebarPresence(true);
                this.notify('status', { status: 'connected' });
                console.log('FRANK WebSocket: Connected successfully');
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const type = data.type;
                    if (type) {
                        this.notify(type, data);
                    }
                } catch (err) {
                    console.error('Error parsing WebSocket message:', err);
                }
            };

            this.socket.onclose = (event) => {
                const wasConnected = this.isConnected;
                this.isConnected = false;
                updateSidebarPresence(false);
                this.notify('status', { status: 'disconnected' });

                if (!wasConnected) {
                    this.failedAttempts++;
                }

                // If connection failed repeatedly (e.g. host does not support WebSockets like Vercel),
                // smoothly transition to high-fidelity serverless sync without spamming errors
                if (this.failedAttempts >= 2 && !isLocal) {
                    this.isServerlessFallback = true;
                    console.log('FRANK: Real-Time serverless synchronization active.');
                    updateSidebarPresence(navigator.onLine);
                    this.notify('status', { status: 'serverless_sync' });
                    if (window.chatController && typeof window.chatController.activateRealTimeSync === 'function') {
                        window.chatController.activateRealTimeSync();
                    }
                    this.scheduleReconnect(60000); // Check again every 60s
                    return;
                }

                console.log(`FRANK WebSocket: Closed (Code: ${event.code}). Scheduling reconnect...`);
                this.scheduleReconnect();
            };

            this.socket.onerror = (err) => {
                // Handled gracefully in onclose
            };

        } catch (err) {
            console.warn('FRANK WebSocket connection attempt:', err);
            this.failedAttempts++;
            if (this.failedAttempts >= 2 && !isLocal) {
                this.isServerlessFallback = true;
                this.notify('status', { status: 'serverless_sync' });
                if (window.chatController && typeof window.chatController.activateRealTimeSync === 'function') {
                    window.chatController.activateRealTimeSync();
                }
                this.scheduleReconnect(60000);
            } else {
                this.scheduleReconnect();
            }
        }
    }

    scheduleReconnect(customDelay = null) {
        if (!api.getToken()) return;

        this.reconnectAttempts++;
        const delay = customDelay || Math.min(1000 * Math.pow(1.8, this.reconnectAttempts - 1), this.maxReconnectDelay);
        this.notify('status', { status: 'reconnecting', delay });

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    // Helper outgoing senders
    sendChatMessage(recipientId, groupId, content, replyToId = null) {
        return this.send({
            type: 'message',
            recipient_id: recipientId,
            group_id: groupId,
            content,
            reply_to_id: replyToId
        });
    }

    sendTyping(recipientId, groupId, isTyping = true) {
        return this.send({
            type: 'typing',
            recipient_id: recipientId,
            group_id: groupId,
            is_typing: isTyping
        });
    }

    sendReaction(messageId, emoji) {
        return this.send({
            type: 'reaction',
            message_id: messageId,
            emoji
        });
    }

    sendRead(messageIds) {
        return this.send({
            type: 'read',
            message_ids: Array.isArray(messageIds) ? messageIds : [messageIds]
        });
    }

    sendEditMessage(messageId, content) {
        return this.send({
            type: 'edit_message',
            message_id: messageId,
            content
        });
    }

    sendMessageEdit(messageId, content) {
        return this.sendEditMessage(messageId, content);
    }

    sendDeleteMessage(messageId) {
        return this.send({
            type: 'delete_message',
            message_id: messageId
        });
    }

    // Event Listener Subscription
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    notify(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Error in WebSocket listener [${event}]:`, e);
                }
            });
        }
    }
}

window.wsClient = new ChatWebSocketClient();
