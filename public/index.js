// Preset colors for the palette
const PRESET_COLORS = [
    '#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b',
    '#ec4899', '#8b5cf6', '#f97316', '#4b5563', '#ffffff'
];

const MAX_HISTORY_SIZE = 50;
class DrawingCanvasApp {
    constructor() {
        // Drawing state
        this.currentTool = 'brush';
        this.color = '#000000';
        this.brushSize = 5;
        this.isFillEnabled = false;
        this.isDrawing = false;
        this.startPoint = null;
        this.snapshot = null;
        this.currentBrushStroke = [];
        
        // Selection state
        this.selectionRect = null;
        this.isMovingSelection = false;
        this.moveStartPoint = null;
        this.selectionImageData = null;
        this.CANVAS_BG_COLOR = '#ffffff';
        
        // History for Undo/Redo
        this.historyStack = [];
        this.redoStack = [];
        
        // Initialize socket connection
        this.socket = null;
        this.initSocket();
        
        // Get DOM elements
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas?.getContext('2d');
        this.selectionCanvas = document.getElementById('selection-canvas');
        this.selectionCtx = this.selectionCanvas?.getContext('2d');
        this.toolContainer = document.getElementById('tool-container');
        this.colorPalette = document.getElementById('color-palette');
        this.brushSizeSlider = document.getElementById('brush-size');
        this.brushSizeValue = document.getElementById('brush-size-value');
        this.fillShapeContainer = document.getElementById('fill-shape-container');
        this.fillShapeCheckbox = document.getElementById('fill-shape');
        this.undoBtn = document.getElementById('undo-btn');
        this.redoBtn = document.getElementById('redo-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.downloadBtn = document.getElementById('download-btn');
        this.shareLinkBtn = document.getElementById('share-link-btn');
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.roomIdDisplay = document.getElementById('room-id-display');
        this.userCountElement = document.getElementById('user-count');
        this.customColorPickerLabel = null;
        this.customColorPickerInput = null;
        
        // Room management
        this.currentRoomId = this.getRoomIdFromUrl() || 'default';
        this.lastUserCount = undefined;
        
        // Validate required elements
        if (!this.canvas || !this.ctx || !this.selectionCanvas || !this.selectionCtx) {
            console.error('Canvas elements not found');
            return;
        }
        
        // Initialize the app
        this.init();
    }
    
    initSocket() {
        try {
            if (typeof io !== 'undefined') {
                this.socket = io();
                console.log('Socket.IO connected successfully');
                
                // Join room immediately after connection
                this.socket.on('connect', () => {
                    console.log('Socket connected, joining room:', this.currentRoomId);
                    this.socket.emit('joinRoom', this.currentRoomId);
                });
                
                // Also join immediately if already connected
                if (this.socket.connected) {
                    console.log('Socket already connected, joining room:', this.currentRoomId);
                    this.socket.emit('joinRoom', this.currentRoomId);
                }
            } else {
                console.warn('Socket.IO library not loaded - running in offline mode');
            }
        } catch (error) {
            console.error('Socket initialization failed:', error);
        }
    }
    
    init() {
        console.log('Drawing Canvas App initializing...');
        this.setupCanvases();
        this.setupColorPalette();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.saveState();
        this.updateUI();
        console.log('Drawing Canvas App initialized successfully!');
    }
    setupSocketListeners() {
        if (!this.socket) return;
        
        this.socket.on('drawAction', (action) => {
            console.log('Received drawAction from server:', action);
            // Only execute if it's from another user (check if we just sent this)
            // Execute the action to show other users' drawings
            this.executeDrawAction(this.ctx, action);
        });
        
        this.socket.on('canvasState', (state) => {
            console.log('Received canvasState sync');
            this.ctx.putImageData(state, 0, 0);
            this.historyStack = [state];
            this.redoStack = [];
            this.updateUndoRedoUI();
        });
        
        this.socket.on('syncHistory', (history) => {
            console.log('Syncing drawing history:', history.length, 'actions');
            // Clear canvas first
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Replay all drawing actions for new users
            history.forEach(action => {
                this.executeDrawAction(this.ctx, action);
            });
            this.saveState();
        });
        
        this.socket.on('undoAction', () => {
            console.log('Received undo from other user');
            if (this.historyStack.length > 1) {
                this.historyStack.pop();
                const prevState = this.historyStack[this.historyStack.length - 1];
                this.ctx.putImageData(prevState, 0, 0);
                this.updateUndoRedoUI();
            }
        });
        
        this.socket.on('redoAction', () => {
            // Redo is local only for now
        });
        
        this.socket.on('clearCanvas', () => {
            console.log('Received clear canvas from server');
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.historyStack = [];
            this.saveState();
            this.updateUndoRedoUI();
        });
        
        this.socket.on('userCount', (count) => {
            console.log('User count updated:', count);
            if (this.userCountElement) {
                this.userCountElement.textContent = `${count} user${count !== 1 ? 's' : ''} online`;
                
                // Show notification when users join/leave
                if (this.lastUserCount !== undefined && count > this.lastUserCount) {
                    this.showNotification('👋 A user joined the room!', 'info');
                } else if (this.lastUserCount !== undefined && count < this.lastUserCount) {
                    this.showNotification('👋 A user left the room', 'info');
                }
                this.lastUserCount = count;
            }
        });
        
        this.socket.on('roomInfo', (info) => {
            console.log('Room info received:', info);
            if (this.roomIdDisplay) {
                const displayText = info.roomId === 'default' 
                    ? '🔒 Private' 
                    : `🎨 ${info.roomId.substring(0, 8)}`;
                this.roomIdDisplay.textContent = displayText;
                this.roomIdDisplay.title = `Full Room ID: ${info.roomId}`;
            }
        });
    }
    setupCanvases() {
        const parent = this.canvas.parentElement;
        const rect = parent.getBoundingClientRect();
        
        // Set canvas dimensions
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.selectionCanvas.width = rect.width;
        this.selectionCanvas.height = rect.height;
        
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.selectionCanvas.style.width = rect.width + 'px';
        this.selectionCanvas.style.height = rect.height + 'px';
        
        // Handle window resize
        window.addEventListener('resize', () => {
            const parent = this.canvas.parentElement;
            const rect = parent.getBoundingClientRect();
            
            // Preserve current drawing
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvas.width;
            tempCanvas.height = this.canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.canvas, 0, 0);
            
            // Resize canvases
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.selectionCanvas.width = rect.width;
            this.selectionCanvas.height = rect.height;
            
            // Restore drawing scaled
            this.ctx.drawImage(tempCanvas, 0, 0, this.canvas.width, this.canvas.height);
            
            this.historyStack = [];
            this.saveState();
            this.clearSelection();
        });
    }
    setupColorPalette() {
        if (!this.colorPalette) return;
        
        // Get existing color buttons
        const colorButtons = this.colorPalette.querySelectorAll('button[data-color]');
        colorButtons.forEach(button => {
            button.addEventListener('click', (e) => this.handleColorSelect(e));
        });
        
        // Setup custom color picker
        const customLabel = this.colorPalette.querySelector('label');
        if (customLabel) {
            this.customColorPickerLabel = customLabel;
            this.customColorPickerInput = customLabel.querySelector('input[type="color"]');
            
            if (this.customColorPickerInput) {
                this.customColorPickerInput.addEventListener('input', (e) => {
                    this.color = e.target.value;
                    if (this.customColorPickerLabel) {
                        this.customColorPickerLabel.style.backgroundColor = this.color;
                    }
                    this.updateUI();
                });
            }
        }
    }
    setupEventListeners() {
        // Canvas mouse/touch events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', (e) => this.stopDrawing(e));
        this.canvas.addEventListener('mouseleave', (e) => this.stopDrawing(e));
        
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => this.startDrawing(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.draw(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.stopDrawing(e), { passive: false });
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Tool selection
        if (this.toolContainer) {
            this.toolContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.tool-btn');
                if (btn && btn.dataset.tool) {
                    this.currentTool = btn.dataset.tool;
                    if (this.currentTool !== 'select') {
                        this.clearSelection();
                    }
                    this.updateUI();
                }
            });
        }
        
        // Brush size slider
        if (this.brushSizeSlider) {
            this.brushSizeSlider.addEventListener('input', (e) => {
                this.brushSize = Number(e.target.value);
                this.updateUI();
            });
        }
        
        // Fill shape checkbox
        if (this.fillShapeCheckbox) {
            this.fillShapeCheckbox.addEventListener('change', (e) => {
                this.isFillEnabled = e.target.checked;
            });
        }
        
        // Action buttons
        if (this.undoBtn) this.undoBtn.addEventListener('click', () => this.undo());
        if (this.redoBtn) this.redoBtn.addEventListener('click', () => this.redo());
        if (this.clearBtn) this.clearBtn.addEventListener('click', () => this.clearCanvas());
        if (this.downloadBtn) this.downloadBtn.addEventListener('click', () => this.downloadImage());
        if (this.shareLinkBtn) this.shareLinkBtn.addEventListener('click', () => this.shareLink());
        if (this.createRoomBtn) this.createRoomBtn.addEventListener('click', () => this.createNewRoom());
    }
    // Event Handlers
    getPointInCanvas(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }
    
    isPointInSelection(point, rect) {
        return point.x >= rect.x && point.x <= rect.x + rect.width &&
               point.y >= rect.y && point.y <= rect.y + rect.height;
    }
    
    handleColorSelect(e) {
        const target = e.target.closest('button[data-color]');
        if (target && target.dataset.color) {
            this.color = target.dataset.color;
            if (this.customColorPickerInput) {
                this.customColorPickerInput.value = this.color;
            }
            this.updateUI();
        }
    }
    
    handleKeyDown(e) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectionRect) {
            e.preventDefault();
            this.ctx.clearRect(this.selectionRect.x, this.selectionRect.y, 
                             this.selectionRect.width, this.selectionRect.height);
            this.clearSelection();
            this.saveState();
        }
    }
    startDrawing(e) {
        e.preventDefault();
        const currentPoint = this.getPointInCanvas(e);
        
        console.log('Start drawing with tool:', this.currentTool, 'at', currentPoint);
        
        if (this.currentTool === 'select') {
            if (this.selectionRect && this.isPointInSelection(currentPoint, this.selectionRect)) {
                // Move existing selection
                this.isMovingSelection = true;
                this.moveStartPoint = currentPoint;
                this.selectionImageData = this.ctx.getImageData(
                    this.selectionRect.x, this.selectionRect.y,
                    this.selectionRect.width, this.selectionRect.height
                );
                this.ctx.clearRect(this.selectionRect.x, this.selectionRect.y,
                                 this.selectionRect.width, this.selectionRect.height);
                this.clearSelectionMarquee();
            } else {
                // Create new selection
                this.clearSelection();
                this.isDrawing = true;
                this.startPoint = currentPoint;
            }
            return;
        }
        
        this.isDrawing = true;
        this.startPoint = currentPoint;
        this.ctx.beginPath();
        this.ctx.lineWidth = this.brushSize;
        this.ctx.strokeStyle = this.color;
        this.ctx.fillStyle = this.color;
        
        if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.currentBrushStroke = [currentPoint];
        }
        
        if (this.currentTool !== 'brush' && this.currentTool !== 'eraser') {
            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    draw(e) {
        if (!this.isDrawing && !this.isMovingSelection) return;
        e.preventDefault();
        
        const currentPoint = this.getPointInCanvas(e);
        
        if (this.currentTool === 'select') {
            if (this.isDrawing) {
                this.clearSelectionMarquee();
                this.drawSelectionMarquee(this.startPoint, currentPoint);
            } else if (this.isMovingSelection && this.selectionImageData) {
                this.ctx.putImageData(this.historyStack[this.historyStack.length - 1], 0, 0);
                const dx = currentPoint.x - this.moveStartPoint.x;
                const dy = currentPoint.y - this.moveStartPoint.y;
                this.ctx.putImageData(this.selectionImageData, 
                                    this.selectionRect.x + dx, 
                                    this.selectionRect.y + dy);
            }
            return;
        }
        
        switch (this.currentTool) {
            case 'brush':
            case 'eraser':
                this.currentBrushStroke.push(currentPoint);
                this.drawBrush(this.ctx, this.color, this.brushSize, currentPoint, 
                             this.startPoint, this.currentTool === 'eraser');
                this.startPoint = currentPoint;
                break;
                
            case 'rectangle':
            case 'circle':
            case 'line':
            case 'triangle':
            case 'arrow':
                if (this.snapshot) {
                    this.ctx.putImageData(this.snapshot, 0, 0);
                    this.drawShape(this.ctx, this.currentTool, this.startPoint, currentPoint,
                                 this.color, this.brushSize, this.isFillEnabled);
                }
                break;
        }
    }
    stopDrawing(e) {
        if (this.currentTool === 'select') {
            if (this.isDrawing) {
                const endPoint = this.getPointInCanvas(e);
                this.isDrawing = false;
                const x = Math.min(this.startPoint.x, endPoint.x);
                const y = Math.min(this.startPoint.y, endPoint.y);
                const width = Math.abs(this.startPoint.x - endPoint.x);
                const height = Math.abs(this.startPoint.y - endPoint.y);
                
                if (width > 0 && height > 0) {
                    this.selectionRect = { x, y, width, height };
                    this.clearSelectionMarquee();
                    this.drawSelectionMarquee(this.startPoint, endPoint);
                }
                this.startPoint = null;
            } else if (this.isMovingSelection) {
                const endPoint = this.getPointInCanvas(e);
                this.isMovingSelection = false;
                const dx = endPoint.x - this.moveStartPoint.x;
                const dy = endPoint.y - this.moveStartPoint.y;
                this.selectionRect.x += dx;
                this.selectionRect.y += dy;
                this.drawSelectionMarquee(
                    { x: this.selectionRect.x, y: this.selectionRect.y },
                    { x: this.selectionRect.x + this.selectionRect.width, 
                      y: this.selectionRect.y + this.selectionRect.height }
                );
                this.selectionImageData = null;
                this.moveStartPoint = null;
                this.saveState();
            }
            return;
        }
        
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        const endPoint = this.getPointInCanvas(e);
        
        const action = {
            tool: this.currentTool,
            color: this.color,
            brushSize: this.brushSize,
            isFillEnabled: this.isFillEnabled,
            startPoint: this.startPoint,
            endPoint: endPoint,
            points: (this.currentTool === 'brush' || this.currentTool === 'eraser') 
                   ? this.currentBrushStroke : undefined
        };
        
        // Execute drawing locally
        this.executeDrawAction(this.ctx, action);
        
        // Send to server (broadcast to others)
        if (this.socket) {
            console.log('Sending drawAction to server:', action);
            this.socket.emit('drawAction', action);
        }
        
        this.ctx.closePath();
        this.startPoint = null;
        this.snapshot = null;
        this.currentBrushStroke = [];
        this.saveState();
    }
    // Drawing logic
    executeDrawAction(ctx, action) {
        if (action.tool === 'brush' || action.tool === 'eraser') {
            if (action.points && action.points.length > 1) {
                for (let i = 1; i < action.points.length; i++) {
                    this.drawBrush(ctx, action.color, action.brushSize, 
                                 action.points[i], action.points[i - 1], 
                                 action.tool === 'eraser');
                }
            }
        } else {
            this.drawShape(ctx, action.tool, action.startPoint, action.endPoint,
                         action.color, action.brushSize, action.isFillEnabled);
        }
    }
    drawBrush(ctx, color, brushSize, currentPoint, prevPoint, isEraser) {
        const startPoint = prevPoint || currentPoint;
        const effectiveColor = isEraser ? this.CANVAS_BG_COLOR : color;
        
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = effectiveColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        ctx.closePath();
        
        ctx.globalCompositeOperation = 'source-over';
    }
    drawShape(ctx, tool, startPoint, currentPoint, color, brushSize, isFillEnabled) {
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        
        const fillableShapes = ['rectangle', 'circle', 'triangle'];
        const startX = startPoint.x;
        const startY = startPoint.y;
        const width = currentPoint.x - startX;
        const height = currentPoint.y - startY;
        
        switch (tool) {
            case 'rectangle':
                ctx.rect(startX, startY, width, height);
                break;
                
            case 'circle':
                const centerX = startX + width / 2;
                const centerY = startY + height / 2;
                const radius = Math.min(Math.abs(width), Math.abs(height)) / 2;
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                break;
                
            case 'triangle':
                ctx.moveTo(startX + width / 2, startY);
                ctx.lineTo(startX, startY + height);
                ctx.lineTo(startX + width, startY + height);
                ctx.closePath();
                break;
                
            case 'line':
                ctx.moveTo(startX, startY);
                ctx.lineTo(currentPoint.x, currentPoint.y);
                break;
                
            case 'arrow':
                this.drawArrow(ctx, startPoint, currentPoint, brushSize);
                break;
        }
        
        if (isFillEnabled && fillableShapes.includes(tool)) {
            ctx.fill();
        }
        ctx.stroke();
    }
    drawArrow(ctx, from, to, brushSize) {
        const headlen = brushSize + 10;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
    }
    // Selection logic
    clearSelection() {
        this.selectionRect = null;
        this.isMovingSelection = false;
        this.moveStartPoint = null;
        this.selectionImageData = null;
        this.clearSelectionMarquee();
    }
    clearSelectionMarquee() {
        this.selectionCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
    }
    drawSelectionMarquee(start, end) {
        this.selectionCtx.setLineDash([6]);
        this.selectionCtx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        this.selectionCtx.lineWidth = 1;
        this.selectionCtx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    }
    // History management
    saveState() {
        this.redoStack = [];
        if (this.historyStack.length >= MAX_HISTORY_SIZE) {
            this.historyStack.shift();
        }
        this.historyStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
        this.updateUndoRedoUI();
    }
    
    undo() {
        if (this.historyStack.length > 1) {
            const currentState = this.historyStack.pop();
            this.redoStack.push(currentState);
            const prevState = this.historyStack[this.historyStack.length - 1];
            this.ctx.putImageData(prevState, 0, 0);
            this.updateUndoRedoUI();
            
            // Broadcast undo to other users
            if (this.socket) {
                this.socket.emit('undoAction');
            }
        }
    }
    
    redo() {
        if (this.redoStack.length > 0) {
            const nextState = this.redoStack.pop();
            this.historyStack.push(nextState);
            this.ctx.putImageData(nextState, 0, 0);
            this.updateUndoRedoUI();
            
            // Broadcast redo to other users
            if (this.socket) {
                this.socket.emit('redoAction');
            }
        }
    }
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.socket) {
            this.socket.emit('clearCanvas');
        }
        this.saveState();
    }
    
    downloadImage() {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        
        tempCtx.fillStyle = this.CANVAS_BG_COLOR;
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(this.canvas, 0, 0);
        
        const link = document.createElement('a');
        link.download = 'drawing.png';
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }
    
    shareLink() {
        const roomUrl = this.getRoomUrl();
        const roomName = this.currentRoomId === 'default' ? 'Private Canvas' : `Room ${this.currentRoomId}`;
        
        // Try to copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(roomUrl)
                .then(() => {
                    this.showNotification(`📤 ${roomName} link copied! Share with friends to draw together`, 'success');
                })
                .catch(() => {
                    this.showShareDialog(roomUrl, roomName);
                });
        } else {
            this.showShareDialog(roomUrl, roomName);
        }
    }
    
    showShareDialog(url, roomName) {
        const message = `Share this link to collaborate in ${roomName}:

${url}

Anyone with this link can join and draw together!`;
        prompt(message, url);
    }
    
    createNewRoom() {
        const newRoomId = this.generateRoomId();
        const newUrl = `${window.location.origin}${window.location.pathname}?room=${newRoomId}`;
        
        // Show notification with the new room info
        this.showNotification('🎨 New room created! Share the link to collaborate', 'success');
        
        // Update URL and reload to start fresh
        setTimeout(() => {
            window.location.href = newUrl;
        }, 1000);
    }
    
    getRoomIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('room');
    }
    
    getRoomUrl() {
        if (this.currentRoomId && this.currentRoomId !== 'default') {
            return `${window.location.origin}${window.location.pathname}?room=${this.currentRoomId}`;
        }
        return window.location.href;
    }
    
    generateRoomId() {
        // Generate a unique, easy-to-share room ID
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 8);
        return `${timestamp}${randomStr}`;
    }
    showShareDialog(url) {
        const message = `Share this link to collaborate:\n\n${url}`;
        prompt(message, url);
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300 ${
            type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        } text-white font-semibold`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    // UI update logic
    updateUI() {
        if (this.brushSizeValue) {
            this.brushSizeValue.textContent = `${this.brushSize} px`;
        }
        
        // Update tool selection UI
        if (this.toolContainer) {
            this.toolContainer.querySelectorAll('.tool-btn').forEach(btn => {
                btn.classList.remove('bg-gradient-to-br', 'from-purple-600', 'to-pink-500', 
                                   'text-white', 'shadow-lg');
                btn.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
                btn.style.background = '';
                
                if (btn.dataset.tool === this.currentTool) {
                    btn.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
                    btn.classList.add('bg-gradient-to-br', 'from-purple-600', 'to-pink-500', 
                                    'text-white', 'shadow-lg');
                }
            });
        }
        
        this.canvas.style.cursor = this.currentTool === 'select' ? 'default' : 'crosshair';
        
        // Update color palette UI
        if (this.colorPalette) {
            this.colorPalette.querySelectorAll('button').forEach(btn => {
                btn.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
                if (btn.dataset.color === this.color) {
                    btn.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
                }
            });
        }
        
        if (this.customColorPickerLabel) {
            this.customColorPickerLabel.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
            if (!PRESET_COLORS.includes(this.color)) {
                this.customColorPickerLabel.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
            }
            this.customColorPickerLabel.style.backgroundColor = this.color;
        }
        
        // Show/hide fill shape toggle
        const fillableShapes = ['rectangle', 'circle', 'triangle'];
        if (this.fillShapeContainer) {
            if (fillableShapes.includes(this.currentTool)) {
                this.fillShapeContainer.style.display = 'flex';
            } else {
                this.fillShapeContainer.style.display = 'none';
            }
        }
        
        this.updateUndoRedoUI();
    }
    
    updateUndoRedoUI() {
        if (this.undoBtn) {
            this.undoBtn.disabled = this.historyStack.length <= 1;
        }
        if (this.redoBtn) {
            this.redoBtn.disabled = this.redoStack.length === 0;
        }
    }
}
// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new DrawingCanvasApp();
});
