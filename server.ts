import express = require('express');
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as path from 'path';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3002;

// Serve static files from public directory
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Serve static files from root (for any other static files)
app.use(express.static(path.join(__dirname, '..')));

// Serve the main HTML file from the root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Store canvas state per room
interface DrawAction {
  tool: string;
  color: string;
  brushSize: number;
  isFillEnabled?: boolean;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  points?: { x: number; y: number }[];
  timestamp: number;
  userId?: string;  // Track who made the action
  userName?: string; // Display name of user
}

interface UserInfo {
  id: string;
  name: string;
  color: string;
  socketId: string;
  joinedAt: number;
  lastActivity: number;
}

interface CursorPosition {
  x: number;
  y: number;
  userId: string;
  userName: string;
  color: string;
}

interface RoomData {
  canvasState: any;
  drawingHistory: DrawAction[];
  redoHistory: DrawAction[];
  userCount: number;
  users: Map<string, UserInfo>;  // Active users in room
}

const rooms = new Map<string, RoomData>();

// Predefined user colors for visual identification
const USER_COLORS = [
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

function getOrCreateRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      canvasState: null,
      drawingHistory: [],
      redoHistory: [],
      userCount: 0,
      users: new Map()
    });
  }
  return rooms.get(roomId)!;
}

function assignUserColor(room: RoomData): string {
  const usedColors = Array.from(room.users.values()).map(u => u.color);
  const availableColor = USER_COLORS.find(color => !usedColors.includes(color));
  return availableColor || USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

function generateUserName(room: RoomData): string {
  const existingNumbers = Array.from(room.users.values())
    .map(u => u.name)
    .filter(name => name.startsWith('User '))
    .map(name => parseInt(name.replace('User ', '')))
    .filter(n => !isNaN(n));
  
  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  return `User ${nextNumber}`;
}

function getUsersList(room: RoomData) {
  return Array.from(room.users.values()).map(user => ({
    id: user.id,
    name: user.name,
    color: user.color,
    joinedAt: user.joinedAt
  }));
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  let currentRoom = 'default';
  let currentUser: UserInfo | null = null;
  
  // Automatically join default room on connection
  socket.join(currentRoom);
  const defaultRoom = getOrCreateRoom(currentRoom);
  
  // Create user info with unique color and name
  const userId = socket.id;
  const userName = generateUserName(defaultRoom);
  const userColor = assignUserColor(defaultRoom);
  
  currentUser = {
    id: userId,
    name: userName,
    color: userColor,
    socketId: socket.id,
    joinedAt: Date.now(),
    lastActivity: Date.now()
  };
  
  defaultRoom.users.set(userId, currentUser);
  defaultRoom.userCount++;
  
  console.log(`👤 ${userName} (${userColor}) joined room: ${currentRoom}`);
  
  // Send user's own info
  socket.emit('userInfo', {
    id: currentUser.id,
    name: currentUser.name,
    color: currentUser.color
  });
  
  // Send updated user list to ALL users in room
  io.to(currentRoom).emit('usersList', getUsersList(defaultRoom));
  io.to(currentRoom).emit('userCount', defaultRoom.userCount);
  io.to(currentRoom).emit('roomInfo', { roomId: currentRoom });
  
  // Send current state to new user
  if (defaultRoom.canvasState) {
    socket.emit('canvasState', defaultRoom.canvasState);
  }
  if (defaultRoom.drawingHistory.length > 0) {
    socket.emit('syncHistory', defaultRoom.drawingHistory);
  }
  
  // Handle room joining
  socket.on('joinRoom', (roomId: string) => {
    if (roomId === currentRoom) return; // Already in this room
    
    // Leave previous room
    socket.leave(currentRoom);
    const prevRoom = getOrCreateRoom(currentRoom);
    if (currentUser) {
      prevRoom.users.delete(currentUser.id);
    }
    prevRoom.userCount = Math.max(0, prevRoom.userCount - 1);
    io.to(currentRoom).emit('userCount', prevRoom.userCount);
    io.to(currentRoom).emit('usersList', getUsersList(prevRoom));
    console.log(`User ${socket.id} left room ${currentRoom}, remaining: ${prevRoom.userCount}`);
    
    // Join new room
    currentRoom = roomId || 'default';
    socket.join(currentRoom);
    const room = getOrCreateRoom(currentRoom);
    
    // Update user color for new room
    if (currentUser) {
      currentUser.color = assignUserColor(room);
      currentUser.name = generateUserName(room);
      currentUser.joinedAt = Date.now();
      room.users.set(currentUser.id, currentUser);
    }
    room.userCount++;
    
    console.log(`👤 ${currentUser?.name} joined room: ${currentRoom}, users: ${room.userCount}`);
    
    // Send updated user info
    socket.emit('userInfo', {
      id: currentUser!.id,
      name: currentUser!.name,
      color: currentUser!.color
    });
    
    // Send room info to all users in the room
    io.to(currentRoom).emit('userCount', room.userCount);
    io.to(currentRoom).emit('usersList', getUsersList(room));
    io.to(currentRoom).emit('roomInfo', { roomId: currentRoom });
    
    // Send current canvas state to new user
    if (room.canvasState) {
      socket.emit('canvasState', room.canvasState);
    }
    
    // Send all drawing history to new user
    if (room.drawingHistory.length > 0) {
      socket.emit('syncHistory', room.drawingHistory);
    }
  });

  socket.on('drawAction', (action: DrawAction) => {
    const room = getOrCreateRoom(currentRoom);
    
    // Add user info to action
    if (currentUser) {
      action.userId = currentUser.id;
      action.userName = currentUser.name;
      currentUser.lastActivity = Date.now();
    }
    
    // Ensure timestamp exists for conflict resolution
    if (!action.timestamp) {
      action.timestamp = Date.now();
      console.warn(`⚠️ Action received without timestamp, assigned: ${action.timestamp}`);
    }
    
    // Check for duplicate actions (conflict prevention)
    const isDuplicate = room.drawingHistory.some(existing => 
      Math.abs(existing.timestamp - action.timestamp) < 1 &&
      existing.tool === action.tool
    );
    
    if (isDuplicate) {
      console.warn(`⚠️ Duplicate action detected (timestamp: ${action.timestamp}), skipping`);
      return;
    }
    
    // Add to history and sort by timestamp for consistent ordering
    room.drawingHistory.push(action);
    room.drawingHistory.sort((a, b) => a.timestamp - b.timestamp);
    room.redoHistory = [];
    
    console.log(`✏️ ${currentUser?.name} drew ${action.tool} in room ${currentRoom}`);
    
    // Broadcast to OTHER users in the same room with timestamp preserved
    socket.to(currentRoom).emit('drawAction', action);
    
    // Send undo/redo state to ALL users
    io.to(currentRoom).emit('undoRedoState', {
      canUndo: room.drawingHistory.length > 0,
      canRedo: room.redoHistory.length > 0
    });
  });
  
  // Handle cursor position updates for real-time collaboration
  socket.on('cursorMove', (data: { x: number; y: number }) => {
    if (currentUser) {
      const cursorData: CursorPosition = {
        x: data.x,
        y: data.y,
        userId: currentUser.id,
        userName: currentUser.name,
        color: currentUser.color
      };
      // Broadcast cursor position to OTHER users
      socket.to(currentRoom).emit('cursorMove', cursorData);
    }
  });

  socket.on('canvasState', (state) => {
    const room = getOrCreateRoom(currentRoom);
    room.canvasState = state;
    console.log(`Broadcasting canvasState to room ${currentRoom}`);
    // Broadcast to OTHER users (sender already has it)
    socket.to(currentRoom).emit('canvasState', state);
  });
  
  // Global Undo - Server manages the authoritative history
  socket.on('requestUndo', () => {
    const room = getOrCreateRoom(currentRoom);
    
    if (room.drawingHistory.length > 0) {
      // Move last action from history to redo
      const lastAction = room.drawingHistory.pop()!;
      room.redoHistory.push(lastAction);
      
      console.log(`⏪ UNDO in room ${currentRoom}: history=${room.drawingHistory.length}, redo=${room.redoHistory.length}`);
      
      // Send the entire current history to ALL users to rebuild
      io.to(currentRoom).emit('syncHistory', room.drawingHistory);
      
      // Update undo/redo button states for all users
      io.to(currentRoom).emit('undoRedoState', {
        canUndo: room.drawingHistory.length > 0,
        canRedo: room.redoHistory.length > 0
      });
    }
  });
  
  // Global Redo - Server manages the authoritative history
  socket.on('requestRedo', () => {
    const room = getOrCreateRoom(currentRoom);
    
    if (room.redoHistory.length > 0) {
      // Move action from redo back to history
      const redoAction = room.redoHistory.pop()!;
      room.drawingHistory.push(redoAction);
      
      console.log(`⏩ REDO in room ${currentRoom}: history=${room.drawingHistory.length}, redo=${room.redoHistory.length}`);
      
      // Send the entire current history to ALL users to rebuild
      io.to(currentRoom).emit('syncHistory', room.drawingHistory);
      
      // Update undo/redo button states for all users
      io.to(currentRoom).emit('undoRedoState', {
        canUndo: room.drawingHistory.length > 0,
        canRedo: room.redoHistory.length > 0
      });
    }
  });

  socket.on('clearCanvas', () => {
    const room = getOrCreateRoom(currentRoom);
    room.canvasState = null;
    room.drawingHistory = [];
    room.redoHistory = [];
    
    console.log(`🗑️ CLEAR in room ${currentRoom}`);
    
    // Broadcast to OTHER users (sender already cleared locally)
    socket.to(currentRoom).emit('clearCanvas');
    
    // Update undo/redo button states for all users
    io.to(currentRoom).emit('undoRedoState', {
      canUndo: false,
      canRedo: false
    });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    const room = getOrCreateRoom(currentRoom);
    
    // Remove user from room
    if (currentUser) {
      room.users.delete(currentUser.id);
      console.log(`👋 ${currentUser.name} left room ${currentRoom}`);
    }
    
    room.userCount = Math.max(0, room.userCount - 1);
    console.log(`Room ${currentRoom} now has ${room.userCount} users`);
    
    // Broadcast updated user list and count
    io.to(currentRoom).emit('userCount', room.userCount);
    io.to(currentRoom).emit('usersList', getUsersList(room));
    
    // Clean up empty rooms (except default)
    if (room.userCount === 0 && currentRoom !== 'default') {
      rooms.delete(currentRoom);
      console.log(`Room ${currentRoom} deleted (empty)`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});