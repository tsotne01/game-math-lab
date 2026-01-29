import { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Eye, EyeOff, 
  Grid3X3, Footprints, ChevronRight, ChevronLeft,
  Zap, Heart, Target, Map as MapIcon, StepForward, Square
} from 'lucide-react';

// ============ TYPES ============
interface Vec2 {
  x: number;
  y: number;
}

interface GridNode {
  x: number;
  y: number;
  g: number;      // Cost from start
  h: number;      // Heuristic (estimated cost to goal)
  f: number;      // Total cost (g + h)
  parent: GridNode | null;
  walkable: boolean;
  weight: number; // For weighted pathfinding
}

interface Entity {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
  targetX: number;
  targetY: number;
  path: Vec2[];
  pathIndex: number;
  speed: number;
  color: string;
  health: number;
  maxHealth: number;
  lastPathTime: number;
}

type HeuristicType = 'manhattan' | 'euclidean' | 'chebyshev';

// ============ CONSTANTS ============
const CELL_SIZE = 24;
const GRID_COLS = 25;
const GRID_ROWS = 18;
const CANVAS_WIDTH = GRID_COLS * CELL_SIZE;
const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE;

// Colors matching the arcade theme
const COLORS = {
  background: '#0a0a0f',
  grid: '#1a1a24',
  gridLine: '#2a2a3a',
  wall: '#4a4a5a',
  wallHighlight: '#5a5a6a',
  player: '#00b894',
  playerGlow: 'rgba(0, 184, 148, 0.3)',
  enemy: '#e17055',
  enemyGlow: 'rgba(225, 112, 85, 0.3)',
  goal: '#fdcb6e',
  goalGlow: 'rgba(253, 203, 110, 0.3)',
  path: '#6c5ce7',
  pathGlow: 'rgba(108, 92, 231, 0.5)',
  openSet: 'rgba(116, 185, 255, 0.4)',
  closedSet: 'rgba(99, 110, 114, 0.3)',
  frontier: 'rgba(253, 203, 110, 0.5)',
  accent: '#6c5ce7',
  text: '#ffffff',
  textSecondary: '#a0a0b0',
};

// ============ PATHFINDING ALGORITHMS ============

// Priority Queue for efficient pathfinding
class PriorityQueue<T> {
  private items: { item: T; priority: number }[] = [];

  enqueue(item: T, priority: number) {
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  contains(item: T, compareFn: (a: T, b: T) => boolean): boolean {
    return this.items.some(i => compareFn(i.item, item));
  }

  updatePriority(item: T, priority: number, compareFn: (a: T, b: T) => boolean) {
    const index = this.items.findIndex(i => compareFn(i.item, item));
    if (index !== -1) {
      this.items[index].priority = priority;
      this.items.sort((a, b) => a.priority - b.priority);
    }
  }
}

// Heuristic functions
function manhattanDistance(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function euclideanDistance(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function chebyshevDistance(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function getHeuristic(type: HeuristicType): (a: Vec2, b: Vec2) => number {
  switch (type) {
    case 'manhattan': return manhattanDistance;
    case 'euclidean': return euclideanDistance;
    case 'chebyshev': return chebyshevDistance;
  }
}

// A* Pathfinding
function aStarPath(
  grid: boolean[][],
  start: Vec2,
  goal: Vec2,
  heuristic: (a: Vec2, b: Vec2) => number,
  weights?: number[][]
): { path: Vec2[], openSet: Vec2[], closedSet: Vec2[] } {
  const cols = grid[0].length;
  const rows = grid.length;
  
  const openSet = new PriorityQueue<GridNode>();
  const openSetArray: Vec2[] = [];
  const closedSet: Vec2[] = [];
  const nodeMap: Map<string, GridNode> = new Map();
  
  const key = (x: number, y: number) => `${x},${y}`;
  
  const startNode: GridNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, goal),
    f: heuristic(start, goal),
    parent: null,
    walkable: true,
    weight: 1,
  };
  
  openSet.enqueue(startNode, startNode.f);
  nodeMap.set(key(start.x, start.y), startNode);
  openSetArray.push(start);
  
  const neighbors = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
    { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
  ];
  
  while (!openSet.isEmpty()) {
    const current = openSet.dequeue()!;
    
    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct path
      const path: Vec2[] = [];
      let node: GridNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return { path, openSet: openSetArray, closedSet };
    }
    
    closedSet.push({ x: current.x, y: current.y });
    
    for (const neighbor of neighbors) {
      const nx = current.x + neighbor.x;
      const ny = current.y + neighbor.y;
      
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (grid[ny][nx]) continue; // Wall
      
      const nKey = key(nx, ny);
      if (closedSet.some(c => c.x === nx && c.y === ny)) continue;
      
      // Diagonal movement cost
      const isDiagonal = neighbor.x !== 0 && neighbor.y !== 0;
      const moveCost = isDiagonal ? 1.414 : 1;
      const weight = weights ? weights[ny][nx] : 1;
      const tentativeG = current.g + moveCost * weight;
      
      let neighborNode = nodeMap.get(nKey);
      
      if (!neighborNode) {
        neighborNode = {
          x: nx,
          y: ny,
          g: Infinity,
          h: heuristic({ x: nx, y: ny }, goal),
          f: Infinity,
          parent: null,
          walkable: true,
          weight: weight,
        };
        nodeMap.set(nKey, neighborNode);
      }
      
      if (tentativeG < neighborNode.g) {
        neighborNode.parent = current;
        neighborNode.g = tentativeG;
        neighborNode.f = tentativeG + neighborNode.h;
        
        if (!openSetArray.some(o => o.x === nx && o.y === ny)) {
          openSet.enqueue(neighborNode, neighborNode.f);
          openSetArray.push({ x: nx, y: ny });
        } else {
          openSet.updatePriority(neighborNode, neighborNode.f, 
            (a, b) => a.x === b.x && a.y === b.y);
        }
      }
    }
  }
  
  return { path: [], openSet: openSetArray, closedSet };
}

// BFS Pathfinding (for visualization)
function bfsPath(
  grid: boolean[][],
  start: Vec2,
  goal: Vec2
): { path: Vec2[], frontier: Vec2[], visited: Vec2[] } {
  const cols = grid[0].length;
  const rows = grid.length;
  
  const queue: GridNode[] = [];
  const visited: Vec2[] = [];
  const frontier: Vec2[] = [];
  const nodeMap: Map<string, GridNode> = new Map();
  
  const key = (x: number, y: number) => `${x},${y}`;
  
  const startNode: GridNode = {
    x: start.x, y: start.y, g: 0, h: 0, f: 0, parent: null, walkable: true, weight: 1
  };
  
  queue.push(startNode);
  nodeMap.set(key(start.x, start.y), startNode);
  frontier.push(start);
  
  const neighbors = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited.push({ x: current.x, y: current.y });
    
    if (current.x === goal.x && current.y === goal.y) {
      const path: Vec2[] = [];
      let node: GridNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return { path, frontier, visited };
    }
    
    for (const neighbor of neighbors) {
      const nx = current.x + neighbor.x;
      const ny = current.y + neighbor.y;
      
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (grid[ny][nx]) continue;
      
      const nKey = key(nx, ny);
      if (nodeMap.has(nKey)) continue;
      
      const neighborNode: GridNode = {
        x: nx, y: ny, g: current.g + 1, h: 0, f: 0, 
        parent: current, walkable: true, weight: 1
      };
      
      nodeMap.set(nKey, neighborNode);
      queue.push(neighborNode);
      frontier.push({ x: nx, y: ny });
    }
  }
  
  return { path: [], frontier, visited };
}

// Dijkstra's Algorithm (for weighted graphs)
function dijkstraPath(
  grid: boolean[][],
  start: Vec2,
  goal: Vec2,
  weights: number[][]
): { path: Vec2[], frontier: Vec2[], visited: Vec2[] } {
  const cols = grid[0].length;
  const rows = grid.length;
  
  const openSet = new PriorityQueue<GridNode>();
  const visited: Vec2[] = [];
  const frontier: Vec2[] = [];
  const nodeMap: Map<string, GridNode> = new Map();
  
  const key = (x: number, y: number) => `${x},${y}`;
  
  const startNode: GridNode = {
    x: start.x, y: start.y, g: 0, h: 0, f: 0, parent: null, walkable: true, weight: 1
  };
  
  openSet.enqueue(startNode, 0);
  nodeMap.set(key(start.x, start.y), startNode);
  frontier.push(start);
  
  const neighbors = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
    { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
  ];
  
  while (!openSet.isEmpty()) {
    const current = openSet.dequeue()!;
    
    if (visited.some(v => v.x === current.x && v.y === current.y)) continue;
    visited.push({ x: current.x, y: current.y });
    
    if (current.x === goal.x && current.y === goal.y) {
      const path: Vec2[] = [];
      let node: GridNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return { path, frontier, visited };
    }
    
    for (const neighbor of neighbors) {
      const nx = current.x + neighbor.x;
      const ny = current.y + neighbor.y;
      
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (grid[ny][nx]) continue;
      
      const nKey = key(nx, ny);
      if (visited.some(v => v.x === nx && v.y === ny)) continue;
      
      const isDiagonal = neighbor.x !== 0 && neighbor.y !== 0;
      const moveCost = isDiagonal ? 1.414 : 1;
      const weight = weights[ny][nx];
      const tentativeG = current.g + moveCost * weight;
      
      let neighborNode = nodeMap.get(nKey);
      
      if (!neighborNode || tentativeG < neighborNode.g) {
        neighborNode = {
          x: nx, y: ny, g: tentativeG, h: 0, f: tentativeG,
          parent: current, walkable: true, weight: weight
        };
        nodeMap.set(nKey, neighborNode);
        openSet.enqueue(neighborNode, tentativeG);
        if (!frontier.some(f => f.x === nx && f.y === ny)) {
          frontier.push({ x: nx, y: ny });
        }
      }
    }
  }
  
  return { path: [], frontier, visited };
}

// Path smoothing using line-of-sight
function smoothPath(path: Vec2[], grid: boolean[][]): Vec2[] {
  if (path.length <= 2) return path;
  
  const smoothed: Vec2[] = [path[0]];
  let current = 0;
  
  while (current < path.length - 1) {
    let furthest = current + 1;
    
    for (let i = path.length - 1; i > current + 1; i--) {
      if (hasLineOfSight(path[current], path[i], grid)) {
        furthest = i;
        break;
      }
    }
    
    smoothed.push(path[furthest]);
    current = furthest;
  }
  
  return smoothed;
}

function hasLineOfSight(a: Vec2, b: Vec2, grid: boolean[][]): boolean {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  let x = a.x;
  let y = a.y;
  
  while (x !== b.x || y !== b.y) {
    if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
      if (grid[y][x]) return false;
    }
    
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  
  return true;
}

// ============ DUNGEON CRAWLER GAME ============
export default function DungeonCrawler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'victory' | 'defeat'>('idle');
  const [showPathfinding, setShowPathfinding] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [damageFlash, setDamageFlash] = useState(false);
  
  const gameRef = useRef<{
    player: Entity;
    enemies: Entity[];
    goal: Vec2;
    grid: boolean[][];
    running: boolean;
    keys: Set<string>;
    lastDamageTime: number;
    spawnTime: number;
  } | null>(null);
  
  // Touch control handler
  const handleTouchControl = useCallback((direction: string, isPressed: boolean) => {
    if (!gameRef.current) return;
    if (isPressed) {
      gameRef.current.keys.add(direction);
    } else {
      gameRef.current.keys.delete(direction);
    }
  }, []);

  // Create initial dungeon layout
  const createDungeon = useCallback((levelNum: number): boolean[][] => {
    const grid: boolean[][] = Array(GRID_ROWS).fill(null)
      .map(() => Array(GRID_COLS).fill(false));
    
    // Border walls
    for (let x = 0; x < GRID_COLS; x++) {
      grid[0][x] = true;
      grid[GRID_ROWS - 1][x] = true;
    }
    for (let y = 0; y < GRID_ROWS; y++) {
      grid[y][0] = true;
      grid[y][GRID_COLS - 1] = true;
    }
    
    // Add some internal walls based on level
    const wallPatterns = [
      // Level 1: Simple corridors
      () => {
        for (let y = 3; y < 8; y++) grid[y][8] = true;
        for (let y = 10; y < 15; y++) grid[y][8] = true;
        for (let y = 3; y < 8; y++) grid[y][16] = true;
        for (let y = 10; y < 15; y++) grid[y][16] = true;
      },
      // Level 2: Rooms
      () => {
        for (let x = 5; x < 10; x++) { grid[4][x] = true; grid[8][x] = true; }
        for (let y = 4; y < 9; y++) { grid[y][5] = true; grid[y][10] = true; }
        grid[6][5] = false; grid[6][10] = false;
        for (let x = 15; x < 20; x++) { grid[10][x] = true; grid[14][x] = true; }
        for (let y = 10; y < 15; y++) { grid[y][15] = true; grid[y][20] = true; }
        grid[12][15] = false; grid[12][20] = false;
      },
      // Level 3: Maze-like
      () => {
        for (let i = 0; i < 15; i++) {
          const x = Math.floor(Math.random() * (GRID_COLS - 4)) + 2;
          const y = Math.floor(Math.random() * (GRID_ROWS - 4)) + 2;
          const horizontal = Math.random() > 0.5;
          const len = Math.floor(Math.random() * 5) + 3;
          for (let j = 0; j < len; j++) {
            const wx = horizontal ? x + j : x;
            const wy = horizontal ? y : y + j;
            if (wx > 0 && wx < GRID_COLS - 1 && wy > 0 && wy < GRID_ROWS - 1) {
              grid[wy][wx] = true;
            }
          }
        }
      },
    ];
    
    wallPatterns[(levelNum - 1) % wallPatterns.length]();
    
    // Ensure start and goal are clear
    grid[2][2] = false;
    grid[GRID_ROWS - 3][GRID_COLS - 3] = false;
    
    return grid;
  }, []);

  const createPlayer = useCallback((): Entity => ({
    x: 2 * CELL_SIZE + CELL_SIZE / 2,
    y: 2 * CELL_SIZE + CELL_SIZE / 2,
    gridX: 2,
    gridY: 2,
    targetX: 2 * CELL_SIZE + CELL_SIZE / 2,
    targetY: 2 * CELL_SIZE + CELL_SIZE / 2,
    path: [],
    pathIndex: 0,
    speed: 3,
    color: COLORS.player,
    health: 100,
    maxHealth: 100,
    lastPathTime: 0,
  }), []);

  const createEnemy = useCallback((x: number, y: number, speed: number, health: number): Entity => ({
    x: x * CELL_SIZE + CELL_SIZE / 2,
    y: y * CELL_SIZE + CELL_SIZE / 2,
    gridX: x,
    gridY: y,
    targetX: x * CELL_SIZE + CELL_SIZE / 2,
    targetY: y * CELL_SIZE + CELL_SIZE / 2,
    path: [],
    pathIndex: 0,
    speed,
    color: COLORS.enemy,
    health,
    maxHealth: health,
    lastPathTime: 0,
  }), []);

  const initGame = useCallback(() => {
    const grid = createDungeon(level);
    const numEnemies = Math.min(level + 1, 5);
    const enemies: Entity[] = [];
    
    // Spawn enemies at random valid positions
    const validSpawns: Vec2[] = [];
    for (let y = 5; y < GRID_ROWS - 2; y++) {
      for (let x = 5; x < GRID_COLS - 2; x++) {
        if (!grid[y][x]) validSpawns.push({ x, y });
      }
    }
    
    for (let i = 0; i < numEnemies && validSpawns.length > 0; i++) {
      const idx = Math.floor(Math.random() * validSpawns.length);
      const spawn = validSpawns.splice(idx, 1)[0];
      const speed = 1 + Math.random() * 0.5 + level * 0.2;
      const health = 50 + level * 10;
      enemies.push(createEnemy(spawn.x, spawn.y, speed, health));
    }
    
    gameRef.current = {
      player: createPlayer(),
      enemies,
      goal: { x: GRID_COLS - 3, y: GRID_ROWS - 3 },
      grid,
      running: false,
      keys: new Set(),
      lastDamageTime: 0,
      spawnTime: 0,
    };
    
    setPlayerHealth(100);
  }, [level, createDungeon, createPlayer, createEnemy]);

  const startGame = useCallback(() => {
    initGame();
    if (gameRef.current) {
      gameRef.current.running = true;
    }
    setGameState('playing');
    setIsPaused(false);
  }, [initGame]);

  const resetGame = useCallback(() => {
    setLevel(1);
    setScore(0);
    startGame();
  }, [startGame]);

  const nextLevel = useCallback(() => {
    setLevel(l => l + 1);
    setScore(s => s + 100);
    startGame();
  }, [startGame]);

  // Key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
        gameRef.current?.keys.add(e.key.toLowerCase());
      }
      if (e.key === ' ' && gameState === 'playing') {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      gameRef.current?.keys.delete(e.key.toLowerCase());
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Game loop
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let animationId: number;
    let frameCount = 0;
    
    initGame();
    
    const gameLoop = () => {
      const game = gameRef.current;
      if (!game) return;
      
      // Clear canvas
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Draw grid
      if (showGrid) {
        ctx.strokeStyle = COLORS.gridLine;
        ctx.lineWidth = 1;
        for (let x = 0; x <= GRID_COLS; x++) {
          ctx.beginPath();
          ctx.moveTo(x * CELL_SIZE, 0);
          ctx.lineTo(x * CELL_SIZE, CANVAS_HEIGHT);
          ctx.stroke();
        }
        for (let y = 0; y <= GRID_ROWS; y++) {
          ctx.beginPath();
          ctx.moveTo(0, y * CELL_SIZE);
          ctx.lineTo(CANVAS_WIDTH, y * CELL_SIZE);
          ctx.stroke();
        }
      }
      
      // Draw walls
      for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          if (game.grid[y][x]) {
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            // Highlight
            ctx.fillStyle = COLORS.wallHighlight;
            ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, 3);
          }
        }
      }
      
      // Update and draw if playing
      if (game.running && !isPaused && gameState === 'playing') {
        frameCount++;
        
        // Update player position based on keys
        const { player, keys, grid } = game;
        let dx = 0, dy = 0;
        
        if (keys.has('arrowup') || keys.has('w')) dy = -1;
        if (keys.has('arrowdown') || keys.has('s')) dy = 1;
        if (keys.has('arrowleft') || keys.has('a')) dx = -1;
        if (keys.has('arrowright') || keys.has('d')) dx = 1;
        
        if (dx !== 0 || dy !== 0) {
          // Normalize diagonal movement
          const len = Math.sqrt(dx * dx + dy * dy);
          dx = (dx / len) * player.speed;
          dy = (dy / len) * player.speed;
          
          const newX = player.x + dx;
          const newY = player.y + dy;
          
          // Check collision with walls
          const newGridX = Math.floor(newX / CELL_SIZE);
          const newGridY = Math.floor(newY / CELL_SIZE);
          
          if (!grid[newGridY]?.[Math.floor((newX + 8) / CELL_SIZE)] && 
              !grid[newGridY]?.[Math.floor((newX - 8) / CELL_SIZE)]) {
            player.x = Math.max(10, Math.min(CANVAS_WIDTH - 10, newX));
          }
          if (!grid[Math.floor((newY + 8) / CELL_SIZE)]?.[newGridX] && 
              !grid[Math.floor((newY - 8) / CELL_SIZE)]?.[newGridX]) {
            player.y = Math.max(10, Math.min(CANVAS_HEIGHT - 10, newY));
          }
          
          player.gridX = Math.floor(player.x / CELL_SIZE);
          player.gridY = Math.floor(player.y / CELL_SIZE);
        }
        
        // Update enemies pathfinding
        for (const enemy of game.enemies) {
          if (frameCount - enemy.lastPathTime > 30 || enemy.path.length === 0) {
            const result = aStarPath(
              grid,
              { x: Math.floor(enemy.x / CELL_SIZE), y: Math.floor(enemy.y / CELL_SIZE) },
              { x: player.gridX, y: player.gridY },
              manhattanDistance
            );
            enemy.path = result.path;
            enemy.pathIndex = 0;
            enemy.lastPathTime = frameCount;
          }
          
          // Move enemy along path
          if (enemy.path.length > 1 && enemy.pathIndex < enemy.path.length) {
            const targetCell = enemy.path[Math.min(enemy.pathIndex + 1, enemy.path.length - 1)];
            const targetX = targetCell.x * CELL_SIZE + CELL_SIZE / 2;
            const targetY = targetCell.y * CELL_SIZE + CELL_SIZE / 2;
            
            const edx = targetX - enemy.x;
            const edy = targetY - enemy.y;
            const dist = Math.sqrt(edx * edx + edy * edy);
            
            if (dist > 2) {
              enemy.x += (edx / dist) * enemy.speed;
              enemy.y += (edy / dist) * enemy.speed;
            } else if (enemy.pathIndex < enemy.path.length - 1) {
              enemy.pathIndex++;
            }
            
            enemy.gridX = Math.floor(enemy.x / CELL_SIZE);
            enemy.gridY = Math.floor(enemy.y / CELL_SIZE);
          }
          
          // Check collision with player
          const playerDist = Math.sqrt(
            (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2
          );
          
          if (playerDist < 15 && frameCount - game.lastDamageTime > 60) {
            player.health -= 20;
            game.lastDamageTime = frameCount;
            setPlayerHealth(player.health);
            
            // Trigger damage flash effect
            setDamageFlash(true);
            setTimeout(() => setDamageFlash(false), 150);
            
            if (player.health <= 0) {
              game.running = false;
              setGameState('defeat');
            }
          }
        }
        
        // Check goal reached
        const goalDist = Math.sqrt(
          (player.x - (game.goal.x * CELL_SIZE + CELL_SIZE / 2)) ** 2 +
          (player.y - (game.goal.y * CELL_SIZE + CELL_SIZE / 2)) ** 2
        );
        
        if (goalDist < 20) {
          game.running = false;
          setGameState('victory');
        }
      }
      
      // Draw pathfinding visualization
      if (showPathfinding && game.enemies.length > 0) {
        const enemy = game.enemies[0];
        const result = aStarPath(
          game.grid,
          { x: enemy.gridX, y: enemy.gridY },
          { x: game.player.gridX, y: game.player.gridY },
          manhattanDistance
        );
        
        // Draw closed set
        ctx.fillStyle = COLORS.closedSet;
        for (const cell of result.closedSet) {
          ctx.fillRect(
            cell.x * CELL_SIZE + 2,
            cell.y * CELL_SIZE + 2,
            CELL_SIZE - 4,
            CELL_SIZE - 4
          );
        }
        
        // Draw open set
        ctx.fillStyle = COLORS.openSet;
        for (const cell of result.openSet) {
          ctx.fillRect(
            cell.x * CELL_SIZE + 2,
            cell.y * CELL_SIZE + 2,
            CELL_SIZE - 4,
            CELL_SIZE - 4
          );
        }
        
        // Draw path
        if (result.path.length > 1) {
          ctx.strokeStyle = COLORS.path;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(
            result.path[0].x * CELL_SIZE + CELL_SIZE / 2,
            result.path[0].y * CELL_SIZE + CELL_SIZE / 2
          );
          for (let i = 1; i < result.path.length; i++) {
            ctx.lineTo(
              result.path[i].x * CELL_SIZE + CELL_SIZE / 2,
              result.path[i].y * CELL_SIZE + CELL_SIZE / 2
            );
          }
          ctx.stroke();
        }
      }
      
      // Draw goal
      ctx.fillStyle = COLORS.goalGlow;
      ctx.beginPath();
      ctx.arc(
        game.goal.x * CELL_SIZE + CELL_SIZE / 2,
        game.goal.y * CELL_SIZE + CELL_SIZE / 2,
        16,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.fillStyle = COLORS.goal;
      ctx.beginPath();
      ctx.arc(
        game.goal.x * CELL_SIZE + CELL_SIZE / 2,
        game.goal.y * CELL_SIZE + CELL_SIZE / 2,
        10,
        0,
        Math.PI * 2
      );
      ctx.fill();
      
      // Draw enemies with spawn indicators
      for (const enemy of game.enemies) {
        // Spawn indicator (pulsing warning circle) - shown for first 90 frames
        if (game.spawnTime < 90) {
          const pulse = Math.sin(game.spawnTime * 0.2) * 0.3 + 0.5;
          ctx.strokeStyle = `rgba(225, 112, 85, ${pulse})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, 20 + pulse * 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        
        ctx.fillStyle = COLORS.enemyGlow;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Enemy health bar
        const healthPercent = enemy.health / enemy.maxHealth;
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(enemy.x - 12, enemy.y - 18, 24, 4);
        ctx.fillStyle = '#e17055';
        ctx.fillRect(enemy.x - 12, enemy.y - 18, 24 * healthPercent, 4);
      }
      
      // Update spawn time
      if (game.running && game.spawnTime < 120) {
        game.spawnTime++;
      }
      
      // Draw player
      const { player } = game;
      ctx.fillStyle = COLORS.playerGlow;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 10, 0, Math.PI * 2);
      ctx.fill();
      
      // Pause overlay
      if (isPaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.font = '14px monospace';
        ctx.fillStyle = '#a0a0b0';
        ctx.fillText('Press SPACE to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
      }
      
      animationId = requestAnimationFrame(gameLoop);
    };
    
    gameLoop();
    return () => cancelAnimationFrame(animationId);
  }, [initGame, showPathfinding, showGrid, isPaused, gameState]);

  return (
    <div className="bg-[#12121a] rounded-2xl border border-[#2a2a3a] overflow-hidden">
      {/* Header */}
      <div className="bg-[#0a0a0f] px-4 py-3 border-b border-[#2a2a3a] flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-[#e17055]" />
            <div className="w-24 h-3 bg-[#2a2a3a] rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#e17055] transition-all duration-300"
                style={{ width: `${playerHealth}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[#fdcb6e]">
            <Target className="w-5 h-5" />
            <span className="font-mono">{score}</span>
          </div>
          <div className="flex items-center gap-2 text-[#6c5ce7]">
            <MapIcon className="w-5 h-5" aria-hidden="true" />
            <span className="font-mono">Level {level}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPathfinding(!showPathfinding)}
            className={`p-2 rounded-lg transition-colors ${
              showPathfinding 
                ? 'bg-[#6c5ce7]/20 text-[#6c5ce7]' 
                : 'bg-[#2a2a3a] text-[#6a6a7a]'
            }`}
            title="Toggle pathfinding visualization"
            aria-label={showPathfinding ? 'Hide pathfinding visualization' : 'Show pathfinding visualization'}
            aria-pressed={showPathfinding}
          >
            <Footprints className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded-lg transition-colors ${
              showGrid 
                ? 'bg-[#6c5ce7]/20 text-[#6c5ce7]' 
                : 'bg-[#2a2a3a] text-[#6a6a7a]'
            }`}
            title="Toggle grid"
            aria-label={showGrid ? 'Hide grid' : 'Show grid'}
            aria-pressed={showGrid}
          >
            <Grid3X3 className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      
      {/* Game Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full"
          style={{ aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
          role="img"
          aria-label="Dungeon Crawler game canvas - use WASD or arrow keys to move the player"
        />
        
        {/* Damage Flash Overlay */}
        {damageFlash && (
          <div 
            className="absolute inset-0 bg-red-500/30 pointer-events-none animate-pulse"
            aria-hidden="true"
          />
        )}
        
        {/* Overlays */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white mb-4">Dungeon Crawler</h3>
              <p className="text-[#a0a0b0] mb-6">
                Reach the goal while avoiding enemies!<br/>
                Watch how they pathfind using A*
              </p>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-[#6c5ce7] text-white rounded-xl font-semibold hover:bg-[#5b4cdb] transition-colors flex items-center gap-2 mx-auto"
              >
                <Play className="w-5 h-5" /> Start Game
              </button>
            </div>
          </div>
        )}
        
        {gameState === 'victory' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-[#00b894] mb-4">Level Complete!</h3>
              <p className="text-[#a0a0b0] mb-6">Score: {score + 100}</p>
              <button
                onClick={nextLevel}
                className="px-6 py-3 bg-[#00b894] text-white rounded-xl font-semibold hover:bg-[#00a085] transition-colors flex items-center gap-2 mx-auto"
              >
                <ChevronRight className="w-5 h-5" /> Next Level
              </button>
            </div>
          </div>
        )}
        
        {gameState === 'defeat' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-[#e17055] mb-4">Game Over</h3>
              <p className="text-[#a0a0b0] mb-6">Final Score: {score}</p>
              <button
                onClick={resetGame}
                className="px-6 py-3 bg-[#e17055] text-white rounded-xl font-semibold hover:bg-[#d45d43] transition-colors flex items-center gap-2 mx-auto"
              >
                <RotateCcw className="w-5 h-5" /> Try Again
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Touch Controls for Mobile */}
      {gameState === 'playing' && !isPaused && (
        <div className="md:hidden p-4 bg-[#0a0a0f] border-t border-[#2a2a3a]">
          <div className="flex justify-center items-center gap-2">
            <div className="grid grid-cols-3 gap-1">
              <div />
              <button
                className="w-12 h-12 bg-[#2a2a3a] rounded-lg flex items-center justify-center text-white active:bg-[#6c5ce7] touch-none select-none"
                onTouchStart={() => handleTouchControl('w', true)}
                onTouchEnd={() => handleTouchControl('w', false)}
                onMouseDown={() => handleTouchControl('w', true)}
                onMouseUp={() => handleTouchControl('w', false)}
                onMouseLeave={() => handleTouchControl('w', false)}
                aria-label="Move up"
              >
                ▲
              </button>
              <div />
              <button
                className="w-12 h-12 bg-[#2a2a3a] rounded-lg flex items-center justify-center text-white active:bg-[#6c5ce7] touch-none select-none"
                onTouchStart={() => handleTouchControl('a', true)}
                onTouchEnd={() => handleTouchControl('a', false)}
                onMouseDown={() => handleTouchControl('a', true)}
                onMouseUp={() => handleTouchControl('a', false)}
                onMouseLeave={() => handleTouchControl('a', false)}
                aria-label="Move left"
              >
                ◀
              </button>
              <button
                className="w-12 h-12 bg-[#2a2a3a] rounded-lg flex items-center justify-center text-white active:bg-[#6c5ce7] touch-none select-none"
                onTouchStart={() => handleTouchControl('s', true)}
                onTouchEnd={() => handleTouchControl('s', false)}
                onMouseDown={() => handleTouchControl('s', true)}
                onMouseUp={() => handleTouchControl('s', false)}
                onMouseLeave={() => handleTouchControl('s', false)}
                aria-label="Move down"
              >
                ▼
              </button>
              <button
                className="w-12 h-12 bg-[#2a2a3a] rounded-lg flex items-center justify-center text-white active:bg-[#6c5ce7] touch-none select-none"
                onTouchStart={() => handleTouchControl('d', true)}
                onTouchEnd={() => handleTouchControl('d', false)}
                onMouseDown={() => handleTouchControl('d', true)}
                onMouseUp={() => handleTouchControl('d', false)}
                onMouseLeave={() => handleTouchControl('d', false)}
                aria-label="Move right"
              >
                ▶
              </button>
            </div>
            <button
              onClick={() => setIsPaused(true)}
              className="ml-4 w-12 h-12 bg-[#2a2a3a] rounded-lg flex items-center justify-center text-white active:bg-[#6c5ce7]"
              aria-label="Pause game"
            >
              <Pause className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      
      {/* Controls Info */}
      <div className="p-4 bg-[#0a0a0f] border-t border-[#2a2a3a]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-[#6a6a7a]">
            <span className="text-[#a0a0b0]">Controls:</span>{' '}
            <span className="hidden md:inline">WASD or Arrow keys to move • SPACE to pause</span>
            <span className="md:hidden">Use buttons above to move</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-full bg-[#74b9ff]/60" aria-hidden="true" /> 
            <span>Open Set</span>
            <span className="inline-block w-3 h-3 rounded-full bg-[#636e72]/60 ml-2" aria-hidden="true" /> 
            <span>Closed Set</span>
            <span className="inline-block w-3 h-3 rounded bg-[#6c5ce7] ml-2" aria-hidden="true" /> 
            <span>Path</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ BFS VISUALIZER ============
export function BFSVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [path, setPath] = useState<Vec2[]>([]);
  const [visited, setVisited] = useState<Vec2[]>([]);
  const [frontier, setFrontier] = useState<Vec2[]>([]);
  const [start] = useState<Vec2>({ x: 2, y: 5 });
  const [goal] = useState<Vec2>({ x: 17, y: 5 });
  const [isDrawing, setIsDrawing] = useState(false);
  
  const COLS = 20;
  const ROWS = 11;
  const CELL = 28;
  
  useEffect(() => {
    const initialGrid: boolean[][] = Array(ROWS).fill(null)
      .map(() => Array(COLS).fill(false));
    // Add some walls
    for (let y = 2; y < 9; y++) initialGrid[y][10] = true;
    initialGrid[2][10] = false;
    initialGrid[8][10] = false;
    setGrid(initialGrid);
  }, []);
  
  const runBFS = useCallback(() => {
    if (grid.length === 0) return;
    const result = bfsPath(grid, start, goal);
    setPath(result.path);
    setVisited(result.visited);
    setFrontier(result.frontier);
    setStep(0);
    setIsRunning(true);
  }, [grid, start, goal]);
  
  const stepForward = useCallback(() => {
    setStep(s => Math.min(s + 1, visited.length));
  }, [visited.length]);
  
  const reset = useCallback(() => {
    setIsRunning(false);
    setStep(0);
    setPath([]);
    setVisited([]);
    setFrontier([]);
  }, []);
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x === start.x && y === start.y) return;
    if (x === goal.x && y === goal.y) return;
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      setIsDrawing(true);
      setGrid(g => {
        const newGrid = g.map(row => [...row]);
        newGrid[y][x] = !newGrid[y][x];
        return newGrid;
      });
      reset();
    }
  }, [start, goal, reset]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x === start.x && y === start.y) return;
    if (x === goal.x && y === goal.y) return;
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      setGrid(g => {
        const newGrid = g.map(row => [...row]);
        newGrid[y][x] = true;
        return newGrid;
      });
    }
  }, [isDrawing, start, goal]);
  
  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);
  
  // Auto-step when running
  useEffect(() => {
    if (!isRunning || step >= visited.length) return;
    const timer = setTimeout(() => setStep(s => s + 1), 50);
    return () => clearTimeout(timer);
  }, [isRunning, step, visited.length]);
  
  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    
    // Grid lines
    ctx.strokeStyle = COLORS.gridLine;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }
    
    // Walls
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y]?.[x]) {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }
    
    // Visited cells (up to current step)
    const currentVisited = visited.slice(0, step);
    for (const cell of currentVisited) {
      ctx.fillStyle = COLORS.closedSet;
      ctx.fillRect(cell.x * CELL + 2, cell.y * CELL + 2, CELL - 4, CELL - 4);
    }
    
    // Frontier at current step
    if (step > 0 && step < visited.length) {
      const currentFrontierStart = visited.slice(0, step);
      for (const cell of frontier) {
        if (!currentFrontierStart.some(v => v.x === cell.x && v.y === cell.y)) {
          ctx.fillStyle = COLORS.frontier;
          ctx.fillRect(cell.x * CELL + 2, cell.y * CELL + 2, CELL - 4, CELL - 4);
        }
      }
    }
    
    // Path (when complete)
    if (step >= visited.length && path.length > 0) {
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(path[0].x * CELL + CELL / 2, path[0].y * CELL + CELL / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * CELL + CELL / 2, path[i].y * CELL + CELL / 2);
      }
      ctx.stroke();
    }
    
    // Start
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(start.x * CELL + CELL / 2, start.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Goal
    ctx.fillStyle = COLORS.goal;
    ctx.beginPath();
    ctx.arc(goal.x * CELL + CELL / 2, goal.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
  }, [grid, step, visited, frontier, path, start, goal]);

  return (
    <div className="bg-[#12121a] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 bg-[#0a0a0f] border-b border-[#2a2a3a] flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Footprints className="w-5 h-5 text-[#6c5ce7]" />
          BFS Visualizer
        </h3>
        <div className="flex gap-2">
          <button
            onClick={runBFS}
            disabled={isRunning}
            className="px-3 py-1.5 bg-[#6c5ce7] text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
          >
            <Play className="w-4 h-4" /> Run
          </button>
          <button
            onClick={stepForward}
            disabled={!visited.length || step >= visited.length}
            className="px-3 py-1.5 bg-[#2a2a3a] text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
          >
            <StepForward className="w-4 h-4" /> Step
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 bg-[#2a2a3a] text-white rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>
      <div className="p-4">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="rounded-lg cursor-crosshair mx-auto block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <p className="text-center text-sm text-[#6a6a7a] mt-3">
          Click and drag to draw walls • Green = Start • Yellow = Goal
        </p>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#636e72]/60" /> Visited
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#fdcb6e]/60" /> Frontier
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#6c5ce7]" /> Path
          </span>
        </div>
      </div>
    </div>
  );
}

// ============ DIJKSTRA VISUALIZER ============
export function DijkstraVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [weights, setWeights] = useState<number[][]>([]);
  const [path, setPath] = useState<Vec2[]>([]);
  const [visited, setVisited] = useState<Vec2[]>([]);
  const [start] = useState<Vec2>({ x: 2, y: 5 });
  const [goal] = useState<Vec2>({ x: 17, y: 5 });
  
  const COLS = 20;
  const ROWS = 11;
  const CELL = 28;
  
  useEffect(() => {
    const initialGrid: boolean[][] = Array(ROWS).fill(null)
      .map(() => Array(COLS).fill(false));
    
    // Create weighted terrain
    const initialWeights: number[][] = Array(ROWS).fill(null)
      .map(() => Array(COLS).fill(1));
    
    // Add "mud" (high weight) areas
    for (let y = 2; y < 8; y++) {
      for (let x = 5; x < 8; x++) {
        initialWeights[y][x] = 5;
      }
    }
    for (let y = 3; y < 9; y++) {
      for (let x = 12; x < 15; x++) {
        initialWeights[y][x] = 5;
      }
    }
    
    setGrid(initialGrid);
    setWeights(initialWeights);
  }, []);
  
  const runDijkstra = useCallback(() => {
    if (grid.length === 0) return;
    const result = dijkstraPath(grid, start, goal, weights);
    setPath(result.path);
    setVisited(result.visited);
    setStep(0);
    setIsRunning(true);
  }, [grid, weights, start, goal]);
  
  const reset = useCallback(() => {
    setIsRunning(false);
    setStep(0);
    setPath([]);
    setVisited([]);
  }, []);
  
  useEffect(() => {
    if (!isRunning || step >= visited.length) return;
    const timer = setTimeout(() => setStep(s => s + 1), 30);
    return () => clearTimeout(timer);
  }, [isRunning, step, visited.length]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    
    // Draw weighted terrain first
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (weights[y]?.[x] > 1) {
          ctx.fillStyle = `rgba(225, 112, 85, ${0.1 * weights[y][x]})`;
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }
    
    // Grid lines
    ctx.strokeStyle = COLORS.gridLine;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }
    
    // Visited
    const currentVisited = visited.slice(0, step);
    for (const cell of currentVisited) {
      ctx.fillStyle = COLORS.closedSet;
      ctx.fillRect(cell.x * CELL + 2, cell.y * CELL + 2, CELL - 4, CELL - 4);
    }
    
    // Path
    if (step >= visited.length && path.length > 0) {
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(path[0].x * CELL + CELL / 2, path[0].y * CELL + CELL / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * CELL + CELL / 2, path[i].y * CELL + CELL / 2);
      }
      ctx.stroke();
    }
    
    // Start & Goal
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(start.x * CELL + CELL / 2, start.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = COLORS.goal;
    ctx.beginPath();
    ctx.arc(goal.x * CELL + CELL / 2, goal.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
  }, [grid, weights, step, visited, path, start, goal]);

  return (
    <div className="bg-[#12121a] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 bg-[#0a0a0f] border-b border-[#2a2a3a] flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#fdcb6e]" />
          Dijkstra Visualizer
        </h3>
        <div className="flex gap-2">
          <button
            onClick={runDijkstra}
            disabled={isRunning}
            className="px-3 py-1.5 bg-[#fdcb6e] text-black rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
          >
            <Play className="w-4 h-4" /> Run
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 bg-[#2a2a3a] text-white rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>
      <div className="p-4">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="rounded-lg mx-auto block"
        />
        <p className="text-center text-sm text-[#6a6a7a] mt-3">
          Orange areas have higher movement cost (weight = 5)
        </p>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#e17055]/40" /> High Cost
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#636e72]/60" /> Visited
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#6c5ce7]" /> Path
          </span>
        </div>
      </div>
    </div>
  );
}

// ============ A* VISUALIZER ============
export function AStarVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [path, setPath] = useState<Vec2[]>([]);
  const [openSet, setOpenSet] = useState<Vec2[]>([]);
  const [closedSet, setClosedSet] = useState<Vec2[]>([]);
  const [heuristic, setHeuristic] = useState<HeuristicType>('manhattan');
  const [start] = useState<Vec2>({ x: 2, y: 5 });
  const [goal] = useState<Vec2>({ x: 17, y: 5 });
  const [isDrawing, setIsDrawing] = useState(false);
  
  const COLS = 20;
  const ROWS = 11;
  const CELL = 28;
  
  useEffect(() => {
    const initialGrid: boolean[][] = Array(ROWS).fill(null)
      .map(() => Array(COLS).fill(false));
    for (let y = 2; y < 9; y++) initialGrid[y][10] = true;
    initialGrid[2][10] = false;
    initialGrid[8][10] = false;
    setGrid(initialGrid);
  }, []);
  
  const runAStar = useCallback(() => {
    if (grid.length === 0) return;
    const result = aStarPath(grid, start, goal, getHeuristic(heuristic));
    setPath(result.path);
    setOpenSet(result.openSet);
    setClosedSet(result.closedSet);
    setStep(0);
    setIsRunning(true);
  }, [grid, start, goal, heuristic]);
  
  const reset = useCallback(() => {
    setIsRunning(false);
    setStep(0);
    setPath([]);
    setOpenSet([]);
    setClosedSet([]);
  }, []);
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x === start.x && y === start.y) return;
    if (x === goal.x && y === goal.y) return;
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      setIsDrawing(true);
      setGrid(g => {
        const newGrid = g.map(row => [...row]);
        newGrid[y][x] = !newGrid[y][x];
        return newGrid;
      });
      reset();
    }
  }, [start, goal, reset]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x === start.x && y === start.y) return;
    if (x === goal.x && y === goal.y) return;
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      setGrid(g => {
        const newGrid = g.map(row => [...row]);
        newGrid[y][x] = true;
        return newGrid;
      });
    }
  }, [isDrawing, start, goal]);
  
  const handleMouseUp = useCallback(() => setIsDrawing(false), []);
  
  useEffect(() => {
    if (!isRunning || step >= closedSet.length) return;
    const timer = setTimeout(() => setStep(s => s + 1), 30);
    return () => clearTimeout(timer);
  }, [isRunning, step, closedSet.length]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    
    // Grid lines
    ctx.strokeStyle = COLORS.gridLine;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }
    
    // Walls
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y]?.[x]) {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }
    
    // Closed set
    const currentClosed = closedSet.slice(0, step);
    for (const cell of currentClosed) {
      ctx.fillStyle = COLORS.closedSet;
      ctx.fillRect(cell.x * CELL + 2, cell.y * CELL + 2, CELL - 4, CELL - 4);
    }
    
    // Open set
    if (step > 0 && step < closedSet.length) {
      for (const cell of openSet) {
        if (!currentClosed.some(c => c.x === cell.x && c.y === cell.y)) {
          ctx.fillStyle = COLORS.openSet;
          ctx.fillRect(cell.x * CELL + 2, cell.y * CELL + 2, CELL - 4, CELL - 4);
        }
      }
    }
    
    // Path
    if (step >= closedSet.length && path.length > 0) {
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(path[0].x * CELL + CELL / 2, path[0].y * CELL + CELL / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * CELL + CELL / 2, path[i].y * CELL + CELL / 2);
      }
      ctx.stroke();
    }
    
    // Start & Goal
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(start.x * CELL + CELL / 2, start.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = COLORS.goal;
    ctx.beginPath();
    ctx.arc(goal.x * CELL + CELL / 2, goal.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
  }, [grid, step, openSet, closedSet, path, start, goal]);

  return (
    <div className="bg-[#12121a] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 bg-[#0a0a0f] border-b border-[#2a2a3a] flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-[#00b894]" />
          A* Visualizer
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={heuristic}
            onChange={e => { setHeuristic(e.target.value as HeuristicType); reset(); }}
            className="px-2 py-1 bg-[#2a2a3a] border border-[#3a3a4a] rounded text-sm text-white"
          >
            <option value="manhattan">Manhattan</option>
            <option value="euclidean">Euclidean</option>
            <option value="chebyshev">Chebyshev</option>
          </select>
          <button
            onClick={runAStar}
            disabled={isRunning}
            className="px-3 py-1.5 bg-[#00b894] text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
          >
            <Play className="w-4 h-4" /> Run
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 bg-[#2a2a3a] text-white rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>
      <div className="p-4">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="rounded-lg cursor-crosshair mx-auto block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <p className="text-center text-sm text-[#6a6a7a] mt-3">
          Click and drag to draw walls • Try different heuristics!
        </p>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#74b9ff]/60" /> Open Set
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#636e72]/60" /> Closed Set
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#6c5ce7]" /> Path
          </span>
        </div>
      </div>
    </div>
  );
}

// ============ HEURISTIC COMPARISON ============
export function HeuristicComparison() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedCell, setSelectedCell] = useState<Vec2 | null>(null);
  const [center] = useState<Vec2>({ x: 7, y: 5 });
  
  const COLS = 15;
  const ROWS = 11;
  const CELL = 36;
  
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      setSelectedCell({ x, y });
    }
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    
    // Draw cells with heuristic values
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const manhattan = manhattanDistance({ x, y }, center);
        const euclidean = euclideanDistance({ x, y }, center);
        
        // Color based on Manhattan distance
        const intensity = 1 - manhattan / 14;
        ctx.fillStyle = `rgba(108, 92, 231, ${intensity * 0.5})`;
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      }
    }
    
    // Grid lines
    ctx.strokeStyle = COLORS.gridLine;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }
    
    // Center point
    ctx.fillStyle = COLORS.goal;
    ctx.beginPath();
    ctx.arc(center.x * CELL + CELL / 2, center.y * CELL + CELL / 2, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Selected cell highlight
    if (selectedCell) {
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(selectedCell.x * CELL + 2, selectedCell.y * CELL + 2, CELL - 4, CELL - 4);
    }
  }, [center, selectedCell]);

  return (
    <div className="bg-[#12121a] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 bg-[#0a0a0f] border-b border-[#2a2a3a]">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Square className="w-5 h-5 text-[#6c5ce7]" />
          Heuristic Comparison
        </h3>
      </div>
      <div className="p-4 flex flex-col md:flex-row gap-4 items-center">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="rounded-lg cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setSelectedCell(null)}
        />
        <div className="min-w-[180px] text-sm">
          <p className="text-[#6a6a7a] mb-2">Hover over cells to compare:</p>
          {selectedCell && (
            <div className="space-y-2">
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <div className="text-[#6a6a7a]">Cell</div>
                <div className="text-white font-mono">({selectedCell.x}, {selectedCell.y})</div>
              </div>
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <div className="text-[#6a6a7a]">Manhattan</div>
                <div className="text-[#6c5ce7] font-mono font-bold">
                  {manhattanDistance(selectedCell, center)}
                </div>
              </div>
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <div className="text-[#6a6a7a]">Euclidean</div>
                <div className="text-[#00b894] font-mono font-bold">
                  {euclideanDistance(selectedCell, center).toFixed(2)}
                </div>
              </div>
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <div className="text-[#6a6a7a]">Chebyshev</div>
                <div className="text-[#fdcb6e] font-mono font-bold">
                  {chebyshevDistance(selectedCell, center)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PATH SMOOTHING DEMO ============
export function PathSmoothingDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showSmoothed, setShowSmoothed] = useState(true);
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [path, setPath] = useState<Vec2[]>([]);
  const [smoothedPath, setSmoothedPath] = useState<Vec2[]>([]);
  const [start] = useState<Vec2>({ x: 2, y: 2 });
  const [goal] = useState<Vec2>({ x: 17, y: 8 });
  
  const COLS = 20;
  const ROWS = 11;
  const CELL = 28;
  
  useEffect(() => {
    const initialGrid: boolean[][] = Array(ROWS).fill(null)
      .map(() => Array(COLS).fill(false));
    
    // Add obstacles
    for (let y = 0; y < 6; y++) initialGrid[y][7] = true;
    for (let y = 5; y < 11; y++) initialGrid[y][12] = true;
    
    setGrid(initialGrid);
    
    // Compute paths
    const result = aStarPath(initialGrid, start, goal, manhattanDistance);
    setPath(result.path);
    setSmoothedPath(smoothPath(result.path, initialGrid));
  }, [start, goal]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    
    // Grid lines
    ctx.strokeStyle = COLORS.gridLine;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(COLS * CELL, y * CELL);
      ctx.stroke();
    }
    
    // Walls
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y]?.[x]) {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }
    
    // Original path
    if (path.length > 1) {
      ctx.strokeStyle = 'rgba(108, 92, 231, 0.4)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(path[0].x * CELL + CELL / 2, path[0].y * CELL + CELL / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * CELL + CELL / 2, path[i].y * CELL + CELL / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Smoothed path
    if (showSmoothed && smoothedPath.length > 1) {
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(smoothedPath[0].x * CELL + CELL / 2, smoothedPath[0].y * CELL + CELL / 2);
      for (let i = 1; i < smoothedPath.length; i++) {
        ctx.lineTo(smoothedPath[i].x * CELL + CELL / 2, smoothedPath[i].y * CELL + CELL / 2);
      }
      ctx.stroke();
    }
    
    // Start & Goal
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(start.x * CELL + CELL / 2, start.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = COLORS.goal;
    ctx.beginPath();
    ctx.arc(goal.x * CELL + CELL / 2, goal.y * CELL + CELL / 2, 10, 0, Math.PI * 2);
    ctx.fill();
  }, [grid, path, smoothedPath, showSmoothed, start, goal]);

  return (
    <div className="bg-[#12121a] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 bg-[#0a0a0f] border-b border-[#2a2a3a] flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Footprints className="w-5 h-5 text-[#00b894]" />
          Path Smoothing
        </h3>
        <button
          onClick={() => setShowSmoothed(!showSmoothed)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
            showSmoothed 
              ? 'bg-[#00b894]/20 text-[#00b894]' 
              : 'bg-[#2a2a3a] text-white'
          }`}
        >
          {showSmoothed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          Smoothed Path
        </button>
      </div>
      <div className="p-4">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="rounded-lg mx-auto block"
        />
        <div className="flex items-center justify-center gap-6 mt-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="inline-block w-8 h-0.5 bg-[#6c5ce7]/40" style={{ borderTop: '2px dashed #6c5ce7' }} />
            <span className="text-[#6a6a7a]">Original ({path.length} nodes)</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-8 h-1 bg-[#6c5ce7] rounded" />
            <span className="text-[#6a6a7a]">Smoothed ({smoothedPath.length} nodes)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
