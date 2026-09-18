class Canvas {
    constructor(canvasId, userId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.userId = userId;
        this.isDrawing = false;
        this.state = {
            paths: [],
            currentPath: null,
            redoStack: [],
            version: 0
        };
        this.onDrawCallback = null;
        this.previousColor = null; // Store previous color when switching to eraser

        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        // Set canvas size to match display size
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Enable smooth lines
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    setupEventListeners() {
        this.canvas.addEventListener('pointerdown', this.startDrawing.bind(this));
        this.canvas.addEventListener('pointermove', this.draw.bind(this));
        this.canvas.addEventListener('pointerup', this.endDrawing.bind(this));
        this.canvas.addEventListener('pointerout', this.endDrawing.bind(this));
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        // Store current drawing
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // Resize canvas
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        // Restore drawing
        this.ctx.putImageData(imageData, 0, 0);
        
        // Reset context properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    isShapeTool(tool) {
        return ['rectangle', 'circle', 'triangle', 'line', 'arrow'].includes(tool);
    }

    startDrawing(e) {
        this.isDrawing = true;
        const point = this.getPoint(e);
        const currentTool = this.getCurrentTool();
        const colorPicker = document.getElementById('colorPicker');

        // Determine the color based on the current tool
        let pathColor;
        if (currentTool === 'eraser') {
            pathColor = '#131521'; // match canvas background
        } else {
            pathColor = colorPicker.value;
        }

        this.state.currentPath = {
            id: Math.random().toString(36).substr(2, 9),
            points: this.isShapeTool(currentTool) ? [point, point] : [point],
            color: pathColor,
            width: this.getStrokeWidth(),
            tool: currentTool,
            fill: !!document.getElementById('fillToggle')?.classList.contains('active'),
            userId: this.userId
        };

        // Clear redo stack when starting a new path
        this.state.redoStack = [];
    }

    draw(e) {
        if (!this.isDrawing || !this.state.currentPath) return;

        const point = this.getPoint(e);
        const path = this.state.currentPath;

        if (this.isShapeTool(path.tool)) {
            // Shapes: update the end point and show a live preview
            path.points[1] = point;
            this.redraw();
            this.drawPath(path);
        } else {
            path.points.push(point);
            this.drawPath(path);
        }
    }

    endDrawing() {
        if (!this.isDrawing || !this.state.currentPath) return;

        this.state.paths.push(this.state.currentPath);
        if (this.onDrawCallback) {
            this.onDrawCallback(this.state.currentPath);
        }

        this.isDrawing = false;
        this.state.currentPath = null;
    }

    getPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            pressure: e.pressure
        };
    }

    drawPath(path) {
        if (!path.points || path.points.length === 0) return;

        this.ctx.strokeStyle = path.color;
        this.ctx.fillStyle = path.color;
        this.ctx.lineWidth = path.width;

        if (this.isShapeTool(path.tool)) {
            this.drawShape(path);
            return;
        }

        if (path.points.length < 2) {
            // Single dot
            this.ctx.beginPath();
            this.ctx.arc(path.points[0].x, path.points[0].y, path.width / 2, 0, Math.PI * 2);
            this.ctx.fill();
            return;
        }

        this.ctx.beginPath();
        // Move to the first point
        this.ctx.moveTo(path.points[0].x, path.points[0].y);

        // Use quadratic curves for smooth lines
        for (let i = 1; i < path.points.length - 1; i++) {
            const xc = (path.points[i].x + path.points[i + 1].x) / 2;
            const yc = (path.points[i].y + path.points[i + 1].y) / 2;
            this.ctx.quadraticCurveTo(path.points[i].x, path.points[i].y, xc, yc);
        }

        // Draw the last segment
        const last = path.points[path.points.length - 1];
        this.ctx.lineTo(last.x, last.y);
        this.ctx.stroke();
    }

    drawShape(path) {
        const [start, end] = [path.points[0], path.points[path.points.length - 1]];
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        this.ctx.beginPath();
        switch (path.tool) {
            case 'rectangle':
                this.ctx.rect(x, y, w, h);
                break;
            case 'circle':
                this.ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                break;
            case 'triangle':
                this.ctx.moveTo(x + w / 2, y);
                this.ctx.lineTo(x + w, y + h);
                this.ctx.lineTo(x, y + h);
                this.ctx.closePath();
                break;
            case 'line':
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(end.x, end.y);
                this.ctx.stroke();
                return;
            case 'arrow': {
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(end.x, end.y);
                const angle = Math.atan2(end.y - start.y, end.x - start.x);
                const head = Math.max(12, path.width * 3);
                this.ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
                this.ctx.moveTo(end.x, end.y);
                this.ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
                this.ctx.stroke();
                return;
            }
        }
        if (path.fill) this.ctx.fill();
        this.ctx.stroke();
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.state.paths.forEach(path => this.drawPath(path));
    }

    findLastPathByUser(userId) {
        for (let i = this.state.paths.length - 1; i >= 0; i--) {
            if (this.state.paths[i].userId === userId) {
                return i;
            }
        }
        return -1;
    }

    undo() {
        if (this.state.paths.length === 0) {
            return null;
        }

        // Remove last path and add to redo stack
        const path = this.state.paths.pop();
        if (path) {
            this.state.redoStack.push({ ...path });
            this.redraw();
            return path;
        }
        return null;
    }

    redo() {
        if (this.state.redoStack.length === 0) {
            return null;
        }

        // Get last path from redo stack and add back to paths
        const path = this.state.redoStack.pop();
        if (path) {
            this.state.paths.push({ ...path });
            this.redraw();
            return path;
        }
        return null;
    }

    applyPath(path) {
        this.state.paths.push(path);
        this.drawPath(path);
    }

    setOnDrawCallback(callback) {
        this.onDrawCallback = callback;
    }

    getCurrentTool() {
        return document.querySelector('.tool.active')?.id || 'brush';
    }

    getColor() {
        return document.getElementById('colorPicker').value;
    }

    getStrokeWidth() {
        return parseInt(document.getElementById('strokeWidth').value);
    }
}

// Export the Canvas class
export { Canvas };