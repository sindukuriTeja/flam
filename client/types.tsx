export interface Point {
  x: number;
  y: number;
}

export interface Draw {
  ctx: CanvasRenderingContext2D;
  currentPoint: Point;
  prevPoint: Point | null;
}

export interface SelectionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type Tool = 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'arrow' | 'select';

export interface DrawAction {
    tool: Tool;
    color: string;
    brushSize: number;
    isFillEnabled: boolean;
    startPoint: Point;
    endPoint: Point;
    // For brush strokes, we might need a series of points
    points?: Point[];
}
