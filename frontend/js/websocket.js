/* -------------------------------------------------------------------------
   REAL-TIME WEBSOCKET CLIENT
   Resilient connection with exponential backoff reconnect, heartbeat, and events
   ------------------------------------------------------------------------- */

class ChatWebSocketClient {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 10000;
        this.reconnectTimer = null;
        this.listeners = new Map();
        this.isConnected = false;
    }

    connect() {
        const token = api.getToken();
        if (!token) return;

        // Clear any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        let wsUrl = '';
        if (window.FRANK_CONFIG && window.FRANK_CONFIG.WS_BASE) {
            wsUrl = `${window.FRANK_CONFIG.WS_BASE}/ws/${token}`;
        } else {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsHost = window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
                ? window.location.host
                : 'localhost:8000';
            wsUrl = `${wsProtocol}//${wsHost}/ws/${token}`;
        }

        this.notify('status', { status: 'connecting' });

        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.notify('status', { status: 'connected' });
                console.log('FRANK WebSocket: Connected');
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
                this.isConnected = false;
                this.notify('status', { status: 'disconnected' });
                console.log(`FRANK WebSocket: Closed (Code: ${event.code}). Scheduling reconnect...`);
                this.scheduleReconnect();
            };

            this.socket.onerror = (err) => {
                console.error('FRANK WebSocket: Error', err);
            };

        } catch (err) {
            console.error('FRANK WebSocket connection error:', err);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (!api.getToken()) return;

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.8, this.reconnectAttempts - 1), this.maxReconnectDelay);
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
    },

    sendEditMessage(messageId, content) {
        return this.send({
            type: 'edit_message',
            message_id: messageId,
            content
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
