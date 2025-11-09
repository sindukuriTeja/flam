# Collaborative Drawing Canvas - Architecture Documentation

## Overview

The Collaborative Drawing Canvas is a real-time web application that enables multiple users to draw together on a shared canvas. The system uses WebSocket connections for instant synchronization and implements conflict resolution to ensure consistent state across all clients.

## System Architecture

### High-Level Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│   Client 1      │◄──────────────►│                 │
│   (Browser)     │                │   Server        │
└─────────────────┘                │   (Node.js)     │
                                   │                 │
┌─────────────────┐                │   ┌─────────┐   │
│   Client 2      │◄──────────────►│   │  Room   │   │
│   (Browser)     │                │   │ Manager │   │
└─────────────────┘                │   └─────────┘   │
                                   │                 │
┌─────────────────┐                │   ┌─────────┐   │
│   Client N      │◄──────────────►│   │ Drawing │   │
│   (Browser)     │                │   │  State  │   │
└─────────────────┘                └─────────────────┘
```

### Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5 Canvas API, Tailwind CSS
- **Backend**: Node.js, Express.js, Socket.IO, TypeScript
- **Real-time Communication**: WebSocket via Socket.IO
- **Deployment**: Vercel/Render with static file serving
- **Build System**: TypeScript compiler, npm scripts

## Component Breakdown

### 1. Client-Side Architecture

#### DrawingCanvasApp Class
The main client-side application class that manages:

- **Canvas Management**: HTML5 Canvas setup and rendering
- **Tool System**: Brush, eraser, shapes, selection tools
- **Event Handling**: Mouse/touch events, keyboard shortcuts
- **WebSocket Communication**: Real-time synchronization
- **UI Management**: Tool selection, color palette, user interface

#### WebSocketClient Class
Handles WebSocket connection management:

- **Connection Lifecycle**: Connect, disconnect, reconnection
- **Message Routing**: Event-based message handling
- **Error Handling**: Connection failures and recovery
- **Event Emitters**: Send drawing actions to server

#### Key Client Components

```
DrawingCanvasApp
├── Canvas Management
│   ├── Drawing Canvas (main canvas)
│   ├── Selection Canvas (marquee overlay)
│   └── Cursor Canvas (remote cursors)
├── Tool System
│   ├── Brush/Eraser
│   ├── Shapes (Rectangle, Circle, Triangle, Line, Arrow)
│   └── Selection Tool
├── State Management
│   ├── Local History (Undo/Redo)
│   ├── Pending Actions Queue
│   └── Conflict Resolution
└── UI Components
    ├── Toolbar
    ├── Color Palette
    ├── User List
    └── Room Controls
```

### 2. Server-Side Architecture

#### Express Server Setup
- **Static File Serving**: HTML, CSS, JavaScript files
- **CORS Configuration**: Allow cross-origin WebSocket connections
- **Port Configuration**: Environment-based port selection

#### Socket.IO Integration
- **Connection Management**: Handle client connections/disconnections
- **Room System**: Isolate users into collaborative spaces
- **Event Broadcasting**: Real-time message distribution

#### Room Management
Each room maintains:

```typescript
interface RoomData {
  canvasState: any;          
  drawingHistory: DrawAction[]; 
  redoHistory: DrawAction[];    
  userCount: number;          
  users: Map<string, UserInfo>; 
}
```

#### User Management
- **Unique Identification**: Socket ID-based user tracking
- **Color Assignment**: Automatic unique color assignment
- **Name Generation**: Auto-generated names with collision avoidance
- **Activity Tracking**: Last activity timestamps

### 3. Data Structures

#### DrawAction Interface
```typescript
interface DrawAction {
  tool: string;              
  color: string;             
  brushSize: number;         
  isFillEnabled?: boolean;   
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  points?: { x: number; y: number }[]; 
  timestamp: number;         
  userId?: string;          
  userName?: string;         
}
```

#### UserInfo Interface
```typescript
interface UserInfo {
  id: string;                
  name: string;              
  color: string;             
  socketId: string;         
  joinedAt: number;          
  lastActivity: number;      
}
```

## Real-Time Communication Protocol

### Socket Events

#### Client → Server
- `joinRoom`: Join a specific room
- `setUserName`: Set/update user display name
- `drawAction`: Send drawing action
- `cursorMove`: Send cursor position
- `canvasState`: Send canvas state update
- `requestUndo`: Request undo operation
- `requestRedo`: Request redo operation
- `clearCanvas`: Clear the canvas

#### Server → Client
- `userInfo`: Send user information
- `usersList`: Send list of online users
- `userCount`: Send current user count
- `roomInfo`: Send room information
- `drawAction`: Broadcast drawing action
- `cursorMove`: Broadcast cursor position
- `canvasState`: Send canvas state
- `syncHistory`: Send complete drawing history
- `undoRedoState`: Send undo/redo button states
- `clearCanvas`: Broadcast canvas clear

## Conflict Resolution System

### Timestamp-Based Ordering
1. **Action Timestamping**: Each drawing action gets a high-precision timestamp
2. **Queue-Based Processing**: Actions are queued and sorted by timestamp
3. **Sequential Execution**: Actions are processed in timestamp order
4. **Duplicate Prevention**: Actions with timestamps too close are discarded

### Server Authoritative State
- **Centralized History**: Server maintains the single source of truth
- **Global Undo/Redo**: All undo/redo operations go through the server
- **State Synchronization**: Clients receive authoritative state updates

## Room System Architecture

### Room Creation and Management
- **Default Room**: Always available for immediate collaboration
- **Dynamic Rooms**: Created on-demand with unique IDs
- **Room Cleanup**: Empty rooms (except default) are automatically deleted
- **URL-Based Joining**: Room IDs are passed via URL parameters

### Room State Persistence
- **In-Memory Storage**: Room data stored in server memory
- **No Persistence**: Rooms are ephemeral (reset on server restart)
- **Scalability Consideration**: Current design is single-server focused

## Performance Optimizations

### Client-Side Optimizations
- **Canvas Resizing**: Dynamic canvas sizing with content preservation
- **Cursor Throttling**: Limited cursor update frequency (50ms)
- **Optimistic UI**: Local drawing before server confirmation
- **History Limiting**: Maximum 50 history states

### Server-Side Optimizations
- **Efficient Broadcasting**: Targeted room-based message distribution
- **Memory Management**: Automatic cleanup of empty rooms
- **Connection Pooling**: Socket.IO connection management

### Network Optimizations
- **Binary Data**: Canvas state transmitted as efficient image data
- **Event Batching**: Multiple actions can be processed together
- **Compression**: WebSocket compression for large payloads

## Security Considerations

### Current Security Measures
- **CORS Configuration**: Restricted to allowed origins
- **Input Validation**: User names limited to 20 characters
- **Rate Limiting**: Implicit through timestamp-based conflict resolution

### Potential Security Enhancements
- **Authentication**: User authentication system
- **Authorization**: Room access controls
- **Input Sanitization**: More comprehensive input validation
- **Rate Limiting**: Explicit rate limiting per user/connection

## Scalability Considerations

### Current Limitations
- **Single Server**: No horizontal scaling support
- **In-Memory State**: Data lost on server restart
- **No Persistence**: No database integration

### Scaling Strategies
- **Redis**: For distributed state management
- **Database**: For persistent room storage
- **Load Balancing**: Multiple server instances
- **CDN**: Static asset distribution

## Deployment Architecture

### Vercel Deployment
- **Serverless Functions**: TypeScript server as serverless function
- **Static Assets**: HTML/CSS/JS served from CDN
- **Automatic Scaling**: Vercel's serverless scaling

### Render Deployment
- **Persistent Server**: Long-running Node.js process
- **Environment Variables**: Configuration via environment
- **Auto-scaling**: Based on load

## Monitoring and Debugging

### Logging
- **Server Logs**: Connection events, room management, errors
- **Client Logs**: WebSocket events, drawing actions, UI state
- **Performance Metrics**: Action processing times, memory usage

### Error Handling
- **Connection Recovery**: Automatic reconnection with exponential backoff
- **Graceful Degradation**: Offline mode capabilities
- **Error Boundaries**: Client-side error containment

## Future Enhancements

### Planned Features
- **Persistent Storage**: Database integration for room persistence
- **User Accounts**: Authentication and user profiles
- **Advanced Tools**: Layers, text tool, image import
- **Mobile Optimization**: Touch-specific improvements
- **Performance Monitoring**: Real-time performance metrics

### Architectural Improvements
- **Microservices**: Separate services for different functionalities
- **Message Queue**: For better scalability
- **Caching Layer**: Redis for state caching
- **API Versioning**: For backward compatibility

## Development Workflow

### Local Development
1. **TypeScript Compilation**: `npm run build`
2. **Server Start**: `npm start`
3. **Hot Reload**: `npm run dev` for development
4. **Testing**: Manual testing across multiple browser tabs

### Deployment Pipeline
1. **Build**: TypeScript compilation
2. **Testing**: Automated tests (if implemented)
3. **Deployment**: Platform-specific deployment
4. **Monitoring**: Error tracking and performance monitoring

This architecture provides a solid foundation for real-time collaborative drawing while maintaining simplicity and performance. The system is designed to be extensible and can accommodate future enhancements as the user base grows.