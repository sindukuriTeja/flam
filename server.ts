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

// Store canvas state
let canvasState: any = null;
let userCount = 0;

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  userCount++;
  io.emit('userCount', userCount);

  // Send current canvas state to new user
  if (canvasState) {
    socket.emit('canvasState', canvasState);
  }

  socket.on('drawAction', (action) => {
    // Broadcast the draw action to all other clients
    socket.broadcast.emit('drawAction', action);
  });

  socket.on('canvasState', (state) => {
    canvasState = state;
    // Broadcast the full canvas state to all clients
    socket.broadcast.emit('canvasState', state);
  });

  socket.on('clearCanvas', () => {
    canvasState = null;
    socket.broadcast.emit('clearCanvas');
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    userCount--;
    io.emit('userCount', userCount);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});