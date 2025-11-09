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
}

interface RoomData {
  canvasState: any;
  drawingHistory: DrawAction[];  // All actions that are currently visible
  redoHistory: DrawAction[];     // Actions that have been undone
  userCount: number;
}

const rooms = new Map<string, RoomData>();

function getOrCreateRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      canvasState: null,
      drawingHistory: [],
      redoHistory: [],
      userCount: 0
    });
  }
  return rooms.get(roomId)!;
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  let currentRoom = 'default';
  
  // Automatically join default room on connection
  socket.join(currentRoom);
  const defaultRoom = getOrCreateRoom(currentRoom);
  defaultRoom.userCount++;
  
  // Immediately send user count to all users in default room
  io.to(currentRoom).emit('userCount', defaultRoom.userCount);
  io.to(currentRoom).emit('roomInfo', { roomId: currentRoom });
  
  console.log(`User ${socket.id} auto-joined room: ${currentRoom}, users: ${defaultRoom.userCount}`);
  
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
    prevRoom.userCount = Math.max(0, prevRoom.userCount - 1);
    io.to(currentRoom).emit('userCount', prevRoom.userCount);
    console.log(`User ${socket.id} left room ${currentRoom}, remaining: ${prevRoom.userCount}`);
    
    // Join new room
    currentRoom = roomId || 'default';
    socket.join(currentRoom);
    const room = getOrCreateRoom(currentRoom);
    room.userCount++;
    
    console.log(`User ${socket.id} joined room: ${currentRoom}, users: ${room.userCount}`);
    
    // Send room info to all users in the room
    io.to(currentRoom).emit('userCount', room.userCount);
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
    
    // Add timestamp if not present
    if (!action.timestamp) {
      action.timestamp = Date.now();
    }
    
    // Add to history and clear redo (new action invalidates redo)
    room.drawingHistory.push(action);
    room.redoHistory = [];
    
    console.log(`✏️ DrawAction in room ${currentRoom}: history=${room.drawingHistory.length}, redo=0`);
    
    // Broadcast to OTHER users in the same room
    socket.to(currentRoom).emit('drawAction', action);
    
    // Send undo/redo state to ALL users
    io.to(currentRoom).emit('undoRedoState', {
      canUndo: room.drawingHistory.length > 0,
      canRedo: room.redoHistory.length > 0
    });
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
    room.userCount = Math.max(0, room.userCount - 1);
    console.log(`Room ${currentRoom} now has ${room.userCount} users`);
    io.to(currentRoom).emit('userCount', room.userCount);
    
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