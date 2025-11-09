// WebSocket client for collaborative canvas
class WebSocketClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  connect() {
    try {
      // Connect to WebSocket server
      this.socket = io();
      
      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.onConnect();
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
        this.onDisconnect();
        this.attemptReconnect();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.isConnected = false;
        this.onConnectionError(error);
      });

      // Set up message handlers
      this.setupMessageHandlers();
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      this.onConnectionError(error);
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.onMaxReconnectAttemptsReached();
    }
  }

  setupMessageHandlers() {
    // User management
    this.socket.on('userInfo', (userInfo) => {
      this.onUserInfoReceived(userInfo);
    });

    this.socket.on('usersList', (users) => {
      this.onUsersListReceived(users);
    });

    this.socket.on('userCount', (count) => {
      this.onUserCountReceived(count);
    });

    // Room management
    this.socket.on('roomInfo', (info) => {
      this.onRoomInfoReceived(info);
    });

    // Drawing events
    this.socket.on('drawAction', (action) => {
      this.onDrawActionReceived(action);
    });

    this.socket.on('canvasState', (state) => {
      this.onCanvasStateReceived(state);
    });

    this.socket.on('syncHistory', (history) => {
      this.onSyncHistoryReceived(history);
    });

    this.socket.on('undoRedoState', (state) => {
      this.onUndoRedoStateReceived(state);
    });

    // Cursor tracking
    this.socket.on('cursorMove', (cursorData) => {
      this.onCursorMoveReceived(cursorData);
    });

    // Canvas actions
    this.socket.on('clearCanvas', () => {
      this.onClearCanvasReceived();
    });
  }

  // Connection events
  onConnect() {
    // Override in implementation
  }

  onDisconnect() {
    // Override in implementation
  }

  onConnectionError(error) {
    // Override in implementation
  }

  onMaxReconnectAttemptsReached() {
    // Override in implementation
  }

  // User management events
  onUserInfoReceived(userInfo) {
    // Override in implementation
  }

  onUsersListReceived(users) {
    // Override in implementation
  }

  onUserCountReceived(count) {
    // Override in implementation
  }

  // Room management events
  onRoomInfoReceived(info) {
    // Override in implementation
  }

  // Drawing events
  onDrawActionReceived(action) {
    // Override in implementation
  }

  onCanvasStateReceived(state) {
    // Override in implementation
  }

  onSyncHistoryReceived(history) {
    // Override in implementation
  }

  onUndoRedoStateReceived(state) {
    // Override in implementation
  }

  // Cursor tracking
  onCursorMoveReceived(cursorData) {
    // Override in implementation
  }

  // Canvas actions
  onClearCanvasReceived() {
    // Override in implementation
  }

  // Emit methods
  emit(event, data) {
    if (this.isConnected && this.socket) {
      this.socket.emit(event, data);
    } else {
      console.warn('Cannot emit event, not connected:', event);
    }
  }

  // User actions
  setUserName(name) {
    this.emit('setUserName', name);
  }

  joinRoom(roomId) {
    this.emit('joinRoom', roomId);
  }

  // Drawing actions
  sendDrawAction(action) {
    this.emit('drawAction', action);
  }

  sendCanvasState(state) {
    this.emit('canvasState', state);
  }

  // Undo/Redo
  requestUndo() {
    this.emit('requestUndo');
  }

  requestRedo() {
    this.emit('requestRedo');
  }

  // Canvas actions
  clearCanvas() {
    this.emit('clearCanvas');
  }

  // Cursor tracking
  sendCursorMove(data) {
    this.emit('cursorMove', data);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketClient;
}