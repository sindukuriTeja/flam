// Drawing state management for collaborative canvas
class DrawingStateManager {
  constructor() {
    // No persistent storage in this implementation
  }

  // Validate draw action
  validateDrawAction(action) {
    // Check required fields
    if (!action.tool || !action.timestamp) {
      return false;
    }
    
    // Check coordinate fields based on tool type
    if (action.tool === 'brush' || action.tool === 'eraser') {
      if (!action.points || !Array.isArray(action.points)) {
        return false;
      }
    } else {
      if (!action.startPoint || !action.endPoint) {
        return false;
      }
    }
    
    // Validate color format
    if (action.color && !this.isValidColor(action.color)) {
      return false;
    }
    
    // Validate brush size
    if (action.brushSize && (action.brushSize < 1 || action.brushSize > 100)) {
      return false;
    }
    
    return true;
  }

  // Validate color format (hex or named colors)
  isValidColor(color) {
    if (typeof color !== 'string') return false;
    
    // Hex color regex (#RRGGBB or #RGB)
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexRegex.test(color);
  }

  // Normalize draw action
  normalizeDrawAction(action, userId, userName) {
    // Add user info to action
    const normalizedAction = {
      ...action,
      userId: userId,
      userName: userName,
      timestamp: action.timestamp || Date.now()
    };
    
    // Ensure consistent data types
    if (normalizedAction.brushSize) {
      normalizedAction.brushSize = Number(normalizedAction.brushSize);
    }
    
    // Validate points array for brush/eraser tools
    if ((normalizedAction.tool === 'brush' || normalizedAction.tool === 'eraser') && 
        normalizedAction.points) {
      normalizedAction.points = normalizedAction.points.map(point => ({
        x: Number(point.x),
        y: Number(point.y)
      }));
    }
    
    // Validate coordinates for shape tools
    if (normalizedAction.startPoint) {
      normalizedAction.startPoint = {
        x: Number(normalizedAction.startPoint.x),
        y: Number(normalizedAction.startPoint.y)
      };
    }
    
    if (normalizedAction.endPoint) {
      normalizedAction.endPoint = {
        x: Number(normalizedAction.endPoint.x),
        y: Number(normalizedAction.endPoint.y)
      };
    }
    
    return normalizedAction;
  }

  // Create cursor position data
  createCursorPositionData(user, x, y) {
    return {
      x: Number(x),
      y: Number(y),
      userId: user.id,
      userName: user.name,
      color: user.color
    };
  }

  // Validate cursor position
  validateCursorPosition(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return false;
    if (!data.userId || !data.userName || !data.color) return false;
    return true;
  }

  // Create room info data
  createRoomInfoData(roomId) {
    return {
      roomId: roomId
    };
  }

  // Create user info data
  createUserInfoData(user) {
    return {
      id: user.id,
      name: user.name,
      color: user.color
    };
  }

  // Create undo/redo state data
  createUndoRedoStateData(canUndo, canRedo) {
    return {
      canUndo: Boolean(canUndo),
      canRedo: Boolean(canRedo)
    };
  }

  // Create users list data
  createUsersListData(users) {
    return users.map(user => ({
      id: user.id,
      name: user.name,
      color: user.color,
      joinedAt: user.joinedAt
    }));
  }

  // Create sync history data
  createSyncHistoryData(history) {
    // Return a copy of the history to prevent external modifications
    return [...history];
  }

  // Create canvas state data
  createCanvasStateData(state) {
    // In a real implementation, this might serialize the canvas data
    return state;
  }

  // Merge canvas states (if needed for conflict resolution)
  mergeCanvasStates(state1, state2) {
    // Simple implementation - in a real app, this might do more sophisticated merging
    // For now, we'll prefer the more recent state
    return state2 || state1;
  }
}

// Export drawing state manager
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DrawingStateManager;
}