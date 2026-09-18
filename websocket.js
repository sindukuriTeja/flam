class WebSocketClient {
    constructor() {
        this.socket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000,
            forceNew: true
        });
        this.onDrawCallback = null;
        this.onUndoCallback = null;
        this.onRedoCallback = null;
        this.onCursorMoveCallback = null;
        this.onUserJoinCallback = null;
        this.onRoomStateCallback = null;
        this.onErrorCallback = null;
        this.isConnected = false;
        
        // Performance metrics
        this.lastPingTime = 0;
        this.latency = 0;
        this.fps = 0;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fpsUpdateInterval = 1000; // Update FPS every second

        this.setupSocketHandlers();
        this.startPerformanceMonitoring();
    }

    setupSocketHandlers() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log('Connected to server');
            // Try to reconnect with WebSocket transport if initially connected via polling
            if (this.socket.io.engine.transport.name === 'polling') {
                this.socket.io.engine.transport.on('upgrade', () => {
                    console.log('Upgraded transport to WebSocket');
                });
            }
        });

        this.socket.on('connect_error', (error) => {
            this.isConnected = false;
            console.error('Connection error:', error);
            if (this.onErrorCallback) this.onErrorCallback('connection', error);
            
            // Try to reconnect with polling if WebSocket fails
            if (this.socket.io.engine.transport.name === 'websocket') {
                this.socket.io.opts.transports = ['polling', 'websocket'];
            }
        });

        // Performance monitoring
        this.socket.on('pong', () => {
            this.latency = Date.now() - this.lastPingTime;
            this.updateMetricsDisplay();
        });

        this.socket.on('draw', (data) => {
            try {
                if (this.onDrawCallback) this.onDrawCallback(data);
            } catch (error) {
                console.error('Error handling draw event:', error);
                if (this.onErrorCallback) this.onErrorCallback('draw', error);
            }
        });

        this.socket.on('undoPath', (data) => {
            try {
                console.log('Received undo event:', data);
                if (this.onUndoCallback) {
                    this.onUndoCallback();
                }
            } catch (error) {
                console.error('Error handling undo event:', error);
                if (this.onErrorCallback) this.onErrorCallback('undo', error);
            }
        });

        this.socket.on('redoPath', (data) => {
            try {
                console.log('Received redo event:', data);
                if (this.onRedoCallback) {
                    this.onRedoCallback();
                }
            } catch (error) {
                console.error('Error handling redo event:', error);
                if (this.onErrorCallback) this.onErrorCallback('redo', error);
            }
        });

        this.socket.on('cursorMove', (data) => {
            if (this.onCursorMoveCallback) this.onCursorMoveCallback(data);
        });

        this.socket.on('userJoined', (data) => {
            if (this.onUserJoinCallback) this.onUserJoinCallback(data);
        });

        this.socket.on('roomState', (data) => {
            if (this.onRoomStateCallback) this.onRoomStateCallback(data);
        });
    }

    joinRoom(roomId) {
        this.socket.emit('joinRoom', roomId);
    }

    sendDraw(roomId, path) {
        this.socket.emit('draw', { roomId, path });
    }

    sendUndo(roomId) {
        console.log('Sending undo request for room:', roomId);
        this.socket.emit('undo', roomId);
    }

    sendRedo(roomId) {
        console.log('Sending redo request for room:', roomId);
        this.socket.emit('redo', roomId);
    }

    sendCursorMove(roomId, x, y) {
        this.socket.emit('cursorMove', { roomId, x, y });
    }

    onDraw(callback) {
        this.onDrawCallback = callback;
    }

    onUndo(callback) {
        this.onUndoCallback = callback;
    }

    onRedo(callback) {
        this.onRedoCallback = callback;
    }

    onCursorMove(callback) {
        this.onCursorMoveCallback = callback;
    }

    onUserJoin(callback) {
        this.onUserJoinCallback = callback;
    }

    onRoomState(callback) {
        this.onRoomStateCallback = callback;
    }

    getUserId() {
        return this.socket.id;
    }

    startPerformanceMonitoring() {
        // FPS monitoring
        let lastFpsUpdate = performance.now();
        
        const updateMetrics = () => {
            const now = performance.now();
            this.frameCount++;

            // Update FPS every second
            if (now - lastFpsUpdate >= this.fpsUpdateInterval) {
                this.fps = Math.round((this.frameCount * 1000) / (now - lastFpsUpdate));
                this.frameCount = 0;
                lastFpsUpdate = now;
                this.updateMetricsDisplay();
            }

            requestAnimationFrame(updateMetrics);
        };

        requestAnimationFrame(updateMetrics);

        // Latency monitoring
        setInterval(() => {
            this.lastPingTime = Date.now();
            this.socket.emit('ping');
        }, 2000);
    }

    updateMetricsDisplay() {
        const fpsElement = document.querySelector('.fps');
        const latencyElement = document.querySelector('.latency');
        
        if (fpsElement) {
            fpsElement.textContent = `${this.fps} FPS`;
            fpsElement.style.color = this.fps >= 30 ? '#4CAF50' : '#f44336';
        }
        
        if (latencyElement) {
            latencyElement.textContent = `${this.latency}ms`;
            latencyElement.style.color = this.latency <= 100 ? '#4CAF50' : '#f44336';
        }
    }
}

// Export the WebSocketClient class
export { WebSocketClient };