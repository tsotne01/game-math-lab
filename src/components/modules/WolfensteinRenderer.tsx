import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Eye, Grid3X3, Maximize2, Move, Settings, Crosshair, ZoomIn, Map as MapIcon, Box, Layers, ChevronRight, Target, Compass } from 'lucide-react';

// ============== TYPES ==============
interface Vec2 {
  x: number;
  y: number;
}

interface Player {
  x: number;
  y: number;
  angle: number; // radians
}

interface Sprite {
  x: number;
  y: number;
  type: 'barrel' | 'pillar' | 'lamp' | 'enemy';
  collected?: boolean;
}

interface RayHit {
  distance: number;
  wallX: number; // exact position where ray hit (for texture mapping)
  side: 0 | 1; // 0 = NS wall, 1 = EW wall
  mapX: number;
  mapY: number;
  textureId: number;
}

interface DDAStep {
  x: number;
  y: number;
  sideDistX: number;
  sideDistY: number;
  hit: boolean;
}

// ============== CONSTANTS ==============
const TILE_SIZE = 64;
const MOVE_SPEED = 0.05;
const ROT_SPEED = 0.04;
const DEFAULT_FOV = Math.PI / 3; // 60 degrees

// Wall textures (procedurally generated)
const WALL_COLORS = [
  '#4a4a4a', // 0: Gray stone
  '#8B4513', // 1: Brown wood
  '#2c3e50', // 2: Dark blue stone
  '#c0392b', // 3: Red brick
  '#1a5276', // 4: Blue metal
];

// Simple map: 0 = empty, 1-4 = wall types
const DEFAULT_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 2, 2, 2, 0, 0, 0, 3, 3, 3, 0, 0, 0, 1],
  [1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 4, 4, 4, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1],
  [1, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1],
  [1, 0, 0, 3, 3, 3, 0, 0, 0, 2, 2, 2, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const DEFAULT_SPRITES: Sprite[] = [
  { x: 4.5, y: 4.5, type: 'barrel' },
  { x: 11.5, y: 4.5, type: 'pillar' },
  { x: 7.5, y: 7.5, type: 'lamp' },
  { x: 4.5, y: 11.5, type: 'enemy' },
  { x: 11.5, y: 11.5, type: 'barrel' },
  { x: 8.5, y: 2.5, type: 'pillar' },
];

// ============== UTILITY FUNCTIONS ==============
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalizeAngle(angle: number): number {
  while (angle < 0) angle += Math.PI * 2;
  while (angle >= Math.PI * 2) angle -= Math.PI * 2;
  return angle;
}

// ============== DDA RAYCASTING ==============
function castRay(
  player: Player,
  rayAngle: number,
  map: number[][],
  maxDist: number = 20
): RayHit {
  const rayDirX = Math.cos(rayAngle);
  const rayDirY = Math.sin(rayAngle);

  // Current map position
  let mapX = Math.floor(player.x);
  let mapY = Math.floor(player.y);

  // Length of ray from one x/y-side to next
  const deltaDistX = Math.abs(1 / rayDirX);
  const deltaDistY = Math.abs(1 / rayDirY);

  // Direction to step in x/y
  const stepX = rayDirX >= 0 ? 1 : -1;
  const stepY = rayDirY >= 0 ? 1 : -1;

  // Initial side distances
  let sideDistX = rayDirX >= 0
    ? (mapX + 1 - player.x) * deltaDistX
    : (player.x - mapX) * deltaDistX;
  let sideDistY = rayDirY >= 0
    ? (mapY + 1 - player.y) * deltaDistY
    : (player.y - mapY) * deltaDistY;

  // DDA loop
  let side: 0 | 1 = 0;
  let hit = false;

  while (!hit) {
    // Jump to next map square
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }

    // Check if ray hit a wall
    if (mapX < 0 || mapX >= map[0].length || mapY < 0 || mapY >= map.length) {
      hit = true; // Out of bounds
    } else if (map[mapY][mapX] > 0) {
      hit = true;
    }

    // Safety check
    const dist = side === 0
      ? (mapX - player.x + (1 - stepX) / 2) / rayDirX
      : (mapY - player.y + (1 - stepY) / 2) / rayDirY;
    if (dist > maxDist) {
      hit = true;
    }
  }

  // Calculate perpendicular distance (avoids fisheye)
  let perpWallDist: number;
  let wallX: number;

  if (side === 0) {
    perpWallDist = (mapX - player.x + (1 - stepX) / 2) / rayDirX;
    wallX = player.y + perpWallDist * rayDirY;
  } else {
    perpWallDist = (mapY - player.y + (1 - stepY) / 2) / rayDirY;
    wallX = player.x + perpWallDist * rayDirX;
  }
  wallX -= Math.floor(wallX);

  const textureId = (mapX >= 0 && mapX < map[0].length && mapY >= 0 && mapY < map.length)
    ? map[mapY][mapX]
    : 1;

  return {
    distance: perpWallDist,
    wallX,
    side,
    mapX,
    mapY,
    textureId,
  };
}

// Cast ray and return DDA steps for visualization
function castRayWithSteps(
  player: Player,
  rayAngle: number,
  map: number[][]
): { hit: RayHit; steps: DDAStep[] } {
  const rayDirX = Math.cos(rayAngle);
  const rayDirY = Math.sin(rayAngle);

  let mapX = Math.floor(player.x);
  let mapY = Math.floor(player.y);

  const deltaDistX = Math.abs(1 / rayDirX);
  const deltaDistY = Math.abs(1 / rayDirY);

  const stepX = rayDirX >= 0 ? 1 : -1;
  const stepY = rayDirY >= 0 ? 1 : -1;

  let sideDistX = rayDirX >= 0
    ? (mapX + 1 - player.x) * deltaDistX
    : (player.x - mapX) * deltaDistX;
  let sideDistY = rayDirY >= 0
    ? (mapY + 1 - player.y) * deltaDistY
    : (player.y - mapY) * deltaDistY;

  const steps: DDAStep[] = [];
  let side: 0 | 1 = 0;
  let hit = false;

  // Record initial position
  steps.push({
    x: mapX,
    y: mapY,
    sideDistX,
    sideDistY,
    hit: false,
  });

  while (!hit && steps.length < 50) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }

    const isHit = mapX < 0 || mapX >= map[0].length || mapY < 0 || mapY >= map.length ||
      map[mapY]?.[mapX] > 0;

    steps.push({
      x: mapX,
      y: mapY,
      sideDistX,
      sideDistY,
      hit: isHit,
    });

    if (isHit) hit = true;
  }

  // Calculate final hit info
  let perpWallDist: number;
  let wallX: number;

  if (side === 0) {
    perpWallDist = (mapX - player.x + (1 - stepX) / 2) / rayDirX;
    wallX = player.y + perpWallDist * rayDirY;
  } else {
    perpWallDist = (mapY - player.y + (1 - stepY) / 2) / rayDirY;
    wallX = player.x + perpWallDist * rayDirX;
  }
  wallX -= Math.floor(wallX);

  const textureId = (mapX >= 0 && mapX < map[0].length && mapY >= 0 && mapY < map.length)
    ? map[mapY][mapX]
    : 1;

  return {
    hit: { distance: perpWallDist, wallX, side, mapX, mapY, textureId },
    steps,
  };
}

// ============== TEXTURE GENERATION ==============
function generateTexture(type: number, size: number = 64): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  switch (type) {
    case 1: // Gray stone bricks
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      for (let y = 0; y < size; y += 16) {
        const offset = (Math.floor(y / 16) % 2) * 16;
        for (let x = offset; x < size; x += 32) {
          ctx.strokeRect(x, y, 32, 16);
        }
      }
      break;

    case 2: // Blue stone
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#1a2530';
      for (let y = 0; y < size; y += 8) {
        for (let x = 0; x < size; x += 8) {
          if ((x + y) % 16 === 0) {
            ctx.fillRect(x, y, 8, 8);
          }
        }
      }
      break;

    case 3: // Red brick
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#922b21';
      ctx.lineWidth = 2;
      for (let y = 0; y < size; y += 12) {
        const offset = (Math.floor(y / 12) % 2) * 16;
        for (let x = offset; x < size; x += 32) {
          ctx.strokeRect(x, y, 32, 12);
        }
      }
      break;

    case 4: // Blue metal panels
      ctx.fillStyle = '#1a5276';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#2471a3';
      ctx.fillRect(4, 4, size - 8, size - 8);
      ctx.fillStyle = '#1a5276';
      ctx.fillRect(8, 8, size - 16, size - 16);
      // Rivets
      ctx.fillStyle = '#5dade2';
      ctx.beginPath();
      ctx.arc(8, 8, 3, 0, Math.PI * 2);
      ctx.arc(size - 8, 8, 3, 0, Math.PI * 2);
      ctx.arc(8, size - 8, 3, 0, Math.PI * 2);
      ctx.arc(size - 8, size - 8, 3, 0, Math.PI * 2);
      ctx.fill();
      break;

    default: // Default gray
      ctx.fillStyle = '#666';
      ctx.fillRect(0, 0, size, size);
  }

  return ctx.getImageData(0, 0, size, size);
}

// ============== DEMO 1: SINGLE RAY VISUALIZER ==============
export function SingleRayDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rayAngle, setRayAngle] = useState(0);
  const [player] = useState<Player>({ x: 4.5, y: 8.5, angle: 0 });

  const simpleMap = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 2, 2, 2, 0, 0, 0, 1],
    [1, 0, 0, 2, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 2, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 3, 3, 0, 1],
    [1, 0, 0, 0, 0, 0, 3, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    const cellSize = Math.min(width, height) / simpleMap.length;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw map
    for (let y = 0; y < simpleMap.length; y++) {
      for (let x = 0; x < simpleMap[y].length; x++) {
        const cell = simpleMap[y][x];
        if (cell > 0) {
          ctx.fillStyle = WALL_COLORS[cell] || '#666';
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        } else {
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }

    // Cast ray
    const actualAngle = player.angle + rayAngle;
    const hit = castRay(player, actualAngle, simpleMap);

    // Draw ray
    const startX = player.x * cellSize;
    const startY = player.y * cellSize;
    const endX = startX + Math.cos(actualAngle) * hit.distance * cellSize;
    const endY = startY + Math.sin(actualAngle) * hit.distance * cellSize;

    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw hit point
    ctx.fillStyle = '#e17055';
    ctx.beginPath();
    ctx.arc(endX, endY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw player
    ctx.fillStyle = '#6c5ce7';
    ctx.beginPath();
    ctx.arc(startX, startY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + Math.cos(player.angle) * 20, startY + Math.sin(player.angle) * 20);
    ctx.stroke();

    // Info display
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(`Ray Angle: ${((rayAngle * 180) / Math.PI).toFixed(1)}°`, 10, 25);
    ctx.fillText(`Distance: ${hit.distance.toFixed(2)}`, 10, 45);
    ctx.fillText(`Wall X: ${hit.wallX.toFixed(2)}`, 10, 65);
    ctx.fillText(`Side: ${hit.side === 0 ? 'N/S' : 'E/W'}`, 10, 85);
  }, [player, rayAngle]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="bg-bg-secondary rounded-xl p-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="bg-[#0a0a0a] rounded-lg border border-border mx-auto"
          aria-label="Single ray visualization showing ray casting from player to wall"
          role="img"
        />
        <div className="flex-1 space-y-4">
          <div>
            <label htmlFor="single-ray-angle" className="block text-sm text-text-secondary mb-2">
              Ray Angle: {((rayAngle * 180) / Math.PI).toFixed(1)}°
            </label>
            <input
              id="single-ray-angle"
              type="range"
              min={-Math.PI}
              max={Math.PI}
              step={0.01}
              value={rayAngle}
              onChange={(e) => setRayAngle(parseFloat(e.target.value))}
              className="w-full accent-accent"
              aria-label={`Ray angle: ${((rayAngle * 180) / Math.PI).toFixed(1)} degrees`}
            />
          </div>
          <div className="bg-bg-card p-4 rounded-lg">
            <h4 className="font-bold text-white mb-2 flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-accent" />
              How It Works
            </h4>
            <ul className="text-sm text-text-secondary space-y-1">
              <li>• Ray starts from player position</li>
              <li>• Extends in direction of angle</li>
              <li>• Stops when it hits a wall</li>
              <li>• Returns distance and hit info</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== DEMO 2: DDA STEP-THROUGH ==============
export function DDADemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rayAngle, setRayAngle] = useState(0.4);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const player: Player = { x: 2.5, y: 5.5, angle: 0 };

  const simpleMap = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 2, 2, 0, 0, 1],
    [1, 0, 0, 2, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ];

  const { steps } = castRayWithSteps(player, rayAngle, simpleMap);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    const cellSize = Math.min(width, height) / simpleMap.length;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= simpleMap.length; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(width, i * cellSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, height);
      ctx.stroke();
    }

    // Draw walls
    for (let y = 0; y < simpleMap.length; y++) {
      for (let x = 0; x < simpleMap[y].length; x++) {
        const cell = simpleMap[y][x];
        if (cell > 0) {
          ctx.fillStyle = WALL_COLORS[cell] || '#666';
          ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
        }
      }
    }

    // Draw DDA steps up to current step
    const currentStep = Math.min(step, steps.length - 1);
    for (let i = 0; i <= currentStep; i++) {
      const s = steps[i];
      if (s.hit) {
        ctx.fillStyle = 'rgba(225, 112, 85, 0.5)';
      } else {
        ctx.fillStyle = 'rgba(0, 184, 148, 0.3)';
      }
      ctx.fillRect(s.x * cellSize + 2, s.y * cellSize + 2, cellSize - 4, cellSize - 4);

      // Step number
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(String(i), s.x * cellSize + cellSize / 2 - 4, s.y * cellSize + cellSize / 2 + 4);
    }

    // Draw ray line to current cell
    const currentCell = steps[currentStep];
    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x * cellSize, player.y * cellSize);
    ctx.lineTo((currentCell.x + 0.5) * cellSize, (currentCell.y + 0.5) * cellSize);
    ctx.stroke();

    // Draw player
    ctx.fillStyle = '#6c5ce7';
    ctx.beginPath();
    ctx.arc(player.x * cellSize, player.y * cellSize, 8, 0, Math.PI * 2);
    ctx.fill();

    // Info
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(`Step: ${currentStep + 1} / ${steps.length}`, 10, 20);
    if (currentCell) {
      ctx.fillText(`Cell: (${currentCell.x}, ${currentCell.y})`, 10, 36);
    }
  }, [step, steps, rayAngle]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const animate = (time: number) => {
      if (time - lastTimeRef.current > 400) {
        setStep((s) => {
          if (s >= steps.length - 1) {
            setIsPlaying(false);
            return s;
          }
          return s + 1;
        });
        lastTimeRef.current = time;
      }
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, steps.length]);

  return (
    <div className="bg-bg-secondary rounded-xl p-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="bg-[#0a0a0a] rounded-lg border border-border mx-auto"
          aria-label="DDA algorithm step-through visualization showing how the ray steps through grid cells"
          role="img"
        />
        <div className="flex-1 space-y-4">
          <div>
            <label htmlFor="dda-ray-direction" className="block text-sm text-text-secondary mb-2">
              Ray Direction: {((rayAngle * 180) / Math.PI).toFixed(1)}°
            </label>
            <input
              id="dda-ray-direction"
              type="range"
              min={-Math.PI / 2}
              max={Math.PI / 2}
              step={0.01}
              value={rayAngle}
              onChange={(e) => {
                setRayAngle(parseFloat(e.target.value));
                setStep(0);
              }}
              className="w-full accent-accent"
              aria-label={`Ray direction: ${((rayAngle * 180) / Math.PI).toFixed(1)} degrees`}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex-1 btn btn-primary flex items-center justify-center gap-2"
              aria-label={isPlaying ? 'Pause DDA animation' : 'Play DDA animation'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => {
                setStep(0);
                setIsPlaying(false);
              }}
              className="btn bg-bg-card border border-border"
              aria-label="Reset DDA animation to beginning"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label htmlFor="dda-step-slider" className="block text-sm text-text-secondary mb-2">
              Step: {step + 1} / {steps.length}
            </label>
            <input
              id="dda-step-slider"
              type="range"
              min={0}
              max={steps.length - 1}
              value={step}
              onChange={(e) => {
                setStep(parseInt(e.target.value));
                setIsPlaying(false);
              }}
              className="w-full accent-accent"
              aria-label={`DDA step ${step + 1} of ${steps.length}`}
            />
          </div>
          <div className="bg-bg-card p-4 rounded-lg">
            <h4 className="font-bold text-white mb-2 flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-accent" />
              DDA Algorithm
            </h4>
            <p className="text-sm text-text-secondary">
              Digital Differential Analyzer steps through grid cells one at a time,
              choosing to step in X or Y based on which boundary is closer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== DEMO 3: FISHEYE COMPARISON ==============
export function FisheyeDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [corrected, setCorrected] = useState(true);
  const [fov, setFov] = useState(60);

  const player: Player = { x: 4.5, y: 4.5, angle: 0 };

  const simpleMap = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    const fovRad = (fov * Math.PI) / 180;
    const numRays = width;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height / 2);
    ctx.fillStyle = '#2d2d44';
    ctx.fillRect(0, height / 2, width, height / 2);

    for (let x = 0; x < numRays; x++) {
      const rayAngle = player.angle - fovRad / 2 + (x / numRays) * fovRad;
      const hit = castRay(player, rayAngle, simpleMap);

      let distance = hit.distance;

      // Apply fisheye correction
      if (corrected) {
        distance = distance * Math.cos(rayAngle - player.angle);
      }

      const lineHeight = Math.min(height, height / distance);
      const drawStart = (height - lineHeight) / 2;

      // Color based on distance
      const shade = Math.max(0, 1 - distance / 10);
      const baseColor = hit.side === 0 ? [100, 92, 231] : [80, 72, 200];
      ctx.fillStyle = `rgb(${Math.floor(baseColor[0] * shade)}, ${Math.floor(baseColor[1] * shade)}, ${Math.floor(baseColor[2] * shade)})`;
      ctx.fillRect(x, drawStart, 1, lineHeight);
    }

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText(corrected ? 'Fisheye CORRECTED' : 'Fisheye (curved walls)', 10, 25);
  }, [corrected, fov]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="bg-bg-secondary rounded-xl p-6">
      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        className="w-full bg-[#0a0a0a] rounded-lg border border-border mb-4"
        aria-label={`Fisheye comparison: ${corrected ? 'corrected view (flat walls)' : 'uncorrected view (curved walls)'}`}
        role="img"
      />
      <div className="flex flex-col sm:flex-row gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={corrected}
            onChange={(e) => setCorrected(e.target.checked)}
            className="accent-accent w-4 h-4"
            aria-label="Toggle fisheye correction"
          />
          <span className="text-white">Apply Fisheye Correction</span>
        </label>
        <div className="flex-1">
          <label htmlFor="fisheye-fov" className="text-sm text-text-secondary">FOV: {fov}°</label>
          <input
            id="fisheye-fov"
            type="range"
            min={30}
            max={120}
            value={fov}
            onChange={(e) => setFov(parseInt(e.target.value))}
            className="w-full accent-accent"
            aria-label={`Field of view: ${fov} degrees`}
          />
        </div>
      </div>
      <p className="text-sm text-text-secondary mt-4">
        Toggle the correction to see how walls curve when using Euclidean distance vs perpendicular distance.
        The fisheye effect becomes more pronounced at wider FOV angles.
      </p>
    </div>
  );
}

// ============== DEMO 4: TEXTURE MAPPING VISUALIZER ==============
export function TextureMappingDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wallCanvasRef = useRef<HTMLCanvasElement>(null);
  const [wallX, setWallX] = useState(0.3);
  const [distance, setDistance] = useState(3);

  const draw = useCallback(() => {
    // Draw texture preview
    const wallCanvas = wallCanvasRef.current;
    if (wallCanvas) {
      const ctx = wallCanvas.getContext('2d')!;
      const size = 128;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, size, size);

      // Draw brick texture
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#922b21';
      ctx.lineWidth = 2;
      for (let y = 0; y < size; y += 16) {
        const offset = (Math.floor(y / 16) % 2) * 24;
        for (let x = offset; x < size; x += 48) {
          ctx.strokeRect(x, y, 48, 16);
        }
      }

      // Draw selection line
      const texX = Math.floor(wallX * size);
      ctx.strokeStyle = '#00b894';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(texX, 0);
      ctx.lineTo(texX, size);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(`texX = ${texX}`, 5, 15);
    }

    // Draw wall column
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height / 2);
      ctx.fillStyle = '#2d2d44';
      ctx.fillRect(0, height / 2, width, height / 2);

      // Draw wall strip
      const lineHeight = Math.min(height * 2, height / distance);
      const drawStart = (height - lineHeight) / 2;

      const shade = Math.max(0.3, 1 - distance / 10);

      // Simulate textured column
      const texSize = 64;
      const texX = Math.floor(wallX * texSize);
      for (let y = 0; y < lineHeight; y++) {
        const texY = Math.floor((y / lineHeight) * texSize);
        // Simple brick pattern
        const isMortar = texY % 16 < 2 || (texX + (Math.floor(texY / 16) % 2) * 24) % 48 < 2;
        const baseR = isMortar ? 146 : 192;
        const baseG = isMortar ? 43 : 57;
        const baseB = isMortar ? 33 : 43;
        ctx.fillStyle = `rgb(${Math.floor(baseR * shade)}, ${Math.floor(baseG * shade)}, ${Math.floor(baseB * shade)})`;
        ctx.fillRect(width / 2 - 30, drawStart + y, 60, 1);
      }

      // Labels
      ctx.fillStyle = '#fff';
      ctx.font = '14px monospace';
      ctx.fillText(`Wall Column at wallX=${wallX.toFixed(2)}`, 10, 25);
      ctx.fillText(`Distance: ${distance.toFixed(1)}`, 10, 45);
    }
  }, [wallX, distance]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="bg-bg-secondary rounded-xl p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-white font-bold mb-2 flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" />
            Texture Source
          </h4>
          <canvas
            ref={wallCanvasRef}
            width={128}
            height={128}
            className="bg-[#0a0a0a] rounded-lg border border-border"
            aria-label="Brick texture with vertical selection line showing which texel column will be sampled"
            role="img"
          />
        </div>
        <div>
          <h4 className="text-white font-bold mb-2 flex items-center gap-2">
            <Box className="w-4 h-4 text-accent" />
            Rendered Column
          </h4>
          <canvas
            ref={canvasRef}
            width={200}
            height={200}
            className="bg-[#0a0a0a] rounded-lg border border-border"
            aria-label={`Rendered wall column at wallX ${wallX.toFixed(2)}, distance ${distance.toFixed(1)}`}
            role="img"
          />
        </div>
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="texture-wallx" className="text-sm text-text-secondary">
            wallX (hit position): {wallX.toFixed(2)}
          </label>
          <input
            id="texture-wallx"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={wallX}
            onChange={(e) => setWallX(parseFloat(e.target.value))}
            className="w-full accent-accent"
            aria-label={`Wall X position: ${wallX.toFixed(2)}`}
          />
        </div>
        <div>
          <label htmlFor="texture-distance" className="text-sm text-text-secondary">
            Distance: {distance.toFixed(1)}
          </label>
          <input
            id="texture-distance"
            type="range"
            min={0.5}
            max={10}
            step={0.1}
            value={distance}
            onChange={(e) => setDistance(parseFloat(e.target.value))}
            className="w-full accent-accent"
            aria-label={`Distance: ${distance.toFixed(1)} units`}
          />
        </div>
      </div>
    </div>
  );
}

// ============== MAIN WOLFENSTEIN RENDERER ==============
export default function WolfensteinRenderer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState<Player>({ x: 8, y: 8, angle: 0 });
  const [fov, setFov] = useState(60);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showFog, setShowFog] = useState(true);
  const [showSprites, setShowSprites] = useState(true);
  const [keysPressed, setKeysPressed] = useState<Set<string>>(new Set<string>());
  const texturesRef = useRef<Map<number, ImageData>>(new Map<number, ImageData>());
  const animRef = useRef<number>(0);
  const touchRef = useRef<{ active: boolean; startX: number; startY: number; moveX: number; moveY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    moveX: 0,
    moveY: 0,
  });

  const map = DEFAULT_MAP;
  const sprites = DEFAULT_SPRITES;

  // Generate textures on mount
  useEffect(() => {
    for (let i = 1; i <= 4; i++) {
      texturesRef.current.set(i, generateTexture(i));
    }
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        setKeysPressed((prev) => new Set(prev).add(key));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setKeysPressed((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle touch input for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      touchRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        moveX: 0,
        moveY: 0,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchRef.current.active && e.touches.length > 0) {
      const touch = e.touches[0];
      touchRef.current.moveX = touch.clientX - touchRef.current.startX;
      touchRef.current.moveY = touch.clientY - touchRef.current.startY;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchRef.current = {
      active: false,
      startX: 0,
      startY: 0,
      moveX: 0,
      moveY: 0,
    };
  }, []);

  // Game loop
  useEffect(() => {
    const update = () => {
      setPlayer((p) => {
        let { x, y, angle } = p;
        const moveDir = { x: 0, y: 0 };

        // Keyboard movement
        if (keysPressed.has('w') || keysPressed.has('arrowup')) {
          moveDir.x += Math.cos(angle) * MOVE_SPEED;
          moveDir.y += Math.sin(angle) * MOVE_SPEED;
        }
        if (keysPressed.has('s') || keysPressed.has('arrowdown')) {
          moveDir.x -= Math.cos(angle) * MOVE_SPEED;
          moveDir.y -= Math.sin(angle) * MOVE_SPEED;
        }

        // Keyboard rotation
        if (keysPressed.has('a') || keysPressed.has('arrowleft')) {
          angle -= ROT_SPEED;
        }
        if (keysPressed.has('d') || keysPressed.has('arrowright')) {
          angle += ROT_SPEED;
        }

        // Touch input - virtual joystick style
        if (touchRef.current.active) {
          const deadzone = 20;
          const maxDist = 100;
          const { moveX, moveY } = touchRef.current;
          
          // Horizontal touch = rotation
          if (Math.abs(moveX) > deadzone) {
            const rotAmount = clamp(moveX / maxDist, -1, 1) * ROT_SPEED * 1.5;
            angle += rotAmount;
          }
          
          // Vertical touch = forward/backward
          if (Math.abs(moveY) > deadzone) {
            const moveAmount = clamp(-moveY / maxDist, -1, 1) * MOVE_SPEED;
            moveDir.x += Math.cos(angle) * moveAmount;
            moveDir.y += Math.sin(angle) * moveAmount;
          }
        }

        // Apply movement with collision
        const newX = x + moveDir.x;
        const newY = y + moveDir.y;
        const margin = 0.2;

        // Check X movement
        if (map[Math.floor(y)][Math.floor(newX + margin * Math.sign(moveDir.x))] === 0) {
          x = newX;
        }
        // Check Y movement
        if (map[Math.floor(newY + margin * Math.sign(moveDir.y))][Math.floor(x)] === 0) {
          y = newY;
        }

        return { x, y, angle: normalizeAngle(angle) };
      });

      animRef.current = requestAnimationFrame(update);
    };

    animRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animRef.current);
  }, [keysPressed, map]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    const fovRad = (fov * Math.PI) / 180;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height / 2);
    skyGradient.addColorStop(0, '#0a0a1a');
    skyGradient.addColorStop(1, '#1a1a3a');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height / 2);

    // Floor gradient
    const floorGradient = ctx.createLinearGradient(0, height / 2, 0, height);
    floorGradient.addColorStop(0, '#2d2d44');
    floorGradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, height / 2, width, height / 2);

    // Z-buffer for sprites
    const zBuffer: number[] = [];

    // Cast rays
    const numRays = width;
    for (let x = 0; x < numRays; x++) {
      const rayAngle = player.angle - fovRad / 2 + (x / numRays) * fovRad;
      const hit = castRay(player, rayAngle, map);

      // Fisheye correction
      const correctedDist = hit.distance * Math.cos(rayAngle - player.angle);
      zBuffer[x] = correctedDist;

      const lineHeight = Math.min(height * 2, height / correctedDist);
      const drawStart = (height - lineHeight) / 2;

      // Texture mapping
      const texture = texturesRef.current.get(hit.textureId);
      const texWidth = 64;
      const texX = Math.floor(hit.wallX * texWidth);

      // Fog effect
      const fogFactor = showFog ? Math.max(0, 1 - correctedDist / 12) : 1;

      // Draw textured column
      if (texture) {
        for (let y = 0; y < lineHeight; y++) {
          const screenY = Math.floor(drawStart + y);
          if (screenY < 0 || screenY >= height) continue;

          const texY = Math.floor((y / lineHeight) * texWidth);
          const texIndex = (texY * texWidth + texX) * 4;

          let r = texture.data[texIndex];
          let g = texture.data[texIndex + 1];
          let b = texture.data[texIndex + 2];

          // Side shading
          if (hit.side === 1) {
            r = Math.floor(r * 0.7);
            g = Math.floor(g * 0.7);
            b = Math.floor(b * 0.7);
          }

          // Apply fog
          r = Math.floor(r * fogFactor);
          g = Math.floor(g * fogFactor);
          b = Math.floor(b * fogFactor);

          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, screenY, 1, 1);
        }
      } else {
        // Fallback solid color
        const shade = fogFactor * (hit.side === 0 ? 1 : 0.7);
        const baseColor = WALL_COLORS[hit.textureId] || '#666';
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = shade;
        ctx.fillRect(x, drawStart, 1, lineHeight);
        ctx.globalAlpha = 1;
      }
    }

    // Render sprites
    if (showSprites) {
      // Sort sprites by distance (far to near)
      const sortedSprites = sprites
        .map((s) => ({
          ...s,
          dist: (player.x - s.x) ** 2 + (player.y - s.y) ** 2,
        }))
        .sort((a, b) => b.dist - a.dist);

      for (const sprite of sortedSprites) {
        // Translate sprite position relative to player
        const spriteX = sprite.x - player.x;
        const spriteY = sprite.y - player.y;

        // Transform with inverse camera matrix
        const invDet = 1.0 / (Math.cos(player.angle - Math.PI / 2) * Math.sin(player.angle) -
          Math.cos(player.angle) * Math.sin(player.angle - Math.PI / 2));

        const transformX = invDet * (Math.sin(player.angle) * spriteX - Math.cos(player.angle) * spriteY);
        const transformY = invDet * (-Math.sin(player.angle - Math.PI / 2) * spriteX +
          Math.cos(player.angle - Math.PI / 2) * spriteY);

        if (transformY <= 0) continue; // Behind camera

        const spriteScreenX = Math.floor((width / 2) * (1 + transformX / transformY));
        const spriteHeight = Math.abs(Math.floor(height / transformY));
        const spriteWidth = spriteHeight;

        const drawStartX = Math.floor(spriteScreenX - spriteWidth / 2);
        const drawEndX = drawStartX + spriteWidth;
        const drawStartY = Math.floor((height - spriteHeight) / 2);

        // Sprite colors
        const spriteColors: Record<string, string> = {
          barrel: '#8B4513',
          pillar: '#708090',
          lamp: '#FFD700',
          enemy: '#e17055',
        };

        for (let x = drawStartX; x < drawEndX; x++) {
          if (x < 0 || x >= width) continue;
          if (transformY >= zBuffer[x]) continue; // Behind wall

          const texX = ((x - drawStartX) / spriteWidth);
          // Simple sprite rendering (circular shape)
          const centerX = 0.5;
          const distFromCenter = Math.abs(texX - centerX) * 2;
          if (distFromCenter > 1) continue;

          const columnHeight = spriteHeight * Math.sqrt(1 - distFromCenter * distFromCenter);
          const columnStart = (height - columnHeight) / 2;

          const fogFactor = showFog ? Math.max(0.2, 1 - Math.sqrt(sprite.dist) / 10) : 1;
          const color = spriteColors[sprite.type] || '#fff';

          ctx.fillStyle = color;
          ctx.globalAlpha = fogFactor;
          ctx.fillRect(x, columnStart, 1, columnHeight);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Draw minimap
    if (showMinimap) {
      const minimap = minimapRef.current;
      if (minimap) {
        const mctx = minimap.getContext('2d')!;
        const mw = minimap.width;
        const mh = minimap.height;
        const cellSize = mw / map[0].length;

        mctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
        mctx.fillRect(0, 0, mw, mh);

        // Draw map cells
        for (let y = 0; y < map.length; y++) {
          for (let x = 0; x < map[y].length; x++) {
            if (map[y][x] > 0) {
              mctx.fillStyle = WALL_COLORS[map[y][x]] || '#666';
              mctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1);
            }
          }
        }

        // Draw sprites on minimap
        if (showSprites) {
          for (const sprite of sprites) {
            const spriteColors: Record<string, string> = {
              barrel: '#8B4513',
              pillar: '#708090',
              lamp: '#FFD700',
              enemy: '#e17055',
            };
            mctx.fillStyle = spriteColors[sprite.type] || '#fff';
            mctx.beginPath();
            mctx.arc(sprite.x * cellSize, sprite.y * cellSize, 3, 0, Math.PI * 2);
            mctx.fill();
          }
        }

        // Draw player
        mctx.fillStyle = '#6c5ce7';
        mctx.beginPath();
        mctx.arc(player.x * cellSize, player.y * cellSize, 4, 0, Math.PI * 2);
        mctx.fill();

        // Draw FOV cone
        mctx.strokeStyle = 'rgba(0, 184, 148, 0.5)';
        mctx.lineWidth = 1;
        mctx.beginPath();
        mctx.moveTo(player.x * cellSize, player.y * cellSize);
        mctx.lineTo(
          player.x * cellSize + Math.cos(player.angle - fovRad / 2) * 50,
          player.y * cellSize + Math.sin(player.angle - fovRad / 2) * 50
        );
        mctx.moveTo(player.x * cellSize, player.y * cellSize);
        mctx.lineTo(
          player.x * cellSize + Math.cos(player.angle + fovRad / 2) * 50,
          player.y * cellSize + Math.sin(player.angle + fovRad / 2) * 50
        );
        mctx.stroke();

        // Draw a few rays
        mctx.strokeStyle = 'rgba(0, 184, 148, 0.2)';
        for (let i = 0; i < 20; i++) {
          const rayAngle = player.angle - fovRad / 2 + (i / 19) * fovRad;
          const hit = castRay(player, rayAngle, map, 10);
          mctx.beginPath();
          mctx.moveTo(player.x * cellSize, player.y * cellSize);
          mctx.lineTo(
            player.x * cellSize + Math.cos(rayAngle) * hit.distance * cellSize,
            player.y * cellSize + Math.sin(rayAngle) * hit.distance * cellSize
          );
          mctx.stroke();
        }
      }
    }

    // Controls hint
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, height - 35, 200, 25);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText('WASD / Arrows to move', 15, height - 18);
  }, [player, fov, showMinimap, showFog, showSprites, map, sprites]);

  return (
    <div className="bg-bg-secondary rounded-xl p-6">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          className="w-full bg-[#0a0a0a] rounded-lg border border-border touch-none"
          tabIndex={0}
          aria-label="Wolfenstein-style 3D raycasting view. Use WASD or arrow keys to move, or touch and drag on mobile."
          role="application"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
        {showMinimap && (
          <canvas
            ref={minimapRef}
            width={160}
            height={160}
            className="absolute top-2 right-2 rounded border border-border/50"
            aria-label="Minimap showing player position and dungeon layout"
            role="img"
          />
        )}
        {/* Mobile touch hint */}
        <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-white/60 bg-black/40 rounded px-2 py-1 sm:hidden">
          Touch and drag: horizontal = rotate, vertical = move
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="fov-slider" className="text-sm text-text-secondary flex items-center gap-2">
            <Eye className="w-4 h-4" />
            FOV: {fov}°
          </label>
          <input
            id="fov-slider"
            type="range"
            min={30}
            max={120}
            value={fov}
            onChange={(e) => setFov(parseInt(e.target.value))}
            className="w-full accent-accent"
            aria-label={`Field of view: ${fov} degrees`}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showMinimap}
            onChange={(e) => setShowMinimap(e.target.checked)}
            className="accent-accent w-4 h-4"
            aria-label="Toggle minimap visibility"
          />
          <MapIcon className="w-4 h-4 text-text-secondary" />
          <span className="text-white">Minimap</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showFog}
            onChange={(e) => setShowFog(e.target.checked)}
            className="accent-accent w-4 h-4"
            aria-label="Toggle distance fog effect"
          />
          <Layers className="w-4 h-4 text-text-secondary" />
          <span className="text-white">Distance Fog</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showSprites}
            onChange={(e) => setShowSprites(e.target.checked)}
            className="accent-accent w-4 h-4"
            aria-label="Toggle sprite rendering"
          />
          <Box className="w-4 h-4 text-text-secondary" />
          <span className="text-white">Sprites</span>
        </label>
      </div>

      <div className="mt-4 p-4 bg-bg-card rounded-lg">
        <h4 className="font-bold text-white mb-2 flex items-center gap-2">
          <Compass className="w-4 h-4 text-accent" />
          Player Position
        </h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-text-secondary">X: </span>
            <span className="text-white font-mono">{player.x.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-text-secondary">Y: </span>
            <span className="text-white font-mono">{player.y.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-text-secondary">Angle: </span>
            <span className="text-white font-mono">{((player.angle * 180) / Math.PI).toFixed(1)}°</span>
          </div>
        </div>
      </div>

      {/* Mobile D-Pad Controls */}
      <div className="mt-4 sm:hidden">
        <p className="text-xs text-text-secondary mb-2 text-center">Touch Controls</p>
        <div className="flex justify-center">
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Movement controls">
            <div></div>
            <button
              className="w-14 h-14 bg-bg-card border border-border rounded-lg flex items-center justify-center active:bg-accent/30 touch-none"
              onTouchStart={() => setKeysPressed(prev => new Set(prev).add('w'))}
              onTouchEnd={() => setKeysPressed(prev => { const next = new Set(prev); next.delete('w'); return next; })}
              aria-label="Move forward"
            >
              <ChevronRight className="w-6 h-6 text-white -rotate-90" />
            </button>
            <div></div>
            <button
              className="w-14 h-14 bg-bg-card border border-border rounded-lg flex items-center justify-center active:bg-accent/30 touch-none"
              onTouchStart={() => setKeysPressed(prev => new Set(prev).add('a'))}
              onTouchEnd={() => setKeysPressed(prev => { const next = new Set(prev); next.delete('a'); return next; })}
              aria-label="Rotate left"
            >
              <ChevronRight className="w-6 h-6 text-white rotate-180" />
            </button>
            <div className="w-14 h-14 bg-bg-card/50 border border-border/50 rounded-lg flex items-center justify-center">
              <Move className="w-5 h-5 text-text-secondary" />
            </div>
            <button
              className="w-14 h-14 bg-bg-card border border-border rounded-lg flex items-center justify-center active:bg-accent/30 touch-none"
              onTouchStart={() => setKeysPressed(prev => new Set(prev).add('d'))}
              onTouchEnd={() => setKeysPressed(prev => { const next = new Set(prev); next.delete('d'); return next; })}
              aria-label="Rotate right"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
            <div></div>
            <button
              className="w-14 h-14 bg-bg-card border border-border rounded-lg flex items-center justify-center active:bg-accent/30 touch-none"
              onTouchStart={() => setKeysPressed(prev => new Set(prev).add('s'))}
              onTouchEnd={() => setKeysPressed(prev => { const next = new Set(prev); next.delete('s'); return next; })}
              aria-label="Move backward"
            >
              <ChevronRight className="w-6 h-6 text-white rotate-90" />
            </button>
            <div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
