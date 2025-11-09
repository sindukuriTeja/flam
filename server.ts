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
interface RoomData {
  canvasState: any;
  drawingHistory: any[];
  userCount: number;
}

const rooms = new Map<string, RoomData>();

function getOrCreateRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      canvasState: null,
      drawingHistory: [],
      userCount: 0
    });
  }
  return rooms.get(roomId)!;
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  let currentRoom = 'default';
  
  // Handle room joining
  socket.on('joinRoom', (roomId: string) => {
    // Leave previous room
    socket.leave(currentRoom);
    const prevRoom = getOrCreateRoom(currentRoom);
    prevRoom.userCount--;
    io.to(currentRoom).emit('userCount', prevRoom.userCount);
    
    // Join new room
    currentRoom = roomId || 'default';
    socket.join(currentRoom);
    const room = getOrCreateRoom(currentRoom);
    room.userCount++;
    
    console.log(`User ${socket.id} joined room: ${currentRoom}`);
    
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

  socket.on('drawAction', (action) => {
    const room = getOrCreateRoom(currentRoom);
    room.drawingHistory.push(action);
    // Broadcast to all users in the same room
    socket.to(currentRoom).emit('drawAction', action);
  });

  socket.on('canvasState', (state) => {
    const room = getOrCreateRoom(currentRoom);
    room.canvasState = state;
    socket.to(currentRoom).emit('canvasState', state);
  });
  
  socket.on('undoAction', () => {
    io.to(currentRoom).emit('undoAction');
  });
  
  socket.on('redoAction', () => {
    io.to(currentRoom).emit('redoAction');
  });

  socket.on('clearCanvas', () => {
    const room = getOrCreateRoom(currentRoom);
    room.canvasState = null;
    room.drawingHistory = [];
    socket.to(currentRoom).emit('clearCanvas');
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    const room = getOrCreateRoom(currentRoom);
    room.userCount--;
    io.to(currentRoom).emit('userCount', room.userCount);
    
    // Clean up empty rooms
    if (room.userCount === 0 && currentRoom !== 'default') {
      rooms.delete(currentRoom);
      console.log(`Room ${currentRoom} deleted (empty)`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});