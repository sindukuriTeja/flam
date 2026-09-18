import express = require('express');
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
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

// Root directory holds the client files (index.html, main.js, canvas.js,
// websocket.js, style.css). Serve only those, never node_modules/package.json.
const ROOT = path.join(__dirname, '..');
const CLIENT_FILES = ['index.html', 'main.js', 'canvas.js', 'websocket.js', 'style.css'];

// Root serves the app
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Serve each client asset explicitly
for (const file of CLIENT_FILES) {
  app.get('/' + file, (req, res) => {
    res.sendFile(path.join(ROOT, file));
  });
}

// A single drawn path as sent by the client (canvas.js)
interface DrawPath {
  id: string;
  points: { x: number; y: number; pressure?: number }[];
  color: string;
  width: number;
  tool: string;
  userId: string;
}

interface RoomData {
  paths: DrawPath[];
  users: Map<string, string>; // socketId -> name
}

const rooms = new Map<string, RoomData>();

function getOrCreateRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { paths: [], users: new Map() });
  }
  return rooms.get(roomId)!;
}

function userCount(roomId: string): number {
  const room = rooms.get(roomId);
  return room ? room.users.size : 0;
}

io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;

  // Join / switch room
  socket.on('joinRoom', (roomId: string) => {
    const id = (roomId && roomId.trim()) ? roomId : 'default';

    // Leave previous room if any
    if (currentRoom) {
      socket.leave(currentRoom);
      const prev = rooms.get(currentRoom);
      if (prev) {
        prev.users.delete(socket.id);
        io.to(currentRoom).emit('userJoined', { userCount: prev.users.size });
        if (prev.users.size === 0) rooms.delete(currentRoom);
      }
    }

    currentRoom = id;
    socket.join(id);
    const room = getOrCreateRoom(id);
    room.users.set(socket.id, `User ${socket.id.slice(0, 4)}`);

    // Send the joining client the current canvas state
    socket.emit('roomState', { paths: room.paths });

    // Tell everyone in the room how many users are online
    io.to(id).emit('userJoined', { userCount: room.users.size });
  });

  // A finished path is drawn
  socket.on('draw', (data: { roomId: string; path: DrawPath }) => {
    if (!data || !data.path || !currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    room.paths.push(data.path);

    // Relay to the other users in the room (the sender already drew it locally)
    socket.to(currentRoom).emit('draw', { path: data.path });
  });

  // Undo — the client pops its own path; relay to others so they pop too
  socket.on('undo', (_roomId: string) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('undoPath', {});
  });

  // Redo — mirror of undo
  socket.on('redo', (_roomId: string) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('redoPath', {});
  });

  // Live cursor position
  socket.on('cursorMove', (data: { roomId: string; x: number; y: number }) => {
    if (!data || !currentRoom) return;
    socket.to(currentRoom).emit('cursorMove', {
      userId: socket.id,
      x: data.x,
      y: data.y
    });
  });

  // Latency ping/pong
  socket.on('ping', () => {
    socket.emit('pong');
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.users.delete(socket.id);
      io.to(currentRoom).emit('userJoined', { userCount: room.users.size });
      if (room.users.size === 0) rooms.delete(currentRoom);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});