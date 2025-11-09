# Collaborative Drawing Canvas

A real-time collaborative drawing application where multiple users can draw together on a shared canvas. Built with Node.js, Express, Socket.IO, and TypeScript.

![Collaborative Drawing Canvas](https://img.shields.io/badge/Real--Time-Collaboration-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue) ![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8+-black)

## Features

- **Real-time Collaboration**: Draw simultaneously with others in the same room
- **Multiple Drawing Tools**: Brush, eraser, shapes (rectangle, circle, triangle, line, arrow), selection tool
- **Color Palette**: 10 preset colors plus custom color picker
- **Room System**: Create private rooms or join existing ones via shareable links
- **User Management**: Unique user names and colors, online user list
- **Cursor Tracking**: See other users' cursors in real-time
- **Undo/Redo**: Server-managed history for consistent state across all users
- **Conflict Resolution**: Timestamp-based ordering prevents drawing conflicts
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Export Functionality**: Download your artwork as PNG

##  Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```
cd collaborative-drawing-canvas
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript server:
```bash
npm run build
```

4. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3002`

### Development

For development with auto-restart:
```bash
npm run dev
```

## Usage

1. **Enter Your Name**: On first visit, enter your display name
2. **Start Drawing**: Use the toolbar to select tools and colors
3. **Create a Room**: Click "New Room" to create a private collaborative space
4. **Share the Link**: Copy and share the room link with others to collaborate
5. **Real-time Drawing**: See others' cursors and drawings update instantly

### Drawing Tools

- **Brush**: Freehand drawing with adjustable size
- **Eraser**: Remove parts of the drawing
- **Shapes**: Rectangle, Circle, Triangle, Line, Arrow
- **Select**: Move selected areas of the canvas
- **Fill**: Toggle fill for shapes (rectangle, circle, triangle)

### Keyboard Shortcuts

- `Delete` or `Backspace`: Delete selected area
- `Ctrl+Z`: Undo (server-managed)
- `Ctrl+Y`: Redo (server-managed)

## Architecture

This application uses a client-server architecture with real-time WebSocket communication:

- **Frontend**: Vanilla JavaScript with HTML5 Canvas API
- **Backend**: Node.js + Express + Socket.IO
- **Real-time**: WebSocket connections for instant collaboration
- **State Management**: Server maintains authoritative canvas state
- **Conflict Resolution**: Timestamp-based action ordering

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

## Deployment
### Render

1. Connect your GitHub repository to Render
2. Use the configuration in `render.yaml`
3. Set Node.js version to 18
4. Deploy

### Manual Deployment

```bash
npm install
npm run build
npm start
```

The server will run on the port specified by the `PORT` environment variable (default: 3002).

##  Tech Stack

- **Backend**: Node.js, Express, Socket.IO, TypeScript
- **Frontend**: HTML5, CSS3, JavaScript, Tailwind CSS
- **Real-time Communication**: Socket.IO
- **Canvas API**: HTML5 Canvas for drawing
- **Deployment**: Vercel, Render
- **Package Management**: npm

##  Project Structure

```
collaborative-drawing-canvas/
├── index.html              # Main HTML file
├── server.ts               # TypeScript server
├── public/
│   └── index.js           # Client-side JavaScript
├── client/                # Additional client files
├── server/                # Server-side modules
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vercel.json            # Vercel deployment config
├── render.yaml            # Render deployment config
├── start.bat              # Windows start script
└── README.md              # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -am 'Add new feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Socket.IO](https://socket.io/) for real-time communication
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Icons from [Heroicons](https://heroicons.com/)

## Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/username/repo/issues) page
2. Create a new issue with detailed information
3. Include your Node.js version and browser information

---