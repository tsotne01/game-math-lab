import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Grid3X3, TreeDeciduous, Zap, Eye, EyeOff, Gauge, Activity, Box, Circle, Layers, GitBranch } from 'lucide-react';

// ============== TYPES ==============
interface Vec2 {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  id: number;
}

interface GridCell {
  particles: Particle[];
}

interface QuadTreeNode {
  x: number;
  y: number;
  width: number;
  height: number;
  particles: Particle[];
  children: QuadTreeNode[] | null;
  depth: number;
}

// ============== CONSTANTS ==============
const COLORS = ['#00b894', '#6c5ce7', '#e17055', '#74b9ff', '#fdcb6e', '#fd79a8', '#00cec9', '#a29bfe'];

// ============== UTILITY FUNCTIONS ==============
function distance(a: Particle, b: Particle): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function checkCircleCollision(a: Particle, b: Particle): boolean {
  return distance(a, b) < a.radius + b.radius;
}

function resolveCollision(a: Particle, b: Particle): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist === 0) return;
  
  // Normal vector
  const nx = dx / dist;
  const ny = dy / dist;
  
  // Relative velocity
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  
  // Relative velocity along normal
  const dvn = dvx * nx + dvy * ny;
  
  // Don't resolve if moving apart
  if (dvn > 0) return;
  
  // Impulse (equal mass)
  const impulse = dvn;
  
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
  
  // Separate particles
  const overlap = (a.radius + b.radius) - dist;
  if (overlap > 0) {
    a.x -= (overlap / 2) * nx;
    a.y -= (overlap / 2) * ny;
    b.x += (overlap / 2) * nx;
    b.y += (overlap / 2) * ny;
  }
}

// ============== QUADTREE IMPLEMENTATION ==============
const MAX_PARTICLES_PER_NODE = 4;
const MAX_DEPTH = 8;

function createQuadTree(x: number, y: number, width: number, height: number, depth: number = 0): QuadTreeNode {
  return {
    x,
    y,
    width,
    height,
    particles: [],
    children: null,
    depth
  };
}

function subdivide(node: QuadTreeNode): void {
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const newDepth = node.depth + 1;
  
  node.children = [
    createQuadTree(node.x, node.y, halfW, halfH, newDepth),           // NW
    createQuadTree(node.x + halfW, node.y, halfW, halfH, newDepth),   // NE
    createQuadTree(node.x, node.y + halfH, halfW, halfH, newDepth),   // SW
    createQuadTree(node.x + halfW, node.y + halfH, halfW, halfH, newDepth) // SE
  ];
}

function insertIntoQuadTree(node: QuadTreeNode, particle: Particle): void {
  // If we have children, insert into appropriate child
  if (node.children) {
    const midX = node.x + node.width / 2;
    const midY = node.y + node.height / 2;
    
    const west = particle.x < midX;
    const north = particle.y < midY;
    
    if (west && north) insertIntoQuadTree(node.children[0], particle);
    else if (!west && north) insertIntoQuadTree(node.children[1], particle);
    else if (west && !north) insertIntoQuadTree(node.children[2], particle);
    else insertIntoQuadTree(node.children[3], particle);
    return;
  }
  
  // Add to this node
  node.particles.push(particle);
  
  // Subdivide if needed
  if (node.particles.length > MAX_PARTICLES_PER_NODE && node.depth < MAX_DEPTH) {
    subdivide(node);
    
    // Move particles to children
    for (const p of node.particles) {
      const midX = node.x + node.width / 2;
      const midY = node.y + node.height / 2;
      
      const west = p.x < midX;
      const north = p.y < midY;
      
      if (west && north) node.children![0].particles.push(p);
      else if (!west && north) node.children![1].particles.push(p);
      else if (west && !north) node.children![2].particles.push(p);
      else node.children![3].particles.push(p);
    }
    
    node.particles = [];
  }
}

function queryQuadTree(node: QuadTreeNode, x: number, y: number, radius: number, results: Particle[]): void {
  // Check if query circle intersects this node
  const closestX = Math.max(node.x, Math.min(x, node.x + node.width));
  const closestY = Math.max(node.y, Math.min(y, node.y + node.height));
  const dx = x - closestX;
  const dy = y - closestY;
  
  if (dx * dx + dy * dy > radius * radius) {
    return; // No intersection
  }
  
  // Add particles from this node
  for (const p of node.particles) {
    results.push(p);
  }
  
  // Query children
  if (node.children) {
    for (const child of node.children) {
      queryQuadTree(child, x, y, radius, results);
    }
  }
}

// ============== GRID IMPLEMENTATION ==============
function createGrid(width: number, height: number, cellSize: number): Map<string, Particle[]> {
  return new Map();
}

function getCellKey(x: number, y: number, cellSize: number): string {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  return `${cx},${cy}`;
}

function insertIntoGrid(grid: Map<string, Particle[]>, particle: Particle, cellSize: number): void {
  const key = getCellKey(particle.x, particle.y, cellSize);
  if (!grid.has(key)) {
    grid.set(key, []);
  }
  grid.get(key)!.push(particle);
}

function getNeighborCells(x: number, y: number, cellSize: number): string[] {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  const keys: string[] = [];
  
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      keys.push(`${cx + dx},${cy + dy}`);
    }
  }
  
  return keys;
}

// ============== MAIN COMPONENT ==============
export default function CollisionOptimizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [particleCount, setParticleCount] = useState(500);
  const [speed, setSpeed] = useState(3);
  const [method, setMethod] = useState<'naive' | 'grid' | 'quadtree'>('naive');
  const [showVisualization, setShowVisualization] = useState(true);
  const [fps, setFps] = useState(60);
  const [collisionChecks, setCollisionChecks] = useState(0);
  const [actualCollisions, setActualCollisions] = useState(0);
  
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const fpsHistoryRef = useRef<number[]>([]);
  
  const initParticles = useCallback((count: number, width: number, height: number) => {
    const particles: Particle[] = [];
    const radius = Math.max(4, Math.min(8, 2000 / count));
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.5 + Math.random() * 0.5);
      particles.push({
        x: radius + Math.random() * (width - radius * 2),
        y: radius + Math.random() * (height - radius * 2),
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        radius,
        color: COLORS[i % COLORS.length],
        id: i
      });
    }
    
    return particles;
  }, [speed]);
  
  const reset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    particlesRef.current = initParticles(particleCount, canvas.width, canvas.height);
    fpsHistoryRef.current = [];
  }, [particleCount, initParticles]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Initialize particles
    if (particlesRef.current.length !== particleCount) {
      particlesRef.current = initParticles(particleCount, width, height);
    }
    
    let animationId: number;
    
    const update = () => {
      if (!isRunning) {
        animationId = requestAnimationFrame(update);
        return;
      }
      
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      
      // Calculate FPS
      const currentFps = 1000 / delta;
      fpsHistoryRef.current.push(currentFps);
      if (fpsHistoryRef.current.length > 30) {
        fpsHistoryRef.current.shift();
      }
      const avgFps = fpsHistoryRef.current.reduce((a, b) => a + b, 0) / fpsHistoryRef.current.length;
      
      if (frameRef.current % 10 === 0) {
        setFps(Math.round(avgFps));
      }
      
      const particles = particlesRef.current;
      let checks = 0;
      let collisions = 0;
      
      // Update positions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        
        // Bounce off walls
        if (p.x - p.radius < 0) { p.x = p.radius; p.vx *= -1; }
        if (p.x + p.radius > width) { p.x = width - p.radius; p.vx *= -1; }
        if (p.y - p.radius < 0) { p.y = p.radius; p.vy *= -1; }
        if (p.y + p.radius > height) { p.y = height - p.radius; p.vy *= -1; }
      }
      
      // Collision detection based on method
      const cellSize = particles[0]?.radius * 4 || 32;
      let grid: Map<string, Particle[]> | null = null;
      let quadTree: QuadTreeNode | null = null;
      
      if (method === 'naive') {
        // O(n²) - check every pair
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            checks++;
            if (checkCircleCollision(particles[i], particles[j])) {
              resolveCollision(particles[i], particles[j]);
              collisions++;
            }
          }
        }
      } else if (method === 'grid') {
        // Spatial hashing
        grid = new Map();
        for (const p of particles) {
          insertIntoGrid(grid, p, cellSize);
        }
        
        const checked = new Set<string>();
        
        for (const p of particles) {
          const neighborKeys = getNeighborCells(p.x, p.y, cellSize);
          
          for (const key of neighborKeys) {
            const cell = grid.get(key);
            if (!cell) continue;
            
            for (const other of cell) {
              if (p.id >= other.id) continue;
              
              const pairKey = `${Math.min(p.id, other.id)}-${Math.max(p.id, other.id)}`;
              if (checked.has(pairKey)) continue;
              checked.add(pairKey);
              
              checks++;
              if (checkCircleCollision(p, other)) {
                resolveCollision(p, other);
                collisions++;
              }
            }
          }
        }
      } else if (method === 'quadtree') {
        // Quadtree
        quadTree = createQuadTree(0, 0, width, height);
        for (const p of particles) {
          insertIntoQuadTree(quadTree, p);
        }
        
        const checked = new Set<string>();
        
        for (const p of particles) {
          const nearby: Particle[] = [];
          queryQuadTree(quadTree, p.x, p.y, p.radius * 4, nearby);
          
          for (const other of nearby) {
            if (p.id >= other.id) continue;
            
            const pairKey = `${Math.min(p.id, other.id)}-${Math.max(p.id, other.id)}`;
            if (checked.has(pairKey)) continue;
            checked.add(pairKey);
            
            checks++;
            if (checkCircleCollision(p, other)) {
              resolveCollision(p, other);
              collisions++;
            }
          }
        }
      }
      
      if (frameRef.current % 10 === 0) {
        setCollisionChecks(checks);
        setActualCollisions(collisions);
      }
      
      // Render
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);
      
      // Draw visualization
      if (showVisualization) {
        if (method === 'grid' && grid) {
          ctx.strokeStyle = 'rgba(108, 92, 231, 0.3)';
          ctx.lineWidth = 1;
          
          const cols = Math.ceil(width / cellSize);
          const rows = Math.ceil(height / cellSize);
          
          for (let i = 0; i <= cols; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellSize, 0);
            ctx.lineTo(i * cellSize, height);
            ctx.stroke();
          }
          
          for (let i = 0; i <= rows; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * cellSize);
            ctx.lineTo(width, i * cellSize);
            ctx.stroke();
          }
          
          // Highlight cells with particles
          grid.forEach((cell, key) => {
            if (cell.length > 0) {
              const [cx, cy] = key.split(',').map(Number);
              ctx.fillStyle = `rgba(108, 92, 231, ${Math.min(0.4, cell.length * 0.1)})`;
              ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
            }
          });
        }
        
        if (method === 'quadtree' && quadTree) {
          const drawNode = (node: QuadTreeNode) => {
            const alpha = 0.2 + node.depth * 0.1;
            ctx.strokeStyle = `rgba(0, 184, 148, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(node.x, node.y, node.width, node.height);
            
            if (node.particles.length > 0) {
              ctx.fillStyle = `rgba(0, 184, 148, 0.1)`;
              ctx.fillRect(node.x, node.y, node.width, node.height);
            }
            
            if (node.children) {
              for (const child of node.children) {
                drawNode(child);
              }
            }
          };
          
          drawNode(quadTree);
        }
      }
      
      // Draw particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      
      frameRef.current++;
      animationId = requestAnimationFrame(update);
    };
    
    update();
    
    return () => cancelAnimationFrame(animationId);
  }, [isRunning, particleCount, method, showVisualization, initParticles]);
  
  // Update particle speeds when slider changes
  useEffect(() => {
    for (const p of particlesRef.current) {
      const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (currentSpeed > 0) {
        const factor = speed / currentSpeed;
        p.vx *= factor;
        p.vy *= factor;
      }
    }
  }, [speed]);
  
  const naiveChecks = particleCount * (particleCount - 1) / 2;
  const savedChecks = naiveChecks - collisionChecks;
  const savingsPercent = naiveChecks > 0 ? ((savedChecks / naiveChecks) * 100).toFixed(1) : '0';
  
  return (
    <div className="bg-bg-card rounded-xl p-4 sm:p-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-bg-primary rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-text-secondary text-xs mb-1">
            <Gauge className="w-3 h-3" />
            FPS
          </div>
          <div className={`text-xl font-bold ${fps >= 50 ? 'text-[#00b894]' : fps >= 30 ? 'text-[#fdcb6e]' : 'text-[#e17055]'}`}>
            {fps}
          </div>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-text-secondary text-xs mb-1">
            <Circle className="w-3 h-3" />
            Particles
          </div>
          <div className="text-xl font-bold text-white">{particleCount}</div>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-text-secondary text-xs mb-1">
            <Activity className="w-3 h-3" />
            Checks
          </div>
          <div className="text-xl font-bold text-[#6c5ce7]">{collisionChecks.toLocaleString()}</div>
        </div>
        
        <div className="bg-bg-primary rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-text-secondary text-xs mb-1">
            <Zap className="w-3 h-3" />
            Saved
          </div>
          <div className={`text-xl font-bold ${method === 'naive' ? 'text-text-secondary' : 'text-[#00b894]'}`}>
            {method === 'naive' ? '0%' : `${savingsPercent}%`}
          </div>
        </div>
      </div>
      
      {/* Method Selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setMethod('naive')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            method === 'naive'
              ? 'bg-[#e17055] text-white'
              : 'bg-bg-primary text-text-secondary hover:text-white'
          }`}
        >
          <Box className="w-4 h-4" />
          No Optimization
        </button>
        
        <button
          onClick={() => setMethod('grid')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            method === 'grid'
              ? 'bg-[#6c5ce7] text-white'
              : 'bg-bg-primary text-text-secondary hover:text-white'
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
          Spatial Grid
        </button>
        
        <button
          onClick={() => setMethod('quadtree')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            method === 'quadtree'
              ? 'bg-[#00b894] text-white'
              : 'bg-bg-primary text-text-secondary hover:text-white'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Quadtree
        </button>
      </div>
      
      {/* Canvas */}
      <div className="relative mb-4">
        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          className="w-full bg-bg-primary rounded-lg border border-white/10"
          style={{ imageRendering: 'pixelated' }}
        />
        
        {/* Method Info Overlay */}
        <div className="absolute top-2 left-2 bg-black/70 rounded px-2 py-1 text-xs">
          {method === 'naive' && (
            <span className="text-[#e17055]">
              Checking all {naiveChecks.toLocaleString()} pairs (N²)
            </span>
          )}
          {method === 'grid' && (
            <span className="text-[#6c5ce7]">
              Only checking neighbors in same/adjacent cells
            </span>
          )}
          {method === 'quadtree' && (
            <span className="text-[#00b894]">
              Querying tree for nearby particles
            </span>
          )}
        </div>
      </div>
      
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-text-secondary mb-2">
            Particle Count: {particleCount}
          </label>
          <input
            type="range"
            min="100"
            max="2000"
            step="100"
            value={particleCount}
            onChange={(e) => {
              setParticleCount(parseInt(e.target.value));
              const canvas = canvasRef.current;
              if (canvas) {
                particlesRef.current = initParticles(parseInt(e.target.value), canvas.width, canvas.height);
              }
            }}
            className="w-full accent-accent"
          />
        </div>
        
        <div>
          <label className="block text-sm text-text-secondary mb-2">
            Speed: {speed.toFixed(1)}
          </label>
          <input
            type="range"
            min="0.5"
            max="8"
            step="0.5"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      </div>
      
      {/* Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-bg-primary rounded-lg text-sm font-medium transition-colors"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
        
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 bg-bg-primary hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        
        <button
          onClick={() => setShowVisualization(!showVisualization)}
          className="flex items-center gap-2 px-4 py-2 bg-bg-primary hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showVisualization ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showVisualization ? 'Hide Structure' : 'Show Structure'}
        </button>
      </div>
    </div>
  );
}

// ============== GRID VISUALIZER DEMO ==============
export function GridVisualizerDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cellSize, setCellSize] = useState(60);
  const [mousePos, setMousePos] = useState<Vec2 | null>(null);
  const [showQueryRadius, setShowQueryRadius] = useState(true);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Fixed particles for demo
    const particles: Vec2[] = [
      { x: 100, y: 80 }, { x: 130, y: 120 }, { x: 180, y: 90 },
      { x: 250, y: 150 }, { x: 280, y: 180 }, { x: 320, y: 140 },
      { x: 400, y: 200 }, { x: 450, y: 220 }, { x: 500, y: 180 },
      { x: 150, y: 250 }, { x: 200, y: 280 }, { x: 350, y: 260 },
      { x: 550, y: 100 }, { x: 600, y: 150 }, { x: 650, y: 120 }
    ];
    
    const draw = () => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);
      
      // Draw grid
      ctx.strokeStyle = 'rgba(108, 92, 231, 0.3)';
      ctx.lineWidth = 1;
      
      const cols = Math.ceil(width / cellSize);
      const rows = Math.ceil(height / cellSize);
      
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, height);
        ctx.stroke();
      }
      
      for (let i = 0; i <= rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(width, i * cellSize);
        ctx.stroke();
      }
      
      // Highlight cells to check if mouse is present
      if (mousePos) {
        const cx = Math.floor(mousePos.x / cellSize);
        const cy = Math.floor(mousePos.y / cellSize);
        
        // Highlight 3x3 neighborhood
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
              const isCenter = dx === 0 && dy === 0;
              ctx.fillStyle = isCenter ? 'rgba(0, 184, 148, 0.3)' : 'rgba(108, 92, 231, 0.2)';
              ctx.fillRect(nx * cellSize, ny * cellSize, cellSize, cellSize);
            }
          }
        }
        
        // Draw query radius
        if (showQueryRadius) {
          ctx.beginPath();
          ctx.arc(mousePos.x, mousePos.y, cellSize * 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(253, 203, 110, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      
      // Draw particles
      for (const p of particles) {
        // Check if in highlighted area
        let inQuery = false;
        if (mousePos) {
          const cx = Math.floor(mousePos.x / cellSize);
          const cy = Math.floor(mousePos.y / cellSize);
          const px = Math.floor(p.x / cellSize);
          const py = Math.floor(p.y / cellSize);
          
          if (Math.abs(px - cx) <= 1 && Math.abs(py - cy) <= 1) {
            inQuery = true;
          }
        }
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = inQuery ? '#fdcb6e' : '#6c5ce7';
        ctx.fill();
        
        if (inQuery) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      
      // Draw mouse position marker
      if (mousePos) {
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = '#00b894';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00b894';
        ctx.fill();
      }
    };
    
    draw();
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      setMousePos({
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      });
    };
    
    const handleMouseLeave = () => setMousePos(null);
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [cellSize, mousePos, showQueryRadius]);
  
  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={700}
        height={350}
        className="w-full bg-bg-primary rounded-lg border border-white/10 cursor-crosshair"
      />
      
      <div className="mt-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-text-secondary mb-2">
            Cell Size: {cellSize}px
          </label>
          <input
            type="range"
            min="30"
            max="100"
            value={cellSize}
            onChange={(e) => setCellSize(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
        
        <button
          onClick={() => setShowQueryRadius(!showQueryRadius)}
          className="flex items-center gap-2 px-4 py-2 bg-bg-primary hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showQueryRadius ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          Query Radius
        </button>
      </div>
      
      <p className="text-sm text-text-secondary mt-3">
        Move your mouse over the canvas. Only particles in highlighted cells (3×3 neighborhood) need to be checked.
      </p>
    </div>
  );
}

// ============== QUADTREE VISUALIZER DEMO ==============
export function QuadtreeVisualizerDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [particles, setParticles] = useState<Vec2[]>([
    { x: 100, y: 80 }, { x: 130, y: 100 }, { x: 150, y: 70 }, { x: 160, y: 90 },
    { x: 300, y: 150 }, { x: 450, y: 200 }, { x: 500, y: 180 },
    { x: 200, y: 280 }, { x: 350, y: 260 }, { x: 550, y: 100 }
  ]);
  const [mousePos, setMousePos] = useState<Vec2 | null>(null);
  const [queryRadius, setQueryRadius] = useState(80);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Build quadtree
    const tree = createQuadTree(0, 0, width, height);
    for (const p of particles) {
      insertIntoQuadTree(tree, { ...p, vx: 0, vy: 0, radius: 8, color: '#6c5ce7', id: 0 } as Particle);
    }
    
    // Get query results
    const queryResults: Particle[] = [];
    if (mousePos) {
      queryQuadTree(tree, mousePos.x, mousePos.y, queryRadius, queryResults);
    }
    const querySet = new Set(queryResults.map(p => `${p.x},${p.y}`));
    
    const draw = () => {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);
      
      // Draw quadtree nodes
      const drawNode = (node: QuadTreeNode) => {
        const alpha = 0.15 + node.depth * 0.1;
        ctx.strokeStyle = `rgba(0, 184, 148, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(node.x, node.y, node.width, node.height);
        
        // Highlight nodes that intersect query
        if (mousePos) {
          const closestX = Math.max(node.x, Math.min(mousePos.x, node.x + node.width));
          const closestY = Math.max(node.y, Math.min(mousePos.y, node.y + node.height));
          const dx = mousePos.x - closestX;
          const dy = mousePos.y - closestY;
          
          if (dx * dx + dy * dy <= queryRadius * queryRadius) {
            ctx.fillStyle = `rgba(253, 203, 110, ${0.1 + node.depth * 0.05})`;
            ctx.fillRect(node.x, node.y, node.width, node.height);
          }
        }
        
        if (node.children) {
          for (const child of node.children) {
            drawNode(child);
          }
        }
      };
      
      drawNode(tree);
      
      // Draw query circle
      if (mousePos) {
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, queryRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(253, 203, 110, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fdcb6e';
        ctx.fill();
      }
      
      // Draw particles
      for (const p of particles) {
        const inQuery = querySet.has(`${p.x},${p.y}`);
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = inQuery ? '#fdcb6e' : '#00b894';
        ctx.fill();
        
        if (inQuery) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    };
    
    draw();
    
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      setMousePos({
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      });
    };
    
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      setParticles([...particles, { x, y }]);
    };
    
    const handleMouseLeave = () => setMousePos(null);
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [particles, mousePos, queryRadius]);
  
  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={700}
        height={350}
        className="w-full bg-bg-primary rounded-lg border border-white/10 cursor-crosshair"
      />
      
      <div className="mt-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-text-secondary mb-2">
            Query Radius: {queryRadius}px
          </label>
          <input
            type="range"
            min="30"
            max="200"
            value={queryRadius}
            onChange={(e) => setQueryRadius(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
        
        <button
          onClick={() => setParticles([])}
          className="flex items-center gap-2 px-4 py-2 bg-bg-primary hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Clear
        </button>
      </div>
      
      <p className="text-sm text-text-secondary mt-3">
        Click to add particles. Move mouse to query. Watch how the tree subdivides and only relevant nodes are searched.
      </p>
    </div>
  );
}

// ============== COMPARISON DEMO ==============
export function ComparisonDemo() {
  const [particleCount, setParticleCount] = useState(500);
  
  const naiveChecks = particleCount * (particleCount - 1) / 2;
  const gridChecks = Math.round(particleCount * 15); // ~15 neighbors on average
  const quadtreeChecks = Math.round(particleCount * Math.log2(particleCount) * 2);
  
  const maxChecks = naiveChecks;
  
  return (
    <div className="bg-bg-card rounded-xl p-4 sm:p-6">
      <div className="mb-6">
        <label className="block text-sm text-text-secondary mb-2">
          Particle Count: {particleCount}
        </label>
        <input
          type="range"
          min="100"
          max="2000"
          step="100"
          value={particleCount}
          onChange={(e) => setParticleCount(parseInt(e.target.value))}
          className="w-full accent-accent"
        />
      </div>
      
      <div className="space-y-4">
        {/* Naive */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-[#e17055] flex items-center gap-2">
              <Box className="w-4 h-4" />
              Naive (N²)
            </span>
            <span className="text-white font-mono">{naiveChecks.toLocaleString()} checks</span>
          </div>
          <div className="h-6 bg-bg-primary rounded overflow-hidden">
            <div
              className="h-full bg-[#e17055] transition-all duration-300"
              style={{ width: `${(naiveChecks / maxChecks) * 100}%` }}
            />
          </div>
        </div>
        
        {/* Grid */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-[#6c5ce7] flex items-center gap-2">
              <Grid3X3 className="w-4 h-4" />
              Spatial Grid
            </span>
            <span className="text-white font-mono">{gridChecks.toLocaleString()} checks</span>
          </div>
          <div className="h-6 bg-bg-primary rounded overflow-hidden">
            <div
              className="h-full bg-[#6c5ce7] transition-all duration-300"
              style={{ width: `${(gridChecks / maxChecks) * 100}%` }}
            />
          </div>
        </div>
        
        {/* Quadtree */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-[#00b894] flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Quadtree
            </span>
            <span className="text-white font-mono">{quadtreeChecks.toLocaleString()} checks</span>
          </div>
          <div className="h-6 bg-bg-primary rounded overflow-hidden">
            <div
              className="h-full bg-[#00b894] transition-all duration-300"
              style={{ width: `${(quadtreeChecks / maxChecks) * 100}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="mt-6 grid grid-cols-2 gap-4 text-center">
        <div className="bg-bg-primary rounded-lg p-3">
          <div className="text-text-secondary text-xs mb-1">Grid Savings</div>
          <div className="text-xl font-bold text-[#6c5ce7]">
            {((1 - gridChecks / naiveChecks) * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-bg-primary rounded-lg p-3">
          <div className="text-text-secondary text-xs mb-1">Quadtree Savings</div>
          <div className="text-xl font-bold text-[#00b894]">
            {((1 - quadtreeChecks / naiveChecks) * 100).toFixed(1)}%
          </div>
        </div>
      </div>
      
      <p className="text-sm text-text-secondary mt-4 text-center">
        With {particleCount} particles, optimized methods save up to <span className="text-accent font-bold">{(naiveChecks - Math.min(gridChecks, quadtreeChecks)).toLocaleString()}</span> collision checks per frame!
      </p>
    </div>
  );
}

// ============== N² PROBLEM VISUALIZER ==============
export function NSquaredDemo() {
  const [n, setN] = useState(10);
  const comparisons = n * (n - 1) / 2;
  
  return (
    <div className="bg-bg-card rounded-xl p-4 sm:p-6">
      <div className="mb-4">
        <label className="block text-sm text-text-secondary mb-2">
          Number of objects (N): {n}
        </label>
        <input
          type="range"
          min="2"
          max="50"
          value={n}
          onChange={(e) => setN(parseInt(e.target.value))}
          className="w-full accent-accent"
        />
      </div>
      
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-bg-primary rounded-lg p-4">
          <div className="text-3xl font-bold text-white">{n}</div>
          <div className="text-sm text-text-secondary">Objects</div>
        </div>
        <div className="bg-bg-primary rounded-lg p-4">
          <div className="text-3xl font-bold text-[#e17055]">{comparisons}</div>
          <div className="text-sm text-text-secondary">Pair Checks</div>
        </div>
        <div className="bg-bg-primary rounded-lg p-4">
          <div className="text-3xl font-bold text-[#fdcb6e]">{n * n}</div>
          <div className="text-sm text-text-secondary">N² Growth</div>
        </div>
      </div>
      
      <div className="mt-4 bg-bg-primary rounded-lg p-4">
        <div className="text-sm text-text-secondary mb-2">Comparisons formula:</div>
        <code className="text-[#6c5ce7]">N × (N - 1) / 2 = {n} × {n - 1} / 2 = {comparisons}</code>
      </div>
      
      {n >= 30 && (
        <div className="mt-4 bg-[#e17055]/10 border border-[#e17055]/30 rounded-lg p-3">
          <p className="text-sm text-[#e17055]">
            At {n} objects, you're doing {comparisons} checks per frame. At 60 FPS, that's {(comparisons * 60).toLocaleString()} checks per second!
          </p>
        </div>
      )}
    </div>
  );
}
