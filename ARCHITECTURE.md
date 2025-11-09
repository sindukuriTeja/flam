# Collaborative Drawing Canvas Architecture

## Overview
This is a real-time collaborative drawing application that allows multiple users to draw together on a shared canvas. The application uses WebSockets for real-time communication and implements conflict resolution to handle concurrent drawing operations.

## Project Structure
```
collaborative-canvas/
├── client/
│   ├── index.html          # Main HTML file
│   ├── style.css           # Stylesheet
│   ├── canvas.js           # Canvas drawing logic
│   ├── websocket.js        # WebSocket client
│   └── main.js            # App initialization
├── server/
│   ├── server.js          # Express + WebSocket server
│   ├── rooms.js           # Room management
│   └── drawing-state.js   # Canvas state management
├── package.json           # Project dependencies
└── ARCHITECTURE.md        # This file
```

## Architecture Components

### 1. Client-Side Architecture

#### Main Components
- **DrawingCanvas**: Handles all canvas drawing operations and user interactions
- **WebSocketClient**: Manages WebSocket connections and message handling
- **CollaborativeCanvasApp**: Main application controller that orchestrates all components

#### Canvas Implementation
The application uses the HTML5 Canvas API for all drawing operations:
- Three layered canvas approach:
  - Main drawing canvas (z-index: 1)
  - Selection overlay canvas (z-index: 2) 
  - Cursor tracking canvas (z-index: 3)
- Direct Canvas Context API usage for drawing operations
- Custom implementations for all drawing tools:
  - Brush with smooth line drawing
  - Eraser using composite operations
  - Shape tools (rectangle, circle, triangle, line, arrow)
  - Selection tool with move capability

#### WebSocket Communication
- Real-time communication using Socket.IO
- Event-based messaging system
- Automatic reconnection handling
- Message validation and normalization

### 2. Server-Side Architecture

#### Main Components
- **Express Server**: HTTP server for serving static files
- **Socket.IO Server**: WebSocket server for real-time communication
- **RoomManager**: Manages collaborative rooms and user sessions
- **DrawingStateManager**: Handles canvas state and conflict resolution

#### Room Management
- Isolated collaboration spaces
- Automatic room creation and cleanup
- User presence tracking
- Unique color assignment per user

#### State Management
- Server-authoritative state management
- Drawing history tracking for global undo/redo
- Canvas state serialization
- Conflict resolution using timestamp-based ordering

### 3. Communication Protocol

#### Client to Server Events
- `setUserName`: Set user's display name
- `joinRoom`: Join a collaboration room
- `drawAction`: Send drawing action to other users
- `cursorMove`: Send cursor position updates
- `requestUndo`: Request undo operation
- `requestRedo`: Request redo operation
- `clearCanvas`: Clear the canvas
- `canvasState`: Send current canvas state

#### Server to Client Events
- `userInfo`: Send user's own information
- `usersList`: Send list of online users
- `userCount`: Send current user count
- `roomInfo`: Send room information
- `drawAction`: Broadcast drawing actions
- `cursorMove`: Broadcast cursor positions
- `canvasState`: Send canvas state
- `syncHistory`: Synchronize drawing history
- `undoRedoState`: Send undo/redo button states
- `clearCanvas`: Broadcast canvas clear

### 4. Conflict Resolution

#### Timestamp-Based Ordering
- High-precision timestamps for all actions
- Server-side sorting of actions by timestamp
- Queue-based processing for consistent ordering
- Duplicate action detection and prevention

#### Global Undo/Redo
- Server-managed drawing history
- Authoritative history stack per room
- Synchronized undo/redo across all users
- Complete canvas rebuild on undo/redo operations

### 5. Security Considerations

#### Input Validation
- Client-side input validation
- Server-side message validation
- Color format validation
- Coordinate bounds checking

#### Room Isolation
- Separate state per room
- No cross-room data leakage
- Private room support

## Technical Details

### Canvas Operations
- Direct use of Canvas Context API
- Custom drawing implementations for all tools
- Image data manipulation for state management
- Efficient redraw strategies
- Performance optimization techniques

### Real-time Synchronization
- WebSocket connections with Socket.IO
- Event-based messaging
- Broadcast to all users in room
- Throttled cursor updates (50ms interval)

### State Management
- Client-side canvas state
- Server-side authoritative history
- Image data serialization
- Efficient state synchronization

### Error Handling
- Graceful degradation
- Reconnection handling
- Error notifications
- Fallback mechanisms

## Deployment
The application can be deployed on any Node.js hosting platform that supports WebSocket connections:
- Vercel (with serverless functions)
- Render
- Railway
- Traditional Node.js hosting

## Dependencies
- Express.js: Web server framework
- Socket.IO: Real-time communication
- TypeScript: Type checking (compiled to JavaScript)

## Browser Support
- Modern browsers with Canvas API support
- Mobile touch support
- Responsive design