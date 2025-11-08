"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path = __importStar(require("path"));
const app = express();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server, {
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
let canvasState = null;
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
