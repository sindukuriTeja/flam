import express = require('express');
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as path from 'path';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const PORT = process.env.PORT || 3002;
const ROUND_SECONDS = 60;

// Deliberately explicit: do not expose package.json, node_modules, or other files.
const ROOT = path.join(__dirname, '..');
const CLIENT_FILES = ['index.html', 'main.js', 'canvas.js', 'websocket.js', 'style.css'];
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
for (const file of CLIENT_FILES) app.get('/' + file, (_req, res) => res.sendFile(path.join(ROOT, file)));

interface DrawPath { id: string; points: { x: number; y: number; pressure?: number }[]; color: string; width: number; tool: string; userId: string; }
interface Player { id: string; name: string; number: number; score: number; }
interface RoomData {
  paths: DrawPath[];
  players: Map<string, Player>;
  nextPlayerNumber: number;
  roundNumber: number;
  drawerId: string | null;
  secretWord: string | null;
  roundLive: boolean;
  timer: NodeJS.Timeout | null;
}

const rooms = new Map<string, RoomData>();
function getOrCreateRoom(roomId: string): RoomData {
  let room = rooms.get(roomId);
  if (!room) {
    room = { paths: [], players: new Map(), nextPlayerNumber: 1, roundNumber: 0, drawerId: null, secretWord: null, roundLive: false, timer: null };
    rooms.set(roomId, room);
  }
  return room;
}
function publicPlayers(room: RoomData) {
  return [...room.players.values()].sort((a, b) => a.number - b.number).map(({ id, name, number, score }) => ({ id, name, number, score }));
}
function scores(room: RoomData) { return publicPlayers(room).map(({ id, name, number, score }) => ({ id, name, number, score })); }
function leaderName(room: RoomData): string | null {
  const all = [...room.players.values()];
  if (!all.length) return null;
  const best = Math.max(...all.map(player => player.score));
  return all.filter(player => player.score === best).map(player => player.name).join(' & ');
}
function emitPlayers(roomId: string, room: RoomData) {
  io.to(roomId).emit('playersUpdated', { players: publicPlayers(room).map(({ id, name, number }) => ({ id, name, number })), count: room.players.size });
  io.to(roomId).emit('userJoined', { userCount: room.players.size });
  io.to(roomId).emit('scoreboard', { scores: scores(room), leaderName: leaderName(room) });
}
function stopTimer(room: RoomData) { if (room.timer) clearTimeout(room.timer); room.timer = null; }
function endRound(roomId: string, room: RoomData, guesser: Player | null) {
  if (!room.drawerId || !room.secretWord) return;
  stopTimer(room);
  const word = room.secretWord;
  room.roundLive = false;
  room.drawerId = null;
  room.secretWord = null;
  io.to(roomId).emit('roundEnded', { guesserName: guesser ? guesser.name : null, word, scores: scores(room) });
  io.to(roomId).emit('scoreboard', { scores: scores(room), leaderName: leaderName(room) });
}
function removeFromRoom(roomId: string, socketId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const wasDrawer = room.drawerId === socketId;
  room.players.delete(socketId);
  if (wasDrawer) { stopTimer(room); room.drawerId = null; room.secretWord = null; room.roundLive = false; io.to(roomId).emit('roundEnded', { guesserName: null, word: 'Round cancelled (drawer left)', scores: scores(room) }); }
  if (room.players.size === 0) { stopTimer(room); rooms.delete(roomId); return; }
  emitPlayers(roomId, room);
}

io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;

  // Accept the original joinRoom(roomId) format as well as { roomId, name }.
  socket.on('joinRoom', (join: string | { roomId?: string; name?: string }) => {
    const suppliedRoom = typeof join === 'string' ? join : join?.roomId;
    const suppliedName = typeof join === 'string' ? '' : (join?.name || '');
    const roomId = suppliedRoom?.trim() || 'default';
    if (currentRoom) { socket.leave(currentRoom); removeFromRoom(currentRoom, socket.id); }
    currentRoom = roomId;
    socket.join(roomId);
    const room = getOrCreateRoom(roomId);
    const cleanName = suppliedName.trim().slice(0, 24) || `Player ${room.nextPlayerNumber}`;
    room.players.set(socket.id, { id: socket.id, name: cleanName, number: room.nextPlayerNumber++, score: 0 });
    socket.emit('roomState', { paths: room.paths });
    emitPlayers(roomId, room);
  });

  socket.on('draw', (data: { roomId: string; path: DrawPath }) => {
    if (!currentRoom || !data?.path) return;
    const room = getOrCreateRoom(currentRoom);
    // During an active Pictionary round only the server-selected drawer may draw.
    if (room.roundLive && room.drawerId !== socket.id) return;
    room.paths.push(data.path);
    socket.to(currentRoom).emit('draw', { path: data.path });
  });
  socket.on('undo', () => { if (currentRoom) socket.to(currentRoom).emit('undoPath', {}); });
  socket.on('redo', () => { if (currentRoom) socket.to(currentRoom).emit('redoPath', {}); });
  socket.on('cursorMove', (data: { roomId: string; x: number; y: number }) => {
    if (currentRoom && data) socket.to(currentRoom).emit('cursorMove', { userId: socket.id, x: data.x, y: data.y });
  });
  socket.on('ping', () => socket.emit('pong'));

  socket.on('startRound', () => {
    if (!currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    if (room.players.size < 2 || room.drawerId || room.roundLive) return;
    const players = [...room.players.values()];
    const drawer = players[Math.floor(Math.random() * players.length)];
    room.roundNumber += 1;
    room.drawerId = drawer.id;
    room.secretWord = null;
    io.to(currentRoom).emit('roundStarted', { drawerId: drawer.id, drawerName: drawer.name, roundNumber: room.roundNumber, timerSeconds: ROUND_SECONDS });
  });

  socket.on('submitWord', (rawWord: string) => {
    if (!currentRoom || typeof rawWord !== 'string') return;
    const room = getOrCreateRoom(currentRoom);
    const word = rawWord.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (room.drawerId !== socket.id || room.roundLive || !word) return;
    room.secretWord = word;
    room.roundLive = true;
    room.paths = [];
    io.to(currentRoom).emit('canvasCleared', {});
    socket.emit('secretWord', word); // drawer confirmation only
    socket.to(currentRoom).emit('wordSubmitted', {});
    room.timer = setTimeout(() => endRound(currentRoom!, room, null), ROUND_SECONDS * 1000);
  });

  socket.on('guess', (rawGuess: string) => {
    if (!currentRoom || typeof rawGuess !== 'string') return;
    const room = getOrCreateRoom(currentRoom);
    const guesser = room.players.get(socket.id);
    if (!guesser || !room.roundLive || !room.secretWord || room.drawerId === socket.id) return;
    const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (normalized(rawGuess) !== normalized(room.secretWord)) { socket.emit('guessResult', { correct: false }); return; }
    guesser.score += 10;
    socket.emit('guessResult', { correct: true, guesserName: guesser.name });
    endRound(currentRoom, room, guesser);
  });

  socket.on('endGame', () => {
    if (!currentRoom) return;
    const room = getOrCreateRoom(currentRoom);
    if (!room.players.size) return;
    if (room.roundLive && room.secretWord) endRound(currentRoom, room, null);
    else { stopTimer(room); room.drawerId = null; room.secretWord = null; room.roundLive = false; }
    const allScores = scores(room);
    const top = Math.max(...allScores.map(score => score.score));
    const winners = allScores.filter(score => score.score === top).map(score => score.name);
    io.to(currentRoom).emit('gameOver', { winnerName: winners.join(' & '), scores: allScores });
    io.to(currentRoom).emit('scoreboard', { scores: allScores, leaderName: leaderName(room) });
  });

  socket.on('disconnect', () => { if (currentRoom) removeFromRoom(currentRoom, socket.id); });
});
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
