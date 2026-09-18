import { Canvas } from './canvas.js';
import { WebSocketClient } from './websocket.js';

class CollaborativeDrawingApp {
    constructor() {
        this.room = this.getOrCreateRoomId();
        this.wsClient = new WebSocketClient();
        this.canvas = new Canvas('drawingCanvas', this.wsClient.getUserId());
        this.userCursors = new Map();

        this.setupWebSocket();
        this.setupToolbar();
        this.setupCursorTracking();
        this.setupRoomControls();
        this.updateRoomDisplay();
    }

    getOrCreateRoomId() {
        // Get room ID from URL or create a new one
        const urlParams = new URLSearchParams(window.location.search);
        let roomId = urlParams.get('room');
        
        if (!roomId) {
            roomId = Math.random().toString(36).substring(2, 15);
            window.history.pushState({}, '', `?room=${roomId}`);
        }
        
        return roomId;
    }

    setupWebSocket() {
        // Join room
        this.wsClient.joinRoom(this.room);

        // Update connection status
        const updateConnectionStatus = (isConnected) => {
            const statusEl = document.querySelector('.connection-status');
            if (statusEl) {
                statusEl.className = `connection-status ${isConnected ? 'online' : 'offline'}`;
                statusEl.textContent = isConnected ? '⚫ Online' : '⚫ Offline';
            }
        };

        this.wsClient.socket.on('connect', () => updateConnectionStatus(true));
        this.wsClient.socket.on('disconnect', () => updateConnectionStatus(false));
        this.wsClient.socket.on('connect_error', () => updateConnectionStatus(false));

        // Handle incoming drawing events
        this.wsClient.onDraw((data) => {
            this.canvas.applyPath(data.path);
        });

        // Handle undo/redo events
        this.wsClient.onUndo(() => {
            console.log('Client received undo event');
            this.canvas.undo();
        });

        this.wsClient.onRedo(() => {
            console.log('Client received redo event');
            this.canvas.redo();
        });

        // Handle cursor movement
        this.wsClient.onCursorMove((data) => {
            this.updateUserCursor(data.userId, data.x, data.y);
        });

        // Handle user join events
        this.wsClient.onUserJoin((data) => {
            this.updateOnlineUsers(data.userCount);
        });

        // Handle initial room state
        this.wsClient.onRoomState((state) => {
            state.paths.forEach(path => {
                this.canvas.applyPath(path);
            });
        });

        // Set up canvas draw callback
        this.canvas.setOnDrawCallback((path) => {
            this.wsClient.sendDraw(this.room, path);
        });
    }

    setupToolbar() {
        // Tool selection
        document.querySelectorAll('.tool').forEach(tool => {
            tool.addEventListener('click', (e) => {
                document.querySelector('.tool.active')?.classList.remove('active');
                e.target.classList.add('active');
                
                // Reset color picker when switching to eraser
                const colorPicker = document.getElementById('colorPicker');
                if (e.target.id === 'eraser') {
                    colorPicker.dataset.lastColor = colorPicker.value;
                } else if (e.target.id === 'brush') {
                    if (colorPicker.dataset.lastColor) {
                        colorPicker.value = colorPicker.dataset.lastColor;
                    }
                }
            });
        });

        // Color Picker
        const colorPicker = document.getElementById('colorPicker');
        colorPicker.addEventListener('input', (e) => {
            const activeTool = document.querySelector('.tool.active');
            if (activeTool?.id === 'brush') {
                colorPicker.dataset.lastColor = e.target.value;
            }
        });

        // Stroke Width
        const strokeWidth = document.getElementById('strokeWidth');
        const strokeValue = document.querySelector('.stroke-value');
        strokeWidth.addEventListener('input', (e) => {
            strokeValue.textContent = `${e.target.value}px`;
        });

        // Undo/Redo
        document.getElementById('undo')?.addEventListener('click', () => {
            console.log('Undo button clicked');
            this.canvas.undo();
            this.wsClient.sendUndo(this.room);
        });

        document.getElementById('redo')?.addEventListener('click', () => {
            console.log('Redo button clicked');
            this.canvas.redo();
            this.wsClient.sendRedo(this.room);
        });
    }

    setupCursorTracking() {
        let throttleTimeout;
        document.addEventListener('mousemove', (e) => {
            if (throttleTimeout) return;

            throttleTimeout = setTimeout(() => {
                const canvasRect = document.getElementById('drawingCanvas').getBoundingClientRect();
                const x = e.clientX - canvasRect.left;
                const y = e.clientY - canvasRect.top;
                
                if (x >= 0 && x <= canvasRect.width && y >= 0 && y <= canvasRect.height) {
                    this.wsClient.sendCursorMove(this.room, x, y);
                }
                throttleTimeout = null;
            }, 16); // Roughly 60fps
        });
    }

    updateUserCursor(userId, x, y) {
        if (userId === this.wsClient.getUserId()) return;

        let cursor = this.userCursors.get(userId);
        if (!cursor) {
            cursor = this.createUserCursor(userId);
            this.userCursors.set(userId, cursor);
        }

        cursor.style.transform = `translate(${x}px, ${y}px)`;
    }

    createUserCursor(userId) {
        const cursor = document.createElement('div');
        cursor.className = 'user-cursor';
        
        const pointer = document.createElement('div');
        pointer.className = 'cursor-pointer';
        pointer.style.backgroundColor = this.getRandomColor();
        
        const label = document.createElement('div');
        label.className = 'cursor-name';
        label.textContent = `User ${userId.slice(0, 4)}`;
        
        cursor.appendChild(pointer);
        cursor.appendChild(label);
        document.querySelector('.canvas-container')?.appendChild(cursor);
        
        return cursor;
    }

    updateOnlineUsers(count) {
        const usersElement = document.querySelector('.online-users');
        if (usersElement) {
            usersElement.textContent = `${count} user${count !== 1 ? 's' : ''} online`;
        }
    }

    getRandomColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    setupRoomControls() {
        // Create new room
        document.getElementById('newRoomBtn')?.addEventListener('click', () => {
            const newRoomId = Math.random().toString(36).substring(2, 15);
            window.location.href = `${window.location.origin}?room=${newRoomId}`;
        });

        // Share room
        document.getElementById('shareRoomBtn')?.addEventListener('click', () => {
            const roomUrl = `${window.location.origin}?room=${this.room}`;
            navigator.clipboard.writeText(roomUrl).then(() => {
                this.showToast('Room link copied to clipboard!');
            }).catch(() => {
                this.showToast('Failed to copy link. URL: ' + roomUrl);
            });
        });
    }

    updateRoomDisplay() {
        const roomIdElement = document.querySelector('.room-id');
        if (roomIdElement) {
            roomIdElement.textContent = `Room: ${this.room}`;
        }
    }

    showToast(message, duration = 3000) {
        let toast = document.querySelector('.toast');
        
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CollaborativeDrawingApp();
});