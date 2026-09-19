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
        this.fpsUpdateInterval = 1000;

        this.setupSocketHandlers();
        this.startPerformanceMonitoring();
    }

    setupSocketHandlers() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log('Connected to server');
        });

        this.socket.on('connect_error', (error) => {
            this.isConnected = false;
            console.error('Connection error:', error);
            if (this.onErrorCallback) this.onErrorCallback('connection', error);
        });

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
            if (this.onUndoCallback) this.onUndoCallback(data);
        });

        this.socket.on('redoPath', (data) => {
            if (this.onRedoCallback) this.onRedoCallback(data);
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

    joinRoom(roomId, name) {
        if (name) this.socket.emit('joinRoom', { roomId, name });
        else this.socket.emit('joinRoom', roomId);
    }

    sendDraw(roomId, path) {
        this.socket.emit('draw', { roomId, path });
    }

    sendUndo(roomId) {
        this.socket.emit('undo', roomId);
    }

    sendRedo(roomId) {
        this.socket.emit('redo', roomId);
    }

    sendCursorMove(roomId, x, y) {
        this.socket.emit('cursorMove', { roomId, x, y });
    }

    onDraw(callback) { this.onDrawCallback = callback; }
    onUndo(callback) { this.onUndoCallback = callback; }
    onRedo(callback) { this.onRedoCallback = callback; }
    onCursorMove(callback) { this.onCursorMoveCallback = callback; }
    onUserJoin(callback) { this.onUserJoinCallback = callback; }
    onRoomState(callback) { this.onRoomStateCallback = callback; }

    getUserId() {
        return this.socket.id;
    }

    startPerformanceMonitoring() {
        let lastFpsUpdate = performance.now();

        const updateMetrics = () => {
            const now = performance.now();
            this.frameCount++;
            if (now - lastFpsUpdate >= this.fpsUpdateInterval) {
                this.fps = Math.round((this.frameCount * 1000) / (now - lastFpsUpdate));
                this.frameCount = 0;
                lastFpsUpdate = now;
                this.updateMetricsDisplay();
            }
            requestAnimationFrame(updateMetrics);
        };

        requestAnimationFrame(updateMetrics);

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
            fpsElement.style.color = this.fps >= 30 ? '#56d5a2' : '#ffb454';
        }

        if (latencyElement) {
            latencyElement.textContent = `${this.latency}ms`;
            // green < 100ms, amber 100-250ms, red > 250ms
            latencyElement.style.color = this.latency <= 100 ? '#56d5a2' : this.latency <= 250 ? '#ffb454' : '#ff7183';
        }
    }
}

export { WebSocketClient };