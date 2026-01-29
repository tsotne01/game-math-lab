import { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Shuffle, Download, Settings,
  Grid3X3, Layers, Trees, Castle, DoorOpen, Gem, Skull,
  StepForward, SkipForward, ChevronRight, Wand2, Hash, Zap,
  Box, Waves, GitBranch, Target, RefreshCw
} from 'lucide-react';

// ============ TYPES ============
interface Vec2 {
  x: number;
  y: number;
}

interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  id: number;
  centerX: number;
  centerY: number;
  connected: boolean;
}

interface BSPNode {
  x: number;
  y: number;
  width: number;
  height: number;
  left: BSPNode | null;
  right: BSPNode | null;
  room: Room | null;
  splitDirection: 'horizontal' | 'vertical' | null;
}

type TileType = 'wall' | 'floor' | 'corridor' | 'door' | 'treasure' | 'enemy' | 'exit' | 'start';

type AlgorithmType = 'bsp' | 'cellular' | 'drunkard' | 'hybrid';

type CorridorType = 'straight' | 'l-shaped' | 'zigzag';

interface GenerationStep {
  type: 'split' | 'room' | 'corridor' | 'carve' | 'smooth' | 'connect' | 'place';
  description: string;
  grid: TileType[][];
  highlight?: Vec2[];
  rooms?: Room[];
  bspNode?: BSPNode;
}

// ============ CONSTANTS ============
const COLORS: Record<TileType | 'highlight' | 'border', string> = {
  wall: '#1a1a24',
  floor: '#2d3436',
  corridor: '#3d4446',
  door: '#fdcb6e',
  treasure: '#ffd93d',
  enemy: '#e17055',
  exit: '#00b894',
  start: '#6c5ce7',
  highlight: 'rgba(108, 92, 231, 0.5)',
  border: '#4a4a5a',
};

// ============ SEEDED RANDOM ============
class SeededRandom {
  private seed: number;
  
  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? this.hashString(seed) : seed;
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
  
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ============ NOISE GENERATION ============
class PerlinNoise {
  private permutation: number[];
  
  constructor(rng: SeededRandom) {
    this.permutation = [];
    for (let i = 0; i < 256; i++) {
      this.permutation.push(i);
    }
    this.permutation = rng.shuffle(this.permutation);
    this.permutation = [...this.permutation, ...this.permutation];
  }
  
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
  
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const p = this.permutation;
    const A = p[X] + Y;
    const B = p[X + 1] + Y;
    
    return this.lerp(
      this.lerp(this.grad(p[A], x, y), this.grad(p[B], x - 1, y), u),
      this.lerp(this.grad(p[A + 1], x, y - 1), this.grad(p[B + 1], x - 1, y - 1), u),
      v
    );
  }
  
  fbm(x: number, y: number, octaves: number, lacunarity: number = 2, persistence: number = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    return total / maxValue;
  }
}

// ============ DUNGEON GENERATION ALGORITHMS ============

// BSP (Binary Space Partitioning)
function generateBSP(
  width: number, 
  height: number, 
  rng: SeededRandom,
  minRoomSize: number,
  maxRoomSize: number,
  steps: GenerationStep[]
): { grid: TileType[][], rooms: Room[] } {
  const grid: TileType[][] = Array(height).fill(null).map(() => Array(width).fill('wall'));
  const rooms: Room[] = [];
  let roomId = 0;
  
  // Create BSP tree
  function createNode(x: number, y: number, w: number, h: number): BSPNode {
    return { x, y, width: w, height: h, left: null, right: null, room: null, splitDirection: null };
  }
  
  function split(node: BSPNode, depth: number = 0): void {
    const minSize = minRoomSize * 2 + 2;
    const canSplitH = node.height >= minSize * 2;
    const canSplitV = node.width >= minSize * 2;
    
    if (!canSplitH && !canSplitV) return;
    if (depth > 5) return;
    
    let splitH: boolean;
    if (!canSplitH) splitH = false;
    else if (!canSplitV) splitH = true;
    else splitH = rng.next() < 0.5;
    
    if (splitH) {
      const splitY = rng.range(minSize, node.height - minSize);
      node.left = createNode(node.x, node.y, node.width, splitY);
      node.right = createNode(node.x, node.y + splitY, node.width, node.height - splitY);
      node.splitDirection = 'horizontal';
    } else {
      const splitX = rng.range(minSize, node.width - minSize);
      node.left = createNode(node.x, node.y, splitX, node.height);
      node.right = createNode(node.x + splitX, node.y, node.width - splitX, node.height);
      node.splitDirection = 'vertical';
    }
    
    steps.push({
      type: 'split',
      description: `Split ${splitH ? 'horizontally' : 'vertically'} at depth ${depth}`,
      grid: grid.map(row => [...row]),
      bspNode: node,
    });
    
    split(node.left, depth + 1);
    split(node.right, depth + 1);
  }
  
  function createRooms(node: BSPNode): Room | null {
    if (node.left || node.right) {
      const leftRoom = node.left ? createRooms(node.left) : null;
      const rightRoom = node.right ? createRooms(node.right) : null;
      return leftRoom || rightRoom;
    }
    
    const roomW = rng.range(minRoomSize, Math.min(maxRoomSize, node.width - 2));
    const roomH = rng.range(minRoomSize, Math.min(maxRoomSize, node.height - 2));
    const roomX = node.x + rng.range(1, node.width - roomW - 1);
    const roomY = node.y + rng.range(1, node.height - roomH - 1);
    
    const room: Room = {
      id: roomId++,
      x: roomX,
      y: roomY,
      width: roomW,
      height: roomH,
      centerX: Math.floor(roomX + roomW / 2),
      centerY: Math.floor(roomY + roomH / 2),
      connected: false,
    };
    
    node.room = room;
    rooms.push(room);
    
    // Carve room
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (y >= 0 && y < height && x >= 0 && x < width) {
          grid[y][x] = 'floor';
        }
      }
    }
    
    steps.push({
      type: 'room',
      description: `Created room ${room.id} (${roomW}x${roomH})`,
      grid: grid.map(row => [...row]),
      rooms: [...rooms],
      highlight: [{ x: room.centerX, y: room.centerY }],
    });
    
    return room;
  }
  
  function getRoom(node: BSPNode): Room | null {
    if (node.room) return node.room;
    if (node.left && node.right) {
      const leftRoom = getRoom(node.left);
      const rightRoom = getRoom(node.right);
      return rng.next() < 0.5 ? (leftRoom || rightRoom) : (rightRoom || leftRoom);
    }
    return node.left ? getRoom(node.left) : node.right ? getRoom(node.right) : null;
  }
  
  function connectRooms(node: BSPNode): void {
    if (!node.left || !node.right) return;
    
    connectRooms(node.left);
    connectRooms(node.right);
    
    const leftRoom = getRoom(node.left);
    const rightRoom = getRoom(node.right);
    
    if (leftRoom && rightRoom) {
      carveCorridor(leftRoom.centerX, leftRoom.centerY, rightRoom.centerX, rightRoom.centerY);
    }
  }
  
  function carveCorridor(x1: number, y1: number, x2: number, y2: number): void {
    const highlight: Vec2[] = [];
    
    // L-shaped corridor
    if (rng.next() < 0.5) {
      // Horizontal first
      const xDir = x2 > x1 ? 1 : -1;
      for (let x = x1; x !== x2; x += xDir) {
        if (y1 >= 0 && y1 < height && x >= 0 && x < width && grid[y1][x] === 'wall') {
          grid[y1][x] = 'corridor';
          highlight.push({ x, y: y1 });
        }
      }
      const yDir = y2 > y1 ? 1 : -1;
      for (let y = y1; y !== y2 + yDir; y += yDir) {
        if (y >= 0 && y < height && x2 >= 0 && x2 < width && grid[y][x2] === 'wall') {
          grid[y][x2] = 'corridor';
          highlight.push({ x: x2, y });
        }
      }
    } else {
      // Vertical first
      const yDir = y2 > y1 ? 1 : -1;
      for (let y = y1; y !== y2; y += yDir) {
        if (y >= 0 && y < height && x1 >= 0 && x1 < width && grid[y][x1] === 'wall') {
          grid[y][x1] = 'corridor';
          highlight.push({ x: x1, y });
        }
      }
      const xDir = x2 > x1 ? 1 : -1;
      for (let x = x1; x !== x2 + xDir; x += xDir) {
        if (y2 >= 0 && y2 < height && x >= 0 && x < width && grid[y2][x] === 'wall') {
          grid[y2][x] = 'corridor';
          highlight.push({ x, y: y2 });
        }
      }
    }
    
    steps.push({
      type: 'corridor',
      description: `Connected rooms via corridor`,
      grid: grid.map(row => [...row]),
      highlight,
    });
  }
  
  const root = createNode(0, 0, width, height);
  split(root, 0);
  createRooms(root);
  connectRooms(root);
  
  return { grid, rooms };
}

// Cellular Automata (Cave Generation)
function generateCellular(
  width: number,
  height: number,
  rng: SeededRandom,
  fillProbability: number,
  iterations: number,
  steps: GenerationStep[]
): { grid: TileType[][], rooms: Room[] } {
  let grid: TileType[][] = Array(height).fill(null).map(() => Array(width).fill('wall'));
  
  // Initial random fill
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      grid[y][x] = rng.next() < fillProbability ? 'floor' : 'wall';
    }
  }
  
  steps.push({
    type: 'carve',
    description: `Initial random fill (${Math.round(fillProbability * 100)}% floor)`,
    grid: grid.map(row => [...row]),
  });
  
  // Cellular automata iterations
  for (let i = 0; i < iterations; i++) {
    const newGrid: TileType[][] = Array(height).fill(null).map(() => Array(width).fill('wall'));
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Count neighbors
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= height || nx < 0 || nx >= width) {
              walls++;
            } else if (grid[ny][nx] === 'wall') {
              walls++;
            }
          }
        }
        
        // Apply rule: 4-5 rule
        if (walls >= 5) {
          newGrid[y][x] = 'wall';
        } else {
          newGrid[y][x] = 'floor';
        }
      }
    }
    
    grid = newGrid;
    
    steps.push({
      type: 'smooth',
      description: `Cellular automata iteration ${i + 1}/${iterations}`,
      grid: grid.map(row => [...row]),
    });
  }
  
  // Flood fill to find connected regions
  const visited: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
  const rooms: Room[] = [];
  
  function floodFill(startX: number, startY: number): Vec2[] {
    const region: Vec2[] = [];
    const stack: Vec2[] = [{ x: startX, y: startY }];
    
    while (stack.length > 0) {
      const { x, y } = stack.pop()!;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[y][x] || grid[y][x] === 'wall') continue;
      
      visited[y][x] = true;
      region.push({ x, y });
      
      stack.push({ x: x + 1, y });
      stack.push({ x: x - 1, y });
      stack.push({ x, y: y + 1 });
      stack.push({ x, y: y - 1 });
    }
    
    return region;
  }
  
  let largestRegion: Vec2[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visited[y][x] && grid[y][x] === 'floor') {
        const region = floodFill(x, y);
        if (region.length > largestRegion.length) {
          largestRegion = region;
        }
      }
    }
  }
  
  // Keep only largest region
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === 'floor' && !largestRegion.some(p => p.x === x && p.y === y)) {
        grid[y][x] = 'wall';
      }
    }
  }
  
  if (largestRegion.length > 0) {
    const minX = Math.min(...largestRegion.map(p => p.x));
    const maxX = Math.max(...largestRegion.map(p => p.x));
    const minY = Math.min(...largestRegion.map(p => p.y));
    const maxY = Math.max(...largestRegion.map(p => p.y));
    
    rooms.push({
      id: 0,
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      centerX: Math.floor((minX + maxX) / 2),
      centerY: Math.floor((minY + maxY) / 2),
      connected: true,
    });
  }
  
  steps.push({
    type: 'connect',
    description: `Kept largest connected region (${largestRegion.length} tiles)`,
    grid: grid.map(row => [...row]),
    rooms,
  });
  
  return { grid, rooms };
}

// Drunkard's Walk (Random Walk)
function generateDrunkard(
  width: number,
  height: number,
  rng: SeededRandom,
  targetFloorPercent: number,
  steps: GenerationStep[]
): { grid: TileType[][], rooms: Room[] } {
  const grid: TileType[][] = Array(height).fill(null).map(() => Array(width).fill('wall'));
  const totalTiles = (width - 2) * (height - 2);
  const targetFloors = Math.floor(totalTiles * targetFloorPercent);
  
  let x = Math.floor(width / 2);
  let y = Math.floor(height / 2);
  let floorCount = 0;
  
  const directions = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 },  // right
  ];
  
  let stepCount = 0;
  while (floorCount < targetFloors && stepCount < totalTiles * 10) {
    if (grid[y][x] === 'wall') {
      grid[y][x] = 'floor';
      floorCount++;
      
      if (stepCount % 50 === 0) {
        steps.push({
          type: 'carve',
          description: `Drunkard's walk: ${Math.round(floorCount / targetFloors * 100)}% complete`,
          grid: grid.map(row => [...row]),
          highlight: [{ x, y }],
        });
      }
    }
    
    const dir = rng.pick(directions);
    const nx = x + dir.x;
    const ny = y + dir.y;
    
    if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) {
      x = nx;
      y = ny;
    }
    
    stepCount++;
  }
  
  steps.push({
    type: 'carve',
    description: `Drunkard's walk complete (${floorCount} floor tiles)`,
    grid: grid.map(row => [...row]),
  });
  
  // Create single room representing the carved area
  const rooms: Room[] = [{
    id: 0,
    x: 1,
    y: 1,
    width: width - 2,
    height: height - 2,
    centerX: Math.floor(width / 2),
    centerY: Math.floor(height / 2),
    connected: true,
  }];
  
  return { grid, rooms };
}

// Hybrid: BSP + Cellular smoothing
function generateHybrid(
  width: number,
  height: number,
  rng: SeededRandom,
  minRoomSize: number,
  maxRoomSize: number,
  steps: GenerationStep[]
): { grid: TileType[][], rooms: Room[] } {
  // Start with BSP
  const { grid, rooms } = generateBSP(width, height, rng, minRoomSize, maxRoomSize, steps);
  
  // Add some noise to walls for organic feel
  const noise = new PerlinNoise(rng);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] === 'wall') {
        const n = noise.noise2D(x * 0.1, y * 0.1);
        if (n > 0.4) {
          // Check if next to floor
          let nearFloor = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (grid[y + dy]?.[x + dx] === 'floor' || grid[y + dy]?.[x + dx] === 'corridor') {
                nearFloor = true;
              }
            }
          }
          if (nearFloor) {
            grid[y][x] = 'floor';
          }
        }
      }
    }
  }
  
  steps.push({
    type: 'smooth',
    description: 'Applied Perlin noise for organic edges',
    grid: grid.map(row => [...row]),
  });
  
  return { grid, rooms };
}

// Place content (items, enemies, etc)
function placeContent(
  grid: TileType[][],
  rooms: Room[],
  rng: SeededRandom,
  steps: GenerationStep[]
): TileType[][] {
  const result = grid.map(row => [...row]);
  const height = grid.length;
  const width = grid[0].length;
  
  // Find all floor tiles
  const floorTiles: Vec2[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (result[y][x] === 'floor' || result[y][x] === 'corridor') {
        floorTiles.push({ x, y });
      }
    }
  }
  
  if (floorTiles.length < 2) return result;
  
  // Shuffle floor tiles
  const shuffled = rng.shuffle(floorTiles);
  
  // Place start
  const start = shuffled.pop()!;
  result[start.y][start.x] = 'start';
  
  // Place exit (try to find one far from start)
  let exit = shuffled.pop()!;
  for (const tile of shuffled.slice(0, 20)) {
    const dist = Math.abs(tile.x - start.x) + Math.abs(tile.y - start.y);
    const exitDist = Math.abs(exit.x - start.x) + Math.abs(exit.y - start.y);
    if (dist > exitDist) {
      shuffled.push(exit);
      exit = tile;
    }
  }
  result[exit.y][exit.x] = 'exit';
  
  steps.push({
    type: 'place',
    description: 'Placed start and exit points',
    grid: result.map(row => [...row]),
    highlight: [start, exit],
  });
  
  // Place treasures
  const numTreasures = Math.min(rng.range(3, 6), Math.floor(shuffled.length * 0.02));
  for (let i = 0; i < numTreasures && shuffled.length > 0; i++) {
    const pos = shuffled.pop()!;
    result[pos.y][pos.x] = 'treasure';
  }
  
  // Place enemies
  const numEnemies = Math.min(rng.range(4, 8), Math.floor(shuffled.length * 0.03));
  for (let i = 0; i < numEnemies && shuffled.length > 0; i++) {
    const pos = shuffled.pop()!;
    // Don't place enemies too close to start
    const distFromStart = Math.abs(pos.x - start.x) + Math.abs(pos.y - start.y);
    if (distFromStart > 5) {
      result[pos.y][pos.x] = 'enemy';
    }
  }
  
  steps.push({
    type: 'place',
    description: `Placed ${numTreasures} treasures and ${numEnemies} enemies`,
    grid: result.map(row => [...row]),
  });
  
  return result;
}

// ============ MAIN DUNGEON GENERATOR COMPONENT ============
export default function DungeonGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [algorithm, setAlgorithm] = useState<AlgorithmType>('bsp');
  const [seed, setSeed] = useState('dungeon123');
  const [gridWidth, setGridWidth] = useState(40);
  const [gridHeight, setGridHeight] = useState(30);
  const [minRoomSize, setMinRoomSize] = useState(4);
  const [maxRoomSize, setMaxRoomSize] = useState(10);
  const [corridorWidth, setCorridorWidth] = useState(1);
  const [fillProbability, setFillProbability] = useState(0.45);
  const [iterations, setIterations] = useState(4);
  const [grid, setGrid] = useState<TileType[][]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [steps, setSteps] = useState<GenerationStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const playingRef = useRef(false);

  const cellSize = Math.min(16, Math.floor(Math.min(600 / gridWidth, 450 / gridHeight)));
  const canvasWidth = gridWidth * cellSize;
  const canvasHeight = gridHeight * cellSize;

  // Generate dungeon
  const generate = useCallback(() => {
    const rng = new SeededRandom(seed);
    const newSteps: GenerationStep[] = [];
    let result: { grid: TileType[][], rooms: Room[] };
    
    switch (algorithm) {
      case 'bsp':
        result = generateBSP(gridWidth, gridHeight, rng, minRoomSize, maxRoomSize, newSteps);
        break;
      case 'cellular':
        result = generateCellular(gridWidth, gridHeight, rng, fillProbability, iterations, newSteps);
        break;
      case 'drunkard':
        result = generateDrunkard(gridWidth, gridHeight, rng, 0.4, newSteps);
        break;
      case 'hybrid':
        result = generateHybrid(gridWidth, gridHeight, rng, minRoomSize, maxRoomSize, newSteps);
        break;
      default:
        result = generateBSP(gridWidth, gridHeight, rng, minRoomSize, maxRoomSize, newSteps);
    }
    
    // Place content
    result.grid = placeContent(result.grid, result.rooms, rng, newSteps);
    
    setSteps(newSteps);
    setCurrentStep(stepMode ? 0 : newSteps.length - 1);
    setGrid(stepMode ? (newSteps[0]?.grid || result.grid) : result.grid);
    setRooms(result.rooms);
    setIsPlaying(false);
    playingRef.current = false;
  }, [algorithm, seed, gridWidth, gridHeight, minRoomSize, maxRoomSize, fillProbability, iterations, stepMode]);

  // Auto-generate on mount and param changes
  useEffect(() => {
    generate();
  }, []);

  // Step through animation
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    
    playingRef.current = true;
    
    const interval = setInterval(() => {
      if (!playingRef.current) {
        clearInterval(interval);
        return;
      }
      
      setCurrentStep(prev => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false);
          playingRef.current = false;
          return prev;
        }
        setGrid(steps[prev + 1].grid);
        return prev + 1;
      });
    }, 150);
    
    return () => clearInterval(interval);
  }, [isPlaying, steps]);

  // Draw dungeon
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw tiles
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const tile = grid[y]?.[x] || 'wall';
        const px = x * cellSize;
        const py = y * cellSize;
        
        ctx.fillStyle = COLORS[tile];
        ctx.fillRect(px, py, cellSize, cellSize);
        
        // Draw icons for special tiles
        if (tile === 'treasure' || tile === 'enemy' || tile === 'exit' || tile === 'start') {
          ctx.fillStyle = tile === 'wall' ? '#666' : 'rgba(0,0,0,0.3)';
          const iconSize = cellSize * 0.6;
          const iconX = px + (cellSize - iconSize) / 2;
          const iconY = py + (cellSize - iconSize) / 2;
          
          ctx.beginPath();
          if (tile === 'treasure') {
            // Diamond shape
            ctx.moveTo(iconX + iconSize / 2, iconY);
            ctx.lineTo(iconX + iconSize, iconY + iconSize / 2);
            ctx.lineTo(iconX + iconSize / 2, iconY + iconSize);
            ctx.lineTo(iconX, iconY + iconSize / 2);
            ctx.closePath();
            ctx.fillStyle = '#fff';
          } else if (tile === 'enemy') {
            // X shape
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.moveTo(iconX, iconY);
            ctx.lineTo(iconX + iconSize, iconY + iconSize);
            ctx.moveTo(iconX + iconSize, iconY);
            ctx.lineTo(iconX, iconY + iconSize);
            ctx.stroke();
          } else if (tile === 'exit') {
            // Arrow up
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.moveTo(iconX + iconSize / 2, iconY);
            ctx.lineTo(iconX + iconSize / 2, iconY + iconSize);
            ctx.moveTo(iconX + iconSize / 4, iconY + iconSize / 3);
            ctx.lineTo(iconX + iconSize / 2, iconY);
            ctx.lineTo(iconX + iconSize * 3/4, iconY + iconSize / 3);
            ctx.stroke();
          } else if (tile === 'start') {
            // Circle
            ctx.arc(px + cellSize / 2, py + cellSize / 2, iconSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
          }
          ctx.fill();
        }
        
        // Grid lines
        if (showGrid) {
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.strokeRect(px, py, cellSize, cellSize);
        }
      }
    }
    
    // Draw highlight if in step mode
    if (stepMode && steps[currentStep]?.highlight) {
      ctx.fillStyle = COLORS.highlight;
      for (const pos of steps[currentStep].highlight!) {
        ctx.fillRect(pos.x * cellSize, pos.y * cellSize, cellSize, cellSize);
      }
    }
    
  }, [grid, gridWidth, gridHeight, cellSize, canvasWidth, canvasHeight, showGrid, stepMode, steps, currentStep]);

  // Export as JSON
  const exportJSON = () => {
    const data = {
      seed,
      algorithm,
      width: gridWidth,
      height: gridHeight,
      grid: grid.map(row => row.map(tile => tile[0])), // First char only
      rooms,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dungeon-${seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as image
  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `dungeon-${seed}.png`;
    a.click();
  };

  // Random seed
  const randomSeed = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let newSeed = '';
    for (let i = 0; i < 8; i++) {
      newSeed += chars[Math.floor(Math.random() * chars.length)];
    }
    setSeed(newSeed);
  };

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#2a2a3a] overflow-hidden">
      {/* Controls */}
      <div className="p-4 border-b border-[#2a2a3a] space-y-4">
        {/* Top row: Algorithm + Seed + Generate */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Algorithm:</label>
            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as AlgorithmType)}
              className="bg-[#1a1a24] text-white text-sm px-3 py-1.5 rounded border border-[#3a3a4a] focus:border-[#6c5ce7] outline-none"
            >
              <option value="bsp">BSP (Binary Space)</option>
              <option value="cellular">Cellular Automata</option>
              <option value="drunkard">Drunkard's Walk</option>
              <option value="hybrid">Hybrid (BSP + Noise)</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Seed:</label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="bg-[#1a1a24] text-white text-sm px-3 py-1.5 rounded border border-[#3a3a4a] focus:border-[#6c5ce7] outline-none w-28"
            />
            <button
              onClick={randomSeed}
              className="p-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white"
              title="Random Seed"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
          
          <button
            onClick={generate}
            className="flex items-center gap-2 px-4 py-1.5 bg-[#6c5ce7] hover:bg-[#5b4bd6] text-white text-sm font-medium rounded transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Generate
          </button>
        </div>
        
        {/* Size controls */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Size:</label>
            <select
              value={`${gridWidth}x${gridHeight}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                setGridWidth(w);
                setGridHeight(h);
              }}
              className="bg-[#1a1a24] text-white text-sm px-2 py-1 rounded border border-[#3a3a4a] focus:border-[#6c5ce7] outline-none"
            >
              <option value="30x20">Small (30×20)</option>
              <option value="40x30">Medium (40×30)</option>
              <option value="50x35">Large (50×35)</option>
              <option value="60x40">Extra Large (60×40)</option>
            </select>
          </div>
          
          {(algorithm === 'bsp' || algorithm === 'hybrid') && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Room Size:</label>
                <input
                  type="range"
                  min="3"
                  max="8"
                  value={minRoomSize}
                  onChange={(e) => setMinRoomSize(Number(e.target.value))}
                  className="w-16 accent-[#6c5ce7]"
                />
                <span className="text-gray-400 w-6">{minRoomSize}</span>
                <span className="text-gray-600">-</span>
                <input
                  type="range"
                  min="6"
                  max="15"
                  value={maxRoomSize}
                  onChange={(e) => setMaxRoomSize(Number(e.target.value))}
                  className="w-16 accent-[#6c5ce7]"
                />
                <span className="text-gray-400 w-6">{maxRoomSize}</span>
              </div>
            </>
          )}
          
          {algorithm === 'cellular' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Fill %:</label>
                <input
                  type="range"
                  min="0.35"
                  max="0.55"
                  step="0.01"
                  value={fillProbability}
                  onChange={(e) => setFillProbability(Number(e.target.value))}
                  className="w-20 accent-[#6c5ce7]"
                />
                <span className="text-gray-400 w-8">{Math.round(fillProbability * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Iterations:</label>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={iterations}
                  onChange={(e) => setIterations(Number(e.target.value))}
                  className="w-16 accent-[#6c5ce7]"
                />
                <span className="text-gray-400 w-4">{iterations}</span>
              </div>
            </>
          )}
        </div>
        
        {/* Step controls */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={stepMode}
              onChange={(e) => setStepMode(e.target.checked)}
              className="accent-[#6c5ce7]"
            />
            Step-through mode
          </label>
          
          {stepMode && steps.length > 0 && (
            <>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setCurrentStep(0);
                    setGrid(steps[0].grid);
                  }}
                  disabled={currentStep === 0}
                  className="p-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const prev = Math.max(0, currentStep - 1);
                    setCurrentStep(prev);
                    setGrid(steps[prev].grid);
                  }}
                  disabled={currentStep === 0}
                  className="p-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    const next = Math.min(steps.length - 1, currentStep + 1);
                    setCurrentStep(next);
                    setGrid(steps[next].grid);
                  }}
                  disabled={currentStep >= steps.length - 1}
                  className="p-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setCurrentStep(steps.length - 1);
                    setGrid(steps[steps.length - 1].grid);
                  }}
                  disabled={currentStep >= steps.length - 1}
                  className="p-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm text-gray-400">
                Step {currentStep + 1}/{steps.length}
              </span>
            </>
          )}
          
          <div className="flex-1" />
          
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
              className="accent-[#6c5ce7]"
            />
            <Grid3X3 className="w-4 h-4" />
          </label>
          
          <button
            onClick={exportJSON}
            className="flex items-center gap-1 px-2 py-1 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#00b894] text-gray-400 hover:text-[#00b894] text-xs"
          >
            <Download className="w-3 h-3" />
            JSON
          </button>
          <button
            onClick={exportImage}
            className="flex items-center gap-1 px-2 py-1 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#00b894] text-gray-400 hover:text-[#00b894] text-xs"
          >
            <Download className="w-3 h-3" />
            PNG
          </button>
        </div>
        
        {/* Step description */}
        {stepMode && steps[currentStep] && (
          <div className="text-sm text-[#6c5ce7] bg-[#6c5ce7]/10 px-3 py-2 rounded">
            <strong>{steps[currentStep].type.toUpperCase()}:</strong> {steps[currentStep].description}
          </div>
        )}
      </div>
      
      {/* Canvas */}
      <div className="flex justify-center p-4 bg-[#0a0a0f] overflow-auto">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="border border-[#2a2a3a] rounded"
        />
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 p-4 border-t border-[#2a2a3a] text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.wall }} />
          <span>Wall</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.floor }} />
          <span>Floor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.corridor }} />
          <span>Corridor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.start }} />
          <span>Start</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.exit }} />
          <span>Exit</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.treasure }} />
          <span>Treasure</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS.enemy }} />
          <span>Enemy</span>
        </div>
        {rooms.length > 0 && (
          <div className="ml-auto text-gray-500">
            {rooms.length} room{rooms.length !== 1 ? 's' : ''} • Seed: {seed}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ NOISE VISUALIZER DEMO ============
export function NoiseVisualizerDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seed, setSeed] = useState(42);
  const [frequency, setFrequency] = useState(0.05);
  const [octaves, setOctaves] = useState(4);
  const [lacunarity, setLacunarity] = useState(2);
  const [persistence, setPersistence] = useState(0.5);
  const [viewMode, setViewMode] = useState<'1d' | '2d'>('2d');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    
    const rng = new SeededRandom(seed);
    const noise = new PerlinNoise(rng);
    
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width, height);
    
    if (viewMode === '2d') {
      const imageData = ctx.createImageData(width, height);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const value = noise.fbm(x * frequency, y * frequency, octaves, lacunarity, persistence);
          const normalized = (value + 1) / 2;
          const brightness = Math.floor(normalized * 255);
          
          const i = (y * width + x) * 4;
          imageData.data[i] = brightness;
          imageData.data[i + 1] = brightness;
          imageData.data[i + 2] = brightness;
          imageData.data[i + 3] = 255;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    } else {
      // 1D view
      ctx.strokeStyle = '#6c5ce7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      for (let x = 0; x < width; x++) {
        const value = noise.fbm(x * frequency, 0, octaves, lacunarity, persistence);
        const y = height / 2 - value * height * 0.4;
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      
      // Draw center line
      ctx.strokeStyle = '#3a3a4a';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
  }, [seed, frequency, octaves, lacunarity, persistence, viewMode]);

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 border-b border-[#2a2a3a]">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('1d')}
              className={`px-3 py-1 rounded ${viewMode === '1d' ? 'bg-[#6c5ce7] text-white' : 'bg-[#1a1a24] text-gray-400'}`}
            >
              1D
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`px-3 py-1 rounded ${viewMode === '2d' ? 'bg-[#6c5ce7] text-white' : 'bg-[#1a1a24] text-gray-400'}`}
            >
              2D
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-gray-400">Seed:</label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="bg-[#1a1a24] text-white px-2 py-1 rounded border border-[#3a3a4a] w-20"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-gray-400">Frequency:</label>
            <input
              type="range"
              min="0.01"
              max="0.2"
              step="0.01"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="w-20 accent-[#6c5ce7]"
            />
            <span className="text-gray-400 w-10">{frequency.toFixed(2)}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-gray-400">Octaves:</label>
            <input
              type="range"
              min="1"
              max="8"
              value={octaves}
              onChange={(e) => setOctaves(Number(e.target.value))}
              className="w-16 accent-[#6c5ce7]"
            />
            <span className="text-gray-400 w-4">{octaves}</span>
          </div>
        </div>
      </div>
      
      <div className="flex justify-center p-4 bg-[#0a0a0f]">
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="border border-[#2a2a3a] rounded"
        />
      </div>
    </div>
  );
}

// ============ BSP TREE VISUALIZER ============
export function BSPTreeDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seed, setSeed] = useState('bsp123');
  const [depth, setDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(4);
  const [showRooms, setShowRooms] = useState(false);
  const [splits, setSplits] = useState<BSPNode[]>([]);

  const width = 400;
  const height = 300;

  useEffect(() => {
    const rng = new SeededRandom(seed);
    const newSplits: BSPNode[] = [];
    
    function createNode(x: number, y: number, w: number, h: number): BSPNode {
      return { x, y, width: w, height: h, left: null, right: null, room: null, splitDirection: null };
    }
    
    function split(node: BSPNode, d: number = 0): void {
      if (d >= maxDepth) return;
      
      const minSize = 40;
      const canSplitH = node.height >= minSize * 2;
      const canSplitV = node.width >= minSize * 2;
      
      if (!canSplitH && !canSplitV) return;
      
      let splitH: boolean;
      if (!canSplitH) splitH = false;
      else if (!canSplitV) splitH = true;
      else splitH = rng.next() < 0.5;
      
      if (splitH) {
        const splitY = rng.range(minSize, node.height - minSize);
        node.left = createNode(node.x, node.y, node.width, splitY);
        node.right = createNode(node.x, node.y + splitY, node.width, node.height - splitY);
        node.splitDirection = 'horizontal';
      } else {
        const splitX = rng.range(minSize, node.width - minSize);
        node.left = createNode(node.x, node.y, splitX, node.height);
        node.right = createNode(node.x + splitX, node.y, node.width - splitX, node.height);
        node.splitDirection = 'vertical';
      }
      
      newSplits.push({ ...node });
      
      split(node.left, d + 1);
      split(node.right, d + 1);
    }
    
    const root = createNode(0, 0, width, height);
    split(root, 0);
    setSplits(newSplits);
    
  }, [seed, maxDepth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width, height);
    
    // Draw splits up to current depth
    const displaySplits = splits.slice(0, depth);
    const colors = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#74b9ff', '#fd79a8'];
    
    for (let i = 0; i < displaySplits.length; i++) {
      const node = displaySplits[i];
      ctx.strokeStyle = colors[Math.min(i, colors.length - 1)];
      ctx.lineWidth = 3;
      
      if (node.splitDirection === 'horizontal' && node.left) {
        const y = node.y + node.left.height;
        ctx.beginPath();
        ctx.moveTo(node.x, y);
        ctx.lineTo(node.x + node.width, y);
        ctx.stroke();
      } else if (node.splitDirection === 'vertical' && node.left) {
        const x = node.x + node.left.width;
        ctx.beginPath();
        ctx.moveTo(x, node.y);
        ctx.lineTo(x, node.y + node.height);
        ctx.stroke();
      }
    }
    
    // Draw rooms if enabled
    if (showRooms && depth >= splits.length) {
      const rng = new SeededRandom(seed);
      
      function drawRooms(node: BSPNode): void {
        if (!node.left && !node.right) {
          // Leaf node - draw room
          const margin = 5;
          const roomW = rng.range(node.width * 0.5, node.width - margin * 2);
          const roomH = rng.range(node.height * 0.5, node.height - margin * 2);
          const roomX = node.x + rng.range(margin, node.width - roomW - margin);
          const roomY = node.y + rng.range(margin, node.height - roomH - margin);
          
          ctx.fillStyle = 'rgba(108, 92, 231, 0.3)';
          ctx.fillRect(roomX, roomY, roomW, roomH);
          ctx.strokeStyle = '#6c5ce7';
          ctx.lineWidth = 1;
          ctx.strokeRect(roomX, roomY, roomW, roomH);
        }
        if (node.left) drawRooms(node.left);
        if (node.right) drawRooms(node.right);
      }
      
      // Rebuild tree to get leaf nodes
      const root: BSPNode = { x: 0, y: 0, width, height, left: null, right: null, room: null, splitDirection: null };
      let current = root;
      for (const split of splits) {
        function apply(node: BSPNode, target: BSPNode): boolean {
          if (node.x === target.x && node.y === target.y && node.width === target.width && node.height === target.height) {
            node.left = target.left;
            node.right = target.right;
            node.splitDirection = target.splitDirection;
            return true;
          }
          if (node.left && apply(node.left, target)) return true;
          if (node.right && apply(node.right, target)) return true;
          return false;
        }
        apply(root, split);
      }
      drawRooms(root);
    }
    
    // Draw border
    ctx.strokeStyle = '#3a3a4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);
    
  }, [splits, depth, showRooms, seed]);

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 border-b border-[#2a2a3a]">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-gray-400">Split Depth:</label>
            <input
              type="range"
              min="0"
              max={splits.length}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-24 accent-[#6c5ce7]"
            />
            <span className="text-gray-400">{depth}/{splits.length}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-gray-400">Max Depth:</label>
            <input
              type="range"
              min="1"
              max="6"
              value={maxDepth}
              onChange={(e) => {
                setMaxDepth(Number(e.target.value));
                setDepth(0);
              }}
              className="w-16 accent-[#6c5ce7]"
            />
            <span className="text-gray-400">{maxDepth}</span>
          </div>
          
          <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showRooms}
              onChange={(e) => setShowRooms(e.target.checked)}
              className="accent-[#6c5ce7]"
            />
            Show Rooms
          </label>
          
          <button
            onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}
            className="flex items-center gap-1 px-3 py-1 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
            New
          </button>
        </div>
      </div>
      
      <div className="flex justify-center p-4 bg-[#0a0a0f]">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="border border-[#2a2a3a] rounded"
        />
      </div>
    </div>
  );
}

// ============ CELLULAR AUTOMATA PLAYGROUND ============
export function CellularAutomataDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [birthRules, setBirthRules] = useState([5, 6, 7, 8]);
  const [surviveRules, setSurviveRules] = useState([4, 5, 6, 7, 8]);
  const [generation, setGeneration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playingRef = useRef(false);

  const width = 60;
  const height = 40;
  const cellSize = 8;

  // Initialize random grid
  const reset = useCallback(() => {
    const newGrid: boolean[][] = [];
    for (let y = 0; y < height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x++) {
        row.push(Math.random() < 0.45);
      }
      newGrid.push(row);
    }
    setGrid(newGrid);
    setGeneration(0);
  }, []);

  useEffect(() => {
    reset();
  }, []);

  // Step simulation
  const step = useCallback(() => {
    setGrid(prevGrid => {
      const newGrid: boolean[][] = [];
      
      for (let y = 0; y < height; y++) {
        const row: boolean[] = [];
        for (let x = 0; x < width; x++) {
          let neighbors = 0;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                if (prevGrid[ny][nx]) neighbors++;
              } else {
                neighbors++; // Edge counts as wall
              }
            }
          }
          
          const alive = prevGrid[y][x];
          if (alive) {
            row.push(surviveRules.includes(neighbors));
          } else {
            row.push(birthRules.includes(neighbors));
          }
        }
        newGrid.push(row);
      }
      
      return newGrid;
    });
    setGeneration(g => g + 1);
  }, [birthRules, surviveRules]);

  // Auto-play
  useEffect(() => {
    if (!isPlaying) {
      playingRef.current = false;
      return;
    }
    
    playingRef.current = true;
    
    const interval = setInterval(() => {
      if (!playingRef.current) {
        clearInterval(interval);
        return;
      }
      step();
    }, 100);
    
    return () => clearInterval(interval);
  }, [isPlaying, step]);

  // Draw grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width * cellSize, height * cellSize);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y]?.[x]) {
          ctx.fillStyle = '#6c5ce7';
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }
  }, [grid]);

  const toggleRule = (rules: number[], setRules: (r: number[]) => void, value: number) => {
    if (rules.includes(value)) {
      setRules(rules.filter(r => r !== value));
    } else {
      setRules([...rules, value].sort());
    }
  };

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 border-b border-[#2a2a3a] space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded ${isPlaying ? 'bg-[#e17055]' : 'bg-[#00b894]'} text-white text-sm`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          <button
            onClick={step}
            disabled={isPlaying}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white text-sm disabled:opacity-50"
          >
            <StepForward className="w-4 h-4" />
            Step
          </button>
          
          <button
            onClick={reset}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          <span className="text-gray-400 text-sm">Generation: {generation}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Birth (B):</span>
            {[0,1,2,3,4,5,6,7,8].map(n => (
              <button
                key={n}
                onClick={() => toggleRule(birthRules, setBirthRules, n)}
                className={`w-6 h-6 rounded ${birthRules.includes(n) ? 'bg-[#00b894] text-white' : 'bg-[#1a1a24] text-gray-500'}`}
              >
                {n}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Survive (S):</span>
            {[0,1,2,3,4,5,6,7,8].map(n => (
              <button
                key={n}
                onClick={() => toggleRule(surviveRules, setSurviveRules, n)}
                className={`w-6 h-6 rounded ${surviveRules.includes(n) ? 'bg-[#6c5ce7] text-white' : 'bg-[#1a1a24] text-gray-500'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        
        <div className="text-xs text-gray-500">
          Current rule: B{birthRules.join('')}/S{surviveRules.join('')}
          {birthRules.join('') === '5678' && surviveRules.join('') === '45678' && ' (Cave generation)'}
          {birthRules.join('') === '3' && surviveRules.join('') === '23' && ' (Conway\'s Game of Life)'}
        </div>
      </div>
      
      <div className="flex justify-center p-4 bg-[#0a0a0f]">
        <canvas
          ref={canvasRef}
          width={width * cellSize}
          height={height * cellSize}
          className="border border-[#2a2a3a] rounded"
        />
      </div>
    </div>
  );
}

// ============ CORRIDOR ALGORITHM COMPARISON ============
export function CorridorComparisonDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [corridorType, setCorridorType] = useState<CorridorType>('straight');
  const [seed, setSeed] = useState(42);

  const width = 400;
  const height = 250;
  const room1 = { x: 50, y: 50, width: 80, height: 60 };
  const room2 = { x: 270, y: 140, width: 80, height: 60 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width, height);
    
    // Draw rooms
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(room1.x, room1.y, room1.width, room1.height);
    ctx.fillRect(room2.x, room2.y, room2.width, room2.height);
    
    ctx.strokeStyle = '#4a4a5a';
    ctx.lineWidth = 2;
    ctx.strokeRect(room1.x, room1.y, room1.width, room1.height);
    ctx.strokeRect(room2.x, room2.y, room2.width, room2.height);
    
    // Calculate centers
    const c1 = { x: room1.x + room1.width / 2, y: room1.y + room1.height / 2 };
    const c2 = { x: room2.x + room2.width / 2, y: room2.y + room2.height / 2 };
    
    // Draw corridor
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    
    const rng = new SeededRandom(seed);
    
    if (corridorType === 'straight') {
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
    } else if (corridorType === 'l-shaped') {
      ctx.moveTo(c1.x, c1.y);
      if (rng.next() < 0.5) {
        ctx.lineTo(c2.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
      } else {
        ctx.lineTo(c1.x, c2.y);
        ctx.lineTo(c2.x, c2.y);
      }
    } else if (corridorType === 'zigzag') {
      const midX = (c1.x + c2.x) / 2;
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(midX, c1.y);
      ctx.lineTo(midX, c2.y);
      ctx.lineTo(c2.x, c2.y);
    }
    
    ctx.stroke();
    
    // Draw center points
    ctx.fillStyle = '#fdcb6e';
    ctx.beginPath();
    ctx.arc(c1.x, c1.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c2.x, c2.y, 5, 0, Math.PI * 2);
    ctx.fill();
    
  }, [corridorType, seed]);

  return (
    <div className="bg-[#0d0d14] rounded-xl border border-[#2a2a3a] overflow-hidden">
      <div className="p-4 border-b border-[#2a2a3a]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-gray-400 text-sm">Corridor Type:</span>
          
          <button
            onClick={() => setCorridorType('straight')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${corridorType === 'straight' ? 'bg-[#6c5ce7] text-white' : 'bg-[#1a1a24] text-gray-400 border border-[#3a3a4a]'}`}
          >
            Straight
          </button>
          
          <button
            onClick={() => setCorridorType('l-shaped')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${corridorType === 'l-shaped' ? 'bg-[#6c5ce7] text-white' : 'bg-[#1a1a24] text-gray-400 border border-[#3a3a4a]'}`}
          >
            L-Shaped
          </button>
          
          <button
            onClick={() => setCorridorType('zigzag')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${corridorType === 'zigzag' ? 'bg-[#6c5ce7] text-white' : 'bg-[#1a1a24] text-gray-400 border border-[#3a3a4a]'}`}
          >
            Zigzag
          </button>
          
          {corridorType === 'l-shaped' && (
            <button
              onClick={() => setSeed(s => s + 1)}
              className="flex items-center gap-1 px-2 py-1 bg-[#1a1a24] rounded border border-[#3a3a4a] hover:border-[#6c5ce7] text-gray-400 hover:text-white text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Flip
            </button>
          )}
        </div>
      </div>
      
      <div className="flex justify-center p-4 bg-[#0a0a0f]">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="border border-[#2a2a3a] rounded"
        />
      </div>
      
      <div className="px-4 pb-4 text-xs text-gray-500">
        {corridorType === 'straight' && 'Direct line between room centers. Fast but may clip through walls.'}
        {corridorType === 'l-shaped' && 'Two-segment path (horizontal then vertical, or vice versa). Most common in roguelikes.'}
        {corridorType === 'zigzag' && 'Three-segment path through a midpoint. Creates interesting layouts.'}
      </div>
    </div>
  );
}
