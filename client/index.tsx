import { Point, Tool, SelectionRect, DrawAction } from './types';


// New color palette to match the design
const PRESET_COLORS = [
  '#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b',
  '#ec4899', '#8b5cf6', '#f97316', '#4b5563', '#ffffff'
];

class DrawingCanvasApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private selectionCanvas: HTMLCanvasElement;
  private selectionCtx: CanvasRenderingContext2D;

  // Toolbar elements
  private toolContainer: HTMLElement;
  private colorPalette: HTMLElement;
  private customColorPickerLabel: HTMLLabelElement;
  private customColorPickerInput: HTMLInputElement;
  private brushSizeSlider: HTMLInputElement;
  private brushSizeValue: HTMLElement;
  private fillShapeContainer: HTMLElement;
  private fillShapeCheckbox: HTMLInputElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private downloadBtn: HTMLButtonElement;

  // State
  private currentTool: Tool = 'brush';
  private color: string = '#000000';
  private brushSize: number = 5;
  private isFillEnabled: boolean = false;
  private isDrawing: boolean = false;
  private startPoint: Point | null = null;
  private snapshot: ImageData | null = null;
  private currentBrushStroke: Point[] = [];
  
  // Selection state
  private selectionRect: SelectionRect | null = null;
  private isMovingSelection: boolean = false;
  private moveStartPoint: Point | null = null;
  private selectionImageData: ImageData | null = null;

  private readonly CANVAS_BG_COLOR = '#ffffff';

  // History for Undo/Redo
  private historyStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private static readonly MAX_HISTORY_SIZE = 50;


  constructor() {
    this.canvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.selectionCanvas = document.getElementById('selection-canvas') as HTMLCanvasElement;
    this.selectionCtx = this.selectionCanvas.getContext('2d')!;
    
    // Query toolbar elements
    this.toolContainer = document.getElementById('tool-container')!;
    this.colorPalette = document.getElementById('color-palette')!;
    this.brushSizeSlider = document.getElementById('brush-size') as HTMLInputElement;
    this.brushSizeValue = document.getElementById('brush-size-value')!;
    this.fillShapeContainer = document.getElementById('fill-shape-container') as HTMLElement;
    this.fillShapeCheckbox = document.getElementById('fill-shape') as HTMLInputElement;
    this.undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
    this.redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
    this.clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
    this.downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
    
    // Elements to be created dynamically
    this.customColorPickerLabel = null!;
    this.customColorPickerInput = null!;

    if (!this.canvas || !this.ctx || !this.selectionCanvas || !this.selectionCtx || !this.toolContainer || !this.colorPalette || !this.brushSizeSlider || !this.brushSizeValue || !this.fillShapeContainer || !this.fillShapeCheckbox || !this.undoBtn || !this.redoBtn || !this.clearBtn || !this.downloadBtn) {
        console.error("Failed to initialize canvas app. One or more elements not found.");
        return;
    }
    
    requestAnimationFrame(() => this.init());
  }

  private init() {
    this.setupCanvases();
    this.populateColorPalette();
    this.initEventListeners();
    this.saveState(); // Save initial blank state
    this.updateUI();
  }
  
  private setupCanvases() {
    const parent = this.canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.selectionCanvas.width = rect.width;
    this.selectionCanvas.height = rect.height;
    
    window.addEventListener('resize', () => {
        const parent = this.canvas.parentElement!;
        const rect = parent.getBoundingClientRect();
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;
        if(oldWidth !== rect.width || oldHeight !== rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.selectionCanvas.width = rect.width;
            this.selectionCanvas.height = rect.height;
            if (this.historyStack.length > 0) {
              this.ctx.putImageData(this.historyStack[this.historyStack.length - 1], 0, 0);
            }
            this.clearSelection();
        }
    });
  }
  
  private populateColorPalette() {
    PRESET_COLORS.forEach(c => {
        const button = document.createElement('button');
        button.dataset.color = c;
        button.style.backgroundColor = c;
        button.className = 'w-8 h-8 rounded-full transition-transform transform hover:scale-110';
        if (c === '#ffffff') button.classList.add('ring-1', 'ring-gray-300');
        button.setAttribute('aria-label', `Select color ${c}`);
        this.colorPalette.appendChild(button);
    });

    this.customColorPickerLabel = document.createElement('label');
    this.customColorPickerLabel.className = 'block relative w-8 h-8 rounded-full cursor-pointer transition-transform transform hover:scale-110 ring-1 ring-gray-300';
    this.customColorPickerLabel.setAttribute('aria-label', 'Select custom color');
    this.customColorPickerLabel.style.backgroundColor = this.color;
    
    this.customColorPickerInput = document.createElement('input');
    this.customColorPickerInput.type = 'color';
    this.customColorPickerInput.value = this.color;
    this.customColorPickerInput.className = 'absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer';

    this.customColorPickerLabel.appendChild(this.customColorPickerInput);
    this.colorPalette.appendChild(this.customColorPickerLabel);
  }

  private initEventListeners() {
    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));
    
    document.addEventListener('keydown', this.handleKeyDown.bind(this));

    this.toolContainer.addEventListener('click', this.handleToolClick.bind(this));
    this.colorPalette.addEventListener('click', this.handleColorPaletteClick.bind(this));
    this.customColorPickerInput.addEventListener('input', this.handleColorPickerInput.bind(this));
    this.brushSizeSlider.addEventListener('input', this.handleBrushSizeChange.bind(this));
    this.fillShapeCheckbox.addEventListener('change', this.handleFillChange.bind(this));
    this.undoBtn.addEventListener('click', this.undo.bind(this));
    this.redoBtn.addEventListener('click', this.redo.bind(this));
    this.clearBtn.addEventListener('click', this.clearCanvas.bind(this));
    this.downloadBtn.addEventListener('click', this.downloadImage.bind(this));
  }

  // Event Handlers
  private getPointInCanvas(e: MouseEvent | TouchEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private startDrawing(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    const currentPoint = this.getPointInCanvas(e);
    
    if (this.currentTool === 'select') {
        // ... (existing selection logic)
        return;
    }

    this.isDrawing = true;
    this.startPoint = currentPoint;
    this.ctx.beginPath();
    this.ctx.lineWidth = this.brushSize;
    this.ctx.strokeStyle = this.color;
    this.ctx.fillStyle = this.color;

    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      this.currentBrushStroke = [currentPoint];
    }
    
    if (this.currentTool !== 'brush' && this.currentTool !== 'eraser') {
      this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private draw(e: MouseEvent | TouchEvent) {
    const currentPoint = this.getPointInCanvas(e);

    if (!this.isDrawing) return;
    e.preventDefault();

    switch (this.currentTool) {
      case 'brush':
      case 'eraser':
        this.currentBrushStroke.push(currentPoint);
        this.drawBrush(this.ctx, this.color, this.brushSize, currentPoint, this.startPoint, this.currentTool === 'eraser');
        this.startPoint = currentPoint;
        break;
      case 'rectangle':
      case 'circle':
      case 'line':
      case 'triangle':
      case 'arrow':
        if (this.snapshot) {
          this.ctx.putImageData(this.snapshot, 0, 0);
          this.drawShape(this.ctx, this.currentTool, this.startPoint!, currentPoint, this.color, this.brushSize, this.isFillEnabled);
        }
        break;
    }
  }

  private stopDrawing(e: MouseEvent | TouchEvent) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    const endPoint = this.getPointInCanvas(e);

    const action: DrawAction = {
        tool: this.currentTool,
        color: this.color,
        brushSize: this.brushSize,
        isFillEnabled: this.isFillEnabled,
        startPoint: this.startPoint!,
        endPoint: endPoint,
        points: (this.currentTool === 'brush' || this.currentTool === 'eraser') ? this.currentBrushStroke : undefined
    };

    // Finalize local drawing
    this.executeDrawAction(this.ctx, action);

    this.ctx.closePath();
    this.startPoint = null;
    this.snapshot = null;
    this.currentBrushStroke = [];
    this.saveState();
  }
  
  private handleKeyDown(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectionRect) {
        e.preventDefault();
        this.ctx.clearRect(this.selectionRect.x, this.selectionRect.y, this.selectionRect.width, this.selectionRect.height);
        this.clearSelection();
        this.saveState();
    }
  }

  private handleToolClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('.tool-btn');
      if (target && 'tool' in (target as HTMLElement).dataset) {
          this.currentTool = (target as HTMLElement).dataset.tool as Tool;
          if (this.currentTool !== 'select') {
              this.clearSelection();
          }
          this.updateUI();
      }
  }

  private handleColorPaletteClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' && target.dataset.color) {
          this.color = target.dataset.color;
          this.customColorPickerInput.value = this.color;
          this.updateUI();
      }
  }

  private handleColorPickerInput(e: Event) {
    this.color = (e.target as HTMLInputElement).value;
    this.updateUI();
  }

  private handleBrushSizeChange(e: Event) {
    this.brushSize = Number((e.target as HTMLInputElement).value);
    this.updateUI();
  }

  private handleFillChange(e: Event) {
    this.isFillEnabled = (e.target as HTMLInputElement).checked;
  }

  // Drawing logic
  private executeDrawAction(ctx: CanvasRenderingContext2D, action: DrawAction) {
      if (action.tool === 'brush' || action.tool === 'eraser') {
          if (action.points && action.points.length > 1) {
              for(let i=1; i < action.points.length; i++) {
                  this.drawBrush(ctx, action.color, action.brushSize, action.points[i], action.points[i-1], action.tool === 'eraser');
              }
          }
      } else {
          this.drawShape(ctx, action.tool, action.startPoint, action.endPoint, action.color, action.brushSize, action.isFillEnabled);
      }
  }

  private drawBrush(ctx: CanvasRenderingContext2D, color: string, brushSize: number, currentPoint: Point, prevPoint: Point | null, isEraser: boolean) {
    const startPoint = prevPoint ?? currentPoint;
    const effectiveColor = isEraser ? this.CANVAS_BG_COLOR : color;
    
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = effectiveColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
    ctx.closePath();
  }

  private drawShape(ctx: CanvasRenderingContext2D, tool: Tool, startPoint: Point, currentPoint: Point, color: string, brushSize: number, isFillEnabled: boolean) {
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    
    const fillableShapes: Tool[] = ['rectangle', 'circle', 'triangle'];
    const startX = startPoint.x;
    const startY = startPoint.y;
    const width = currentPoint.x - startX;
    const height = currentPoint.y - startY;

    switch (tool) {
      case 'rectangle':
        ctx.rect(startX, startY, width, height);
        break;
      case 'circle':
        const centerX = startX + width / 2;
        const centerY = startY + height / 2;
        const radius = Math.min(Math.abs(width), Math.abs(height)) / 2;
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        break;
      case 'triangle':
        ctx.moveTo(startX + width / 2, startY);
        ctx.lineTo(startX, startY + height);
        ctx.lineTo(startX + width, startY + height);
        ctx.closePath();
        break;
      case 'line':
        ctx.moveTo(startX, startY);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        break; 
      case 'arrow':
        this.drawArrow(ctx, startPoint, currentPoint, brushSize);
        break; 
    }
  
    if (isFillEnabled && fillableShapes.includes(tool)) {
      ctx.fill();
    }
    ctx.stroke();
  }
  
  private drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, brushSize: number) {
    const headlen = brushSize + 10;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
  }
  
  // Selection logic
  private clearSelection() { /* ... existing logic ... */ }
  // ... other selection methods ...


  // History management
  private saveState() {
    this.redoStack = []; 
    if (this.historyStack.length >= DrawingCanvasApp.MAX_HISTORY_SIZE) {
        this.historyStack.shift();
    }
    this.historyStack.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
    this.updateUndoRedoUI();
  }

  private undo() {
    if (this.historyStack.length > 1) {
        const currentState = this.historyStack.pop()!;
        this.redoStack.push(currentState);
        const prevState = this.historyStack[this.historyStack.length - 1];
        this.ctx.putImageData(prevState, 0, 0);
        this.updateUndoRedoUI();
    }
  }

  private redo() {
    if (this.redoStack.length > 0) {
        const nextState = this.redoStack.pop()!;
        this.historyStack.push(nextState);
        this.ctx.putImageData(nextState, 0, 0);
        this.updateUndoRedoUI();
    }
  }
  
  private clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.saveState();
  }

  private downloadImage() {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    
    tempCtx.fillStyle = this.CANVAS_BG_COLOR;
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    tempCtx.drawImage(this.canvas, 0, 0);
    
    const link = document.createElement('a');
    link.download = 'drawing.png';
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  }


  // UI update logic
  private updateUI() {
    this.brushSizeValue.textContent = `${this.brushSize} px`;
    
    // Update tool selection UI
    this.toolContainer.querySelectorAll('.tool-btn').forEach(btn => {
        const button = btn as HTMLButtonElement;
        const tool = button.dataset.tool;

        button.classList.remove('bg-gradient-to-br', 'from-purple-600', 'to-pink-500', 'text-white', 'shadow-lg');
        button.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
        button.style.background = ''; 

        if (tool === this.currentTool) {
            button.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
            button.classList.add('bg-gradient-to-br', 'from-purple-600', 'to-pink-500', 'text-white', 'shadow-lg');
        }
    });
    
    this.canvas.style.cursor = this.currentTool === 'select' ? 'default' : 'crosshair';

    // Update color palette UI
    this.colorPalette.querySelectorAll('button').forEach(btn => {
        btn.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
        if (btn.dataset.color === this.color) {
            btn.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
        }
    });

    this.customColorPickerLabel.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
    if (!PRESET_COLORS.includes(this.color)) {
         this.customColorPickerLabel.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
    }
    this.customColorPickerLabel.style.backgroundColor = this.color;


    const fillableShapes: Tool[] = ['rectangle', 'circle', 'triangle'];
    if (fillableShapes.includes(this.currentTool)) {
        this.fillShapeContainer.style.display = 'flex';
    } else {
        this.fillShapeContainer.style.display = 'none';
    }
    
    this.updateUndoRedoUI();
  }

  private updateUndoRedoUI() {
    this.undoBtn.disabled = this.historyStack.length <= 1;
    this.redoBtn.disabled = this.redoStack.length === 0;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DrawingCanvasApp();
});