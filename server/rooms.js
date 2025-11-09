// Room management for collaborative canvas
class RoomManager {
  constructor() {
    // Store room data
    this.rooms = new Map();
    
    // Predefined user colors for visual identification
    this.USER_COLORS = [
      '#ef4444', // Red
      '#f59e0b', // Amber
      '#10b981', // Emerald
      '#3b82f6', // Blue
      '#8b5cf6', // Violet
      '#ec4899', // Pink
      '#14b8a6', // Teal
      '#f97316', // Orange
      '#06b6d4', // Cyan
      '#a855f7'  // Purple
    ];
  }

  // Get or create a room
  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        canvasState: null,
        drawingHistory: [],
        redoHistory: [],
        userCount: 0,
        users: new Map()
      });
    }
    return this.rooms.get(roomId);
  }

  // Assign a unique color to a user
  assignUserColor(room) {
    const usedColors = Array.from(room.users.values()).map(u => u.color);
    const availableColor = this.USER_COLORS.find(color => !usedColors.includes(color));
    return availableColor || this.USER_COLORS[Math.floor(Math.random() * this.USER_COLORS.length)];
  }

  // Generate a user name for a room
  generateUserName(room) {
    const existingNumbers = Array.from(room.users.values())
      .map(u => u.name)
      .filter(name => name.startsWith('User '))
      .map(name => parseInt(name.replace('User ', '')))
      .filter(n => !isNaN(n));
    
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    return `User ${nextNumber}`;
  }

  // Get users list for a room
  getUsersList(room) {
    return Array.from(room.users.values()).map(user => ({
      id: user.id,
      name: user.name,
      color: user.color,
      joinedAt: user.joinedAt
    }));
  }

  // Add user to room
  addUserToRoom(socket, roomId, customUserName = null) {
    const room = this.getOrCreateRoom(roomId);
    
    // Create user info
    const userId = socket.id;
    const userName = customUserName || this.generateUserName(room);
    const userColor = this.assignUserColor(room);
    
    const userInfo = {
      id: userId,
      name: userName,
      color: userColor,
      socketId: socket.id,
      joinedAt: Date.now(),
      lastActivity: Date.now()
    };
    
    // Add user to room
    room.users.set(userId, userInfo);
    room.userCount++;
    
    console.log(`User ${userName} (${userColor}) joined room: ${roomId}`);
    
    return { room, userInfo };
  }

  // Remove user from room
  removeUserFromRoom(socket, roomId) {
    const room = this.getOrCreateRoom(roomId);
    
    // Remove user from room
    const userId = socket.id;
    const user = room.users.get(userId);
    
    if (user) {
      room.users.delete(userId);
      room.userCount = Math.max(0, room.userCount - 1);
      
      console.log(`User ${user.name} left room: ${roomId}`);
      
      // Clean up empty rooms (except default)
      if (room.userCount === 0 && roomId !== 'default') {
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
    
    return room;
  }

  // Get room data
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  // Get all rooms
  getAllRooms() {
    return Array.from(this.rooms.keys());
  }

  // Clear room canvas state
  clearRoomCanvas(roomId) {
    const room = this.getOrCreateRoom(roomId);
    room.canvasState = null;
    room.drawingHistory = [];
    room.redoHistory = [];
    return room;
  }

  // Add action to room history
  addDrawingAction(roomId, action) {
    const room = this.getOrCreateRoom(roomId);
    
    // Check for duplicate actions
    const isDuplicate = room.drawingHistory.some(existing => 
      Math.abs(existing.timestamp - action.timestamp) < 1 &&
      existing.tool === action.tool
    );
    
    if (isDuplicate) {
      console.warn(`Duplicate action detected (timestamp: ${action.timestamp}), skipping`);
      return false;
    }
    
    // Add to history and sort by timestamp
    room.drawingHistory.push(action);
    room.drawingHistory.sort((a, b) => a.timestamp - b.timestamp);
    room.redoHistory = [];
    
    return true;
  }

  // Undo last action in room
  undoLastAction(roomId) {
    const room = this.getOrCreateRoom(roomId);
    
    if (room.drawingHistory.length > 0) {
      const lastAction = room.drawingHistory.pop();
      room.redoHistory.push(lastAction);
      return true;
    }
    
    return false;
  }

  // Redo last undone action in room
  redoLastAction(roomId) {
    const room = this.getOrCreateRoom(roomId);
    
    if (room.redoHistory.length > 0) {
      const redoAction = room.redoHistory.pop();
      room.drawingHistory.push(redoAction);
      return true;
    }
    
    return false;
  }

  // Get undo/redo state for room
  getUndoRedoState(roomId) {
    const room = this.getOrCreateRoom(roomId);
    return {
      canUndo: room.drawingHistory.length > 0,
      canRedo: room.redoHistory.length > 0
    };
  }
}

// Export room manager
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoomManager;
}