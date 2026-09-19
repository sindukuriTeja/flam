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

        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = Math.max(1, Math.round(rect.width));
        this.canvas.height = Math.max(1, Math.round(rect.height));
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    setupEventListeners() {
        this.canvas.addEventListener('pointerdown', this.startDrawing.bind(this));
        this.canvas.addEventListener('pointermove', this.draw.bind(this));
        this.canvas.addEventListener('pointerup', this.endDrawing.bind(this));
        this.canvas.addEventListener('pointerout', this.endDrawing.bind(this));
        this.canvas.addEventListener('pointercancel', this.endDrawing.bind(this));
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        if (w === this.canvas.width && h === this.canvas.height) return;
        // Re-render from stored paths (vector) so the drawing stays crisp at the new size.
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.redraw();
    }

    isShapeTool(tool) {
        return ['rectangle', 'circle', 'triangle', 'diamond', 'line', 'arrow', 'heart', 'star'].includes(tool);
    }

    startDrawing(e) {
        if (e.button !== undefined && e.button !== 0) return;
        this.isDrawing = true;
        const point = this.getPoint(e);
        const currentTool = this.getCurrentTool();

        this.state.currentPath = {
            id: Math.random().toString(36).substr(2, 9),
            points: this.isShapeTool(currentTool) ? [point, point] : [point],
            color: currentTool === 'eraser' ? '#ffffff' : document.getElementById('colorPicker').value,
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
        const path = this.state.currentPath;
        this.state.paths.push(path);
        if (this.onDrawCallback) this.onDrawCallback(path);
        this.isDrawing = false;
        this.state.currentPath = null;
    }

    getPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure };
    }

    drawPath(path) {
        if (!path.points || path.points.length === 0) return;
        const ctx = this.ctx;
        const isEraser = path.tool === 'eraser';

        ctx.save();
        if (isEraser) {
            // Real erase: remove ink already on the canvas (reveals the white background).
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = path.color;
            ctx.fillStyle = path.color;
        }
        ctx.lineWidth = path.width;

        if (this.isShapeTool(path.tool)) {
            this.drawShape(path);
            ctx.restore();
            return;
        }

        if (path.tool === 'spray') {
            const radius = Math.max(10, path.width * 2.5);
            path.points.forEach((p, pi) => {
                for (let i = 0; i < 24; i++) {
                    const seed = ((pi * 2654435761 + i * 40503) % 1000) / 1000;
                    const a = seed * Math.PI * 2;
                    const r = (((pi * 97 + i * 31) % 100) / 100) * radius;
                    const size = (((pi * 13 + i * 7) % 10) / 10) * 1.6 + 0.4;
                    ctx.beginPath();
                    ctx.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.restore();
            return;
        }

        if (path.tool === 'marker' || path.tool === 'highlighter') {
            ctx.globalAlpha = path.tool === 'highlighter' ? 0.3 : 0.45;
            ctx.lineWidth = path.width * (path.tool === 'highlighter' ? 3.2 : 2.4);
        }

        if (path.points.length < 2) {
            ctx.beginPath();
            ctx.arc(path.points[0].x, path.points[0].y, Math.max(2, path.width / 2), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length - 1; i++) {
            const xc = (path.points[i].x + path.points[i + 1].x) / 2;
            const yc = (path.points[i].y + path.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(path.points[i].x, path.points[i].y, xc, yc);
        }
        const last = path.points[path.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        ctx.restore();
    }

    drawShape(path) {
        const [start, end] = [path.points[0], path.points[path.points.length - 1]];
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        const ctx = this.ctx;

        ctx.beginPath();
        switch (path.tool) {
            case 'rectangle':
                ctx.rect(x, y, w, h);
                break;
            case 'circle':
                ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                break;
            case 'triangle':
                ctx.moveTo(x + w / 2, y);
                ctx.lineTo(x + w, y + h);
                ctx.lineTo(x, y + h);
                ctx.closePath();
                break;
            case 'diamond':
                ctx.moveTo(x + w / 2, y);
                ctx.lineTo(x + w, y + h / 2);
                ctx.lineTo(x + w / 2, y + h);
                ctx.lineTo(x, y + h / 2);
                ctx.closePath();
                break;
            case 'heart': {
                const cx = x + w / 2;
                ctx.moveTo(cx, y + h * 0.32);
                ctx.bezierCurveTo(cx, y, x, y, x, y + h * 0.32);
                ctx.bezierCurveTo(x, y + h * 0.62, cx, y + h * 0.82, cx, y + h);
                ctx.bezierCurveTo(cx, y + h * 0.82, x + w, y + h * 0.62, x + w, y + h * 0.32);
                ctx.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.32);
                ctx.closePath();
                break;
            }
            case 'star': {
                const cx = x + w / 2, cy = y + h / 2;
                const outer = Math.min(w, h) / 2, inner = outer * 0.42;
                for (let i = 0; i < 10; i++) {
                    const r = i % 2 === 0 ? outer : inner;
                    const a = -Math.PI / 2 + (i * Math.PI) / 5;
                    const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                break;
            }
            case 'line':
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                return;
            case 'arrow': {
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                const angle = Math.atan2(end.y - start.y, end.x - start.x);
                const head = Math.max(12, path.width * 3);
                ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(end.x, end.y);
                ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
                return;
            }
        }
        if (path.fill) ctx.fill();
        ctx.stroke();
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.state.paths.forEach(path => this.drawPath(path));
    }

    // Server-authoritative undo: remove a specific path by id, then redraw.
    removePathById(pathId) {
        const idx = this.state.paths.findIndex(p => p.id === pathId);
        if (idx === -1) return false;
        this.state.paths.splice(idx, 1);
        this.redraw();
        return true;
    }

    applyPath(path) {
        this.state.paths.push(path);
        this.drawPath(path);
    }

    clearAll() {
        this.state.paths = [];
        this.state.redoStack = [];
        this.state.currentPath = null;
        this.redraw();
    }

    setOnDrawCallback(callback) {
        this.onDrawCallback = callback;
    }

    // PNG export with a white background (canvas itself is transparent).
    toDataURL() {
        const out = document.createElement('canvas');
        out.width = this.canvas.width;
        out.height = this.canvas.height;
        const octx = out.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, out.width, out.height);
        octx.drawImage(this.canvas, 0, 0);
        return out.toDataURL('image/png');
    }

    getCurrentTool() {
        return document.querySelector('.tool.active:not(#fillToggle)')?.id || 'brush';
    }

    getColor() {
        return document.getElementById('colorPicker').value;
    }

    getStrokeWidth() {
        return parseInt(document.getElementById('strokeWidth').value, 10) || 5;
    }
}

export { Canvas };