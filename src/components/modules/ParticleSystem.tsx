import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Flame, Cloud, Sparkles, Droplets, Snowflake, Zap, Circle, Square, Minus, Wind, ChevronDown, Settings, Layers, Eye, EyeOff, Timer, Palette, Move, Gauge, Target, Box, RefreshCw } from 'lucide-react';

// ============== TYPES ==============
interface Vec2 {
  x: number;
  y: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  startSize: number;
  endSize: number;
  color: RGB;
  startColor: RGB;
  endColor: RGB;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
  active: boolean;
}

interface EmitterConfig {
  type: 'point' | 'line' | 'circle' | 'box';
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  angle: number; // Direction for line emitter
  spread: number; // Spread angle
}

interface ParticleConfig {
  count: number;
  lifetime: { min: number; max: number };
  speed: { min: number; max: number };
  size: { start: number; end: number };
  startColor: RGB;
  endColor: RGB;
  gravity: number;
  wind: number;
  drag: number;
  alphaFade: boolean;
  burst: boolean;
  burstCount: number;
  emitter: EmitterConfig;
  blendMode: 'normal' | 'additive' | 'multiply' | 'screen';
}

// ============== UTILITY FUNCTIONS ==============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function rgbToString(c: RGB, alpha: number = 1): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 255, g: 255, b: 255 };
}

function rgbToHex(c: RGB): string {
  return `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomAngle(): number {
  return Math.random() * Math.PI * 2;
}

// ============== PARTICLE POOL ==============
class ParticlePool {
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    for (let i = 0; i < maxSize; i++) {
      this.pool.push(this.createParticle());
    }
  }

  private createParticle(): Particle {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1,
      size: 1, startSize: 1, endSize: 0,
      color: { r: 255, g: 255, b: 255 },
      startColor: { r: 255, g: 255, b: 255 },
      endColor: { r: 255, g: 255, b: 255 },
      alpha: 1, rotation: 0, rotationSpeed: 0,
      active: false
    };
  }

  spawn(config: Partial<Particle>): Particle | null {
    let particle = this.pool.pop();
    if (!particle) {
      if (this.active.length < this.maxSize) {
        particle = this.createParticle();
      } else {
        return null;
      }
    }

    Object.assign(particle, config, { active: true });
    this.active.push(particle);
    return particle;
  }

  release(particle: Particle): void {
    particle.active = false;
    const index = this.active.indexOf(particle);
    if (index > -1) {
      this.active.splice(index, 1);
      this.pool.push(particle);
    }
  }

  getActive(): Particle[] {
    return this.active;
  }

  getPooled(): Particle[] {
    return this.pool;
  }

  clear(): void {
    while (this.active.length > 0) {
      const p = this.active.pop()!;
      p.active = false;
      this.pool.push(p);
    }
  }
}

// ============== PRESET EFFECTS ==============
const presets: Record<string, Partial<ParticleConfig>> = {
  fire: {
    count: 100,
    lifetime: { min: 0.5, max: 1.5 },
    speed: { min: 50, max: 120 },
    size: { start: 20, end: 5 },
    startColor: { r: 255, g: 200, b: 50 },
    endColor: { r: 255, g: 50, b: 0 },
    gravity: -80,
    wind: 0,
    drag: 0.98,
    alphaFade: true,
    burst: false,
    blendMode: 'additive',
    emitter: { type: 'line', x: 300, y: 280, width: 60, height: 0, radius: 0, angle: -Math.PI / 2, spread: 0.4 }
  },
  smoke: {
    count: 60,
    lifetime: { min: 2, max: 4 },
    speed: { min: 20, max: 50 },
    size: { start: 10, end: 40 },
    startColor: { r: 100, g: 100, b: 100 },
    endColor: { r: 50, g: 50, b: 50 },
    gravity: -20,
    wind: 15,
    drag: 0.99,
    alphaFade: true,
    burst: false,
    blendMode: 'normal',
    emitter: { type: 'circle', x: 300, y: 280, width: 0, height: 0, radius: 10, angle: 0, spread: Math.PI * 2 }
  },
  explosion: {
    count: 200,
    lifetime: { min: 0.3, max: 1.0 },
    speed: { min: 150, max: 350 },
    size: { start: 15, end: 3 },
    startColor: { r: 255, g: 220, b: 100 },
    endColor: { r: 255, g: 100, b: 0 },
    gravity: 50,
    wind: 0,
    drag: 0.96,
    alphaFade: true,
    burst: true,
    burstCount: 50,
    blendMode: 'additive',
    emitter: { type: 'point', x: 300, y: 180, width: 0, height: 0, radius: 0, angle: 0, spread: Math.PI * 2 }
  },
  sparks: {
    count: 80,
    lifetime: { min: 0.5, max: 1.2 },
    speed: { min: 100, max: 250 },
    size: { start: 4, end: 1 },
    startColor: { r: 255, g: 230, b: 150 },
    endColor: { r: 255, g: 150, b: 50 },
    gravity: 200,
    wind: 0,
    drag: 0.98,
    alphaFade: true,
    burst: false,
    blendMode: 'additive',
    emitter: { type: 'point', x: 300, y: 280, width: 0, height: 0, radius: 0, angle: -Math.PI / 2, spread: 0.8 }
  },
  rain: {
    count: 150,
    lifetime: { min: 0.8, max: 1.5 },
    speed: { min: 300, max: 500 },
    size: { start: 3, end: 3 },
    startColor: { r: 150, g: 200, b: 255 },
    endColor: { r: 100, g: 150, b: 200 },
    gravity: 300,
    wind: 30,
    drag: 1.0,
    alphaFade: false,
    burst: false,
    blendMode: 'normal',
    emitter: { type: 'line', x: 300, y: 0, width: 600, height: 0, radius: 0, angle: Math.PI / 2, spread: 0.1 }
  },
  snow: {
    count: 100,
    lifetime: { min: 3, max: 6 },
    speed: { min: 20, max: 60 },
    size: { start: 6, end: 4 },
    startColor: { r: 255, g: 255, b: 255 },
    endColor: { r: 200, g: 220, b: 255 },
    gravity: 30,
    wind: 10,
    drag: 0.99,
    alphaFade: true,
    burst: false,
    blendMode: 'normal',
    emitter: { type: 'line', x: 300, y: 0, width: 600, height: 0, radius: 0, angle: Math.PI / 2, spread: 0.3 }
  },
  magic: {
    count: 120,
    lifetime: { min: 1, max: 2 },
    speed: { min: 30, max: 80 },
    size: { start: 8, end: 2 },
    startColor: { r: 150, g: 100, b: 255 },
    endColor: { r: 50, g: 200, b: 255 },
    gravity: -30,
    wind: 0,
    drag: 0.97,
    alphaFade: true,
    burst: false,
    blendMode: 'additive',
    emitter: { type: 'circle', x: 300, y: 180, width: 0, height: 0, radius: 50, angle: 0, spread: Math.PI * 2 }
  }
};

// ============== DEMO 1: SINGLE PARTICLE VISUALIZER ==============
export function SingleParticleDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gravity, setGravity] = useState(100);
  const [wind, setWind] = useState(0);
  const [drag, setDrag] = useState(0.99);
  const particleRef = useRef({ x: 300, y: 180, vx: 80, vy: -120, life: 3, maxLife: 3 });
  const lastTimeRef = useRef(0);

  const resetParticle = useCallback(() => {
    particleRef.current = { x: 300, y: 180, vx: 80, vy: -120, life: 3, maxLife: 3 };
  }, []);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = timestamp;

    const p = particleRef.current;

    if (isPlaying && p.life > 0) {
      // Apply forces
      p.vy += gravity * dt;
      p.vx += wind * dt;
      
      // Apply drag
      p.vx *= drag;
      p.vy *= drag;
      
      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Update life
      p.life -= dt;
      
      // Wrap around
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y > canvas.height) p.y = 0;
    }

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const lifeRatio = Math.max(0, p.life / p.maxLife);

    // Draw force arrows
    const arrowScale = 0.5;
    
    // Gravity arrow (red, pointing down)
    if (Math.abs(gravity) > 0) {
      ctx.strokeStyle = '#e17055';
      ctx.fillStyle = '#e17055';
      ctx.lineWidth = 3;
      const gravLen = gravity * arrowScale;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + gravLen);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + gravLen);
      ctx.lineTo(p.x - 6, p.y + gravLen - 10 * Math.sign(gravity));
      ctx.lineTo(p.x + 6, p.y + gravLen - 10 * Math.sign(gravity));
      ctx.closePath();
      ctx.fill();
    }

    // Wind arrow (blue, pointing horizontal)
    if (Math.abs(wind) > 0) {
      ctx.strokeStyle = '#74b9ff';
      ctx.fillStyle = '#74b9ff';
      ctx.lineWidth = 3;
      const windLen = wind * arrowScale;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + windLen, p.y);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(p.x + windLen, p.y);
      ctx.lineTo(p.x + windLen - 10 * Math.sign(wind), p.y - 6);
      ctx.lineTo(p.x + windLen - 10 * Math.sign(wind), p.y + 6);
      ctx.closePath();
      ctx.fill();
    }

    // Velocity arrow (green)
    const velLen = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.3;
    if (velLen > 5) {
      ctx.strokeStyle = '#00b894';
      ctx.fillStyle = '#00b894';
      ctx.lineWidth = 2;
      const angle = Math.atan2(p.vy, p.vx);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(angle) * velLen, p.y + Math.sin(angle) * velLen);
      ctx.stroke();
    }

    // Draw particle
    const size = lerp(20, 5, 1 - lifeRatio);
    const alpha = lifeRatio;
    ctx.fillStyle = `rgba(255, 180, 50, ${alpha})`;
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw info panel
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PARTICLE STATE', 20, 25);
    ctx.fillStyle = '#888';
    ctx.fillText(`Position: (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`, 20, 45);
    ctx.fillText(`Velocity: (${p.vx.toFixed(0)}, ${p.vy.toFixed(0)})`, 20, 60);
    ctx.fillText(`Life: ${p.life.toFixed(2)}s / ${p.maxLife}s`, 20, 75);
    ctx.fillText(`Size: ${size.toFixed(1)}`, 20, 90);

    // Legend
    ctx.fillStyle = '#e17055';
    ctx.fillRect(20, 280, 12, 12);
    ctx.fillStyle = '#888';
    ctx.fillText('Gravity', 38, 290);

    ctx.fillStyle = '#74b9ff';
    ctx.fillRect(100, 280, 12, 12);
    ctx.fillStyle = '#888';
    ctx.fillText('Wind', 118, 290);

    ctx.fillStyle = '#00b894';
    ctx.fillRect(170, 280, 12, 12);
    ctx.fillStyle = '#888';
    ctx.fillText('Velocity', 188, 290);

    animationRef.current = requestAnimationFrame(draw);
  }, [isPlaying, gravity, wind, drag]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  return (
    <div className="bg-bg-card rounded-xl p-4 md:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${isPlaying ? 'bg-[#e17055] text-white' : 'bg-[#00b894] text-white'}`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={resetParticle}
          className="px-4 py-2 rounded-lg bg-bg-secondary text-white flex items-center gap-2 hover:bg-bg-secondary/80"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={320}
        className="w-full rounded-lg border border-border"
        style={{ maxWidth: '600px' }}
        role="img"
        aria-label="Single particle physics visualizer showing forces like gravity, wind, and drag affecting a particle"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div>
          <label htmlFor="gravity-slider" className="text-sm text-text-secondary flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-[#e17055]" />
            Gravity: {gravity}
          </label>
          <input
            id="gravity-slider"
            type="range"
            min="-200"
            max="300"
            value={gravity}
            onChange={(e) => setGravity(Number(e.target.value))}
            className="w-full accent-[#e17055]"
            aria-label={`Gravity: ${gravity}`}
          />
        </div>
        <div>
          <label htmlFor="wind-slider" className="text-sm text-text-secondary flex items-center gap-2 mb-1">
            <Wind className="w-4 h-4 text-[#74b9ff]" />
            Wind: {wind}
          </label>
          <input
            id="wind-slider"
            type="range"
            min="-150"
            max="150"
            value={wind}
            onChange={(e) => setWind(Number(e.target.value))}
            className="w-full accent-[#74b9ff]"
            aria-label={`Wind: ${wind}`}
          />
        </div>
        <div>
          <label htmlFor="drag-slider" className="text-sm text-text-secondary flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-[#6c5ce7]" />
            Drag: {drag.toFixed(2)}
          </label>
          <input
            id="drag-slider"
            type="range"
            min="0.9"
            max="1"
            step="0.01"
            value={drag}
            onChange={(e) => setDrag(Number(e.target.value))}
            className="w-full accent-[#6c5ce7]"
            aria-label={`Drag: ${drag.toFixed(2)}`}
          />
        </div>
      </div>
    </div>
  );
}

// ============== DEMO 2: EMITTER SHAPE COMPARISON ==============
export function EmitterShapeDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [emitterType, setEmitterType] = useState<'point' | 'line' | 'circle' | 'box'>('point');
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[]>([]);
  const lastSpawnRef = useRef(0);
  const lastTimeRef = useRef(0);

  const emitterConfigs = {
    point: { x: 300, y: 160, width: 0, height: 0, radius: 0 },
    line: { x: 300, y: 160, width: 200, height: 0, radius: 0 },
    circle: { x: 300, y: 160, width: 0, height: 0, radius: 60 },
    box: { x: 300, y: 160, width: 150, height: 80, radius: 0 }
  };

  const spawnParticle = useCallback(() => {
    const config = emitterConfigs[emitterType];
    let x = config.x;
    let y = config.y;

    switch (emitterType) {
      case 'point':
        break;
      case 'line':
        x = config.x - config.width / 2 + Math.random() * config.width;
        break;
      case 'circle':
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * config.radius;
        x = config.x + Math.cos(angle) * r;
        y = config.y + Math.sin(angle) * r;
        break;
      case 'box':
        x = config.x - config.width / 2 + Math.random() * config.width;
        y = config.y - config.height / 2 + Math.random() * config.height;
        break;
    }

    const spawnAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const speed = 60 + Math.random() * 40;

    particlesRef.current.push({
      x, y,
      vx: Math.cos(spawnAngle) * speed,
      vy: Math.sin(spawnAngle) * speed,
      life: 1.5 + Math.random(),
      maxLife: 2
    });

    if (particlesRef.current.length > 200) {
      particlesRef.current.shift();
    }
  }, [emitterType]);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = timestamp;

    // Spawn particles
    if (timestamp - lastSpawnRef.current > 50) {
      spawnParticle();
      lastSpawnRef.current = timestamp;
    }

    // Update particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.vy += 50 * dt; // Gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw emitter shape
    const config = emitterConfigs[emitterType];
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    switch (emitterType) {
      case 'point':
        ctx.beginPath();
        ctx.arc(config.x, config.y, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#6c5ce7';
        ctx.beginPath();
        ctx.arc(config.x, config.y, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(config.x - config.width / 2, config.y);
        ctx.lineTo(config.x + config.width / 2, config.y);
        ctx.stroke();
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(config.x, config.y, config.radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'box':
        ctx.strokeRect(
          config.x - config.width / 2,
          config.y - config.height / 2,
          config.width,
          config.height
        );
        break;
    }
    ctx.setLineDash([]);

    // Draw particles
    for (const p of particlesRef.current) {
      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio;
      const size = lerp(2, 8, lifeRatio);
      
      ctx.fillStyle = `rgba(108, 92, 231, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${emitterType.toUpperCase()} EMITTER`, 300, 30);

    animationRef.current = requestAnimationFrame(draw);
  }, [emitterType, spawnParticle]);

  useEffect(() => {
    particlesRef.current = [];
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  const emitterOptions = [
    { type: 'point' as const, icon: Circle, label: 'Point' },
    { type: 'line' as const, icon: Minus, label: 'Line' },
    { type: 'circle' as const, icon: Circle, label: 'Circle' },
    { type: 'box' as const, icon: Square, label: 'Box' }
  ];

  return (
    <div className="bg-bg-card rounded-xl p-4 md:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {emitterOptions.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            onClick={() => setEmitterType(type)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${emitterType === type ? 'bg-[#6c5ce7] text-white' : 'bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80'}`}
            aria-pressed={emitterType === type}
            aria-label={`Select ${label} emitter type`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={320}
        className="w-full rounded-lg border border-border"
        style={{ maxWidth: '600px' }}
        role="img"
        aria-label={`Emitter shape comparison demo showing ${emitterType} emitter type`}
      />

      <div className="mt-4 text-sm text-text-secondary">
        <p>
          {emitterType === 'point' && 'Point emitter: All particles spawn from a single location. Perfect for explosions, magic bursts.'}
          {emitterType === 'line' && 'Line emitter: Particles spawn along a line. Great for rain, waterfalls, curtains of light.'}
          {emitterType === 'circle' && 'Circle emitter: Particles spawn within a circular area. Ideal for smoke, auras, portals.'}
          {emitterType === 'box' && 'Box emitter: Particles spawn within a rectangular area. Useful for area effects, ground fog.'}
        </p>
      </div>
    </div>
  );
}

// ============== DEMO 3: OBJECT POOLING VISUALIZER ==============
export function PoolingDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showPool, setShowPool] = useState(true);
  const poolRef = useRef(new ParticlePool(100));
  const lastSpawnRef = useRef(0);
  const lastTimeRef = useRef(0);

  const spawnParticle = useCallback(() => {
    const pool = poolRef.current;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    const speed = 80 + Math.random() * 60;

    pool.spawn({
      x: 200,
      y: 280,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.5 + Math.random(),
      maxLife: 2,
      size: 8,
      startSize: 8,
      endSize: 2,
      startColor: { r: 0, g: 184, b: 148 },
      endColor: { r: 116, g: 185, b: 255 }
    });
  }, []);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = timestamp;

    const pool = poolRef.current;

    if (isPlaying) {
      // Spawn particles
      if (timestamp - lastSpawnRef.current > 80) {
        spawnParticle();
        lastSpawnRef.current = timestamp;
      }

      // Update particles
      const toRelease: Particle[] = [];
      for (const p of pool.getActive()) {
        p.vy += 100 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;

        if (p.life <= 0) {
          toRelease.push(p);
        }
      }
      toRelease.forEach(p => pool.release(p));
    }

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw divider
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(400, 0);
    ctx.lineTo(400, canvas.height);
    ctx.stroke();

    // Draw active particles
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ACTIVE PARTICLES', 200, 20);

    for (const p of pool.getActive()) {
      const lifeRatio = p.life / p.maxLife;
      const size = lerp(p.endSize, p.startSize, lifeRatio);
      const color = lerpColor(p.endColor, p.startColor, lifeRatio);

      ctx.fillStyle = rgbToString(color, lifeRatio);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw pool visualization
    if (showPool) {
      ctx.fillStyle = '#fff';
      ctx.fillText('OBJECT POOL', 500, 20);

      const pooled = pool.getPooled();
      const cols = 10;
      const startX = 420;
      const startY = 40;
      const spacing = 16;

      for (let i = 0; i < 100; i++) {
        const x = startX + (i % cols) * spacing;
        const y = startY + Math.floor(i / cols) * spacing;
        const isPooled = i < pooled.length;

        ctx.fillStyle = isPooled ? '#2a2a4a' : 'transparent';
        ctx.strokeStyle = isPooled ? '#4a4a6a' : '#1a1a2e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Stats
      const active = pool.getActive().length;
      const available = pooled.length;

      ctx.fillStyle = '#00b894';
      ctx.fillRect(420, 220, 12, 12);
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Active: ${active}`, 438, 230);

      ctx.fillStyle = '#4a4a6a';
      ctx.fillRect(420, 240, 12, 12);
      ctx.fillStyle = '#888';
      ctx.fillText(`Pooled: ${available}`, 438, 250);

      ctx.fillStyle = '#6c5ce7';
      ctx.fillRect(420, 260, 12, 12);
      ctx.fillStyle = '#888';
      ctx.fillText(`Total: 100`, 438, 270);
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [isPlaying, showPool, spawnParticle]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  return (
    <div className="bg-bg-card rounded-xl p-4 md:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${isPlaying ? 'bg-[#e17055] text-white' : 'bg-[#00b894] text-white'}`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => setShowPool(!showPool)}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${showPool ? 'bg-[#6c5ce7] text-white' : 'bg-bg-secondary text-text-secondary'}`}
        >
          {showPool ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showPool ? 'Hide Pool' : 'Show Pool'}
        </button>
        <button
          onClick={() => poolRef.current.clear()}
          className="px-4 py-2 rounded-lg bg-bg-secondary text-white flex items-center gap-2 hover:bg-bg-secondary/80"
        >
          <RotateCcw className="w-4 h-4" />
          Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={320}
        className="w-full rounded-lg border border-border"
        style={{ maxWidth: '600px' }}
        role="img"
        aria-label="Object pooling visualizer showing active particles and particle pool management"
      />

      <div className="mt-4 p-3 bg-bg-secondary rounded-lg">
        <p className="text-sm text-text-secondary">
          <strong className="text-[#00b894]">Object pooling</strong> reuses particle objects instead of creating/destroying them. 
          When a particle dies, it returns to the pool. When we need a new particle, we grab one from the pool. 
          This eliminates garbage collection pauses and improves performance significantly.
        </p>
      </div>
    </div>
  );
}

// ============== MAIN VFX TOOLKIT ==============
export default function ParticleSystem() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const poolRef = useRef(new ParticlePool(500));
  const lastSpawnRef = useRef(0);
  const lastTimeRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [preset, setPreset] = useState<string>('fire');
  const [config, setConfig] = useState<ParticleConfig>({
    count: 100,
    lifetime: { min: 0.5, max: 1.5 },
    speed: { min: 50, max: 120 },
    size: { start: 20, end: 5 },
    startColor: { r: 255, g: 200, b: 50 },
    endColor: { r: 255, g: 50, b: 0 },
    gravity: -80,
    wind: 0,
    drag: 0.98,
    alphaFade: true,
    burst: false,
    burstCount: 50,
    emitter: { type: 'line', x: 300, y: 280, width: 60, height: 0, radius: 0, angle: -Math.PI / 2, spread: 0.4 },
    blendMode: 'additive'
  });

  const applyPreset = useCallback((presetName: string) => {
    const p = presets[presetName];
    if (p) {
      setConfig(prev => ({ ...prev, ...p }));
      setPreset(presetName);
      poolRef.current.clear();
    }
  }, []);

  const spawnParticle = useCallback((x?: number, y?: number) => {
    const pool = poolRef.current;
    const e = config.emitter;
    
    let spawnX = x ?? e.x;
    let spawnY = y ?? e.y;

    if (x === undefined || y === undefined) {
      switch (e.type) {
        case 'point':
          break;
        case 'line':
          if (e.angle === -Math.PI / 2 || e.angle === Math.PI / 2) {
            // Horizontal line
            spawnX = e.x - e.width / 2 + Math.random() * e.width;
          } else {
            // Vertical line or angled
            spawnY = e.y - e.height / 2 + Math.random() * e.height;
          }
          break;
        case 'circle':
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * e.radius;
          spawnX = e.x + Math.cos(angle) * r;
          spawnY = e.y + Math.sin(angle) * r;
          break;
        case 'box':
          spawnX = e.x - e.width / 2 + Math.random() * e.width;
          spawnY = e.y - e.height / 2 + Math.random() * e.height;
          break;
      }
    }

    const spawnAngle = e.angle + (Math.random() - 0.5) * e.spread * 2;
    const speed = randomRange(config.speed.min, config.speed.max);

    pool.spawn({
      x: spawnX,
      y: spawnY,
      vx: Math.cos(spawnAngle) * speed,
      vy: Math.sin(spawnAngle) * speed,
      life: randomRange(config.lifetime.min, config.lifetime.max),
      maxLife: config.lifetime.max,
      size: config.size.start,
      startSize: config.size.start,
      endSize: config.size.end,
      startColor: { ...config.startColor },
      endColor: { ...config.endColor },
      color: { ...config.startColor },
      alpha: 1,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 4
    });
  }, [config]);

  const triggerBurst = useCallback(() => {
    for (let i = 0; i < config.burstCount; i++) {
      spawnParticle();
    }
  }, [config.burstCount, spawnParticle]);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = lastTimeRef.current ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.05) : 0.016;
    lastTimeRef.current = timestamp;

    const pool = poolRef.current;

    if (isPlaying && !config.burst) {
      const spawnRate = 1000 / config.count;
      if (timestamp - lastSpawnRef.current > spawnRate) {
        spawnParticle();
        lastSpawnRef.current = timestamp;
      }
    }

    // Update particles
    const toRelease: Particle[] = [];
    for (const p of pool.getActive()) {
      // Apply forces
      p.vy += config.gravity * dt;
      p.vx += config.wind * dt;
      
      // Apply drag
      p.vx *= config.drag;
      p.vy *= config.drag;
      
      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Update rotation
      p.rotation += p.rotationSpeed * dt;
      
      // Update life
      p.life -= dt;

      // Update interpolated properties
      const lifeRatio = Math.max(0, p.life / p.maxLife);
      p.size = lerp(p.endSize, p.startSize, lifeRatio);
      p.color = lerpColor(p.endColor, p.startColor, lifeRatio);
      p.alpha = config.alphaFade ? lifeRatio : 1;

      if (p.life <= 0) {
        toRelease.push(p);
      }
    }
    toRelease.forEach(p => pool.release(p));

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Set blend mode
    switch (config.blendMode) {
      case 'additive':
        ctx.globalCompositeOperation = 'lighter';
        break;
      case 'multiply':
        ctx.globalCompositeOperation = 'multiply';
        break;
      case 'screen':
        ctx.globalCompositeOperation = 'screen';
        break;
      default:
        ctx.globalCompositeOperation = 'source-over';
    }

    // Draw particles
    for (const p of pool.getActive()) {
      ctx.fillStyle = rgbToString(p.color, p.alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Draw emitter indicator
    const e = config.emitter;
    ctx.strokeStyle = 'rgba(108, 92, 231, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    switch (e.type) {
      case 'point':
        ctx.beginPath();
        ctx.arc(e.x, e.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(e.x - e.width / 2, e.y);
        ctx.lineTo(e.x + e.width / 2, e.y);
        ctx.stroke();
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'box':
        ctx.strokeRect(e.x - e.width / 2, e.y - e.height / 2, e.width, e.height);
        break;
    }
    ctx.setLineDash([]);

    // Stats
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Particles: ${pool.getActive().length}`, 10, 20);
    ctx.fillText(`Pooled: ${pool.getPooled().length}`, 10, 35);

    animationRef.current = requestAnimationFrame(draw);
  }, [isPlaying, config, spawnParticle]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  useEffect(() => {
    applyPreset('fire');
  }, []);

  const presetButtons = [
    { id: 'fire', icon: Flame, label: 'Fire', color: '#e17055' },
    { id: 'smoke', icon: Cloud, label: 'Smoke', color: '#636e72' },
    { id: 'explosion', icon: Zap, label: 'Explosion', color: '#fdcb6e' },
    { id: 'sparks', icon: Sparkles, label: 'Sparks', color: '#ffeaa7' },
    { id: 'rain', icon: Droplets, label: 'Rain', color: '#74b9ff' },
    { id: 'snow', icon: Snowflake, label: 'Snow', color: '#dfe6e9' },
    { id: 'magic', icon: Sparkles, label: 'Magic', color: '#a29bfe' }
  ];

  const emitterOptions = [
    { type: 'point' as const, icon: Circle, label: 'Point' },
    { type: 'line' as const, icon: Minus, label: 'Line' },
    { type: 'circle' as const, icon: Circle, label: 'Circle' },
    { type: 'box' as const, icon: Square, label: 'Box' }
  ];

  return (
    <div className="bg-bg-card rounded-xl p-4 md:p-6">
      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {presetButtons.map(({ id, icon: Icon, label, color }) => (
          <button
            key={id}
            onClick={() => applyPreset(id)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${preset === id ? 'ring-2 ring-offset-2 ring-offset-bg-card' : 'opacity-70 hover:opacity-100'}`}
            style={{ 
              backgroundColor: preset === id ? color : 'rgba(255,255,255,0.1)', 
              color: preset === id ? '#000' : color,
              // @ts-expect-error CSS custom property for ring color
              '--tw-ring-color': color
            }}
          >
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${isPlaying ? 'bg-[#e17055] text-white' : 'bg-[#00b894] text-white'}`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        {config.burst && (
          <button
            onClick={triggerBurst}
            className="px-4 py-2 rounded-lg bg-[#fdcb6e] text-black flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Burst!
          </button>
        )}
        <button
          onClick={() => poolRef.current.clear()}
          className="px-4 py-2 rounded-lg bg-bg-secondary text-white flex items-center gap-2 hover:bg-bg-secondary/80"
        >
          <RotateCcw className="w-4 h-4" />
          Clear
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={600}
        height={360}
        className="w-full rounded-lg border border-border mb-4"
        style={{ maxWidth: '600px' }}
        role="img"
        aria-label={`VFX Toolkit - ${preset} particle effect with ${config.count} particles`}
      />

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Emitter Type */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-[#6c5ce7]" />
            Emitter Type
          </label>
          <div className="flex flex-wrap gap-1">
            {emitterOptions.map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                onClick={() => setConfig(prev => ({
                  ...prev,
                  emitter: { ...prev.emitter, type }
                }))}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${config.emitter.type === type ? 'bg-[#6c5ce7] text-white' : 'bg-bg-card text-text-secondary'}`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Particle Count */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label htmlFor="particle-count" className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-[#00b894]" aria-hidden="true" />
            Particle Count: {config.count}
          </label>
          <input
            id="particle-count"
            type="range"
            min="10"
            max="500"
            value={config.count}
            onChange={(e) => setConfig(prev => ({ ...prev, count: Number(e.target.value) }))}
            aria-label={`Particle count: ${config.count}`}
            className="w-full accent-[#00b894]"
          />
        </div>

        {/* Lifetime */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label htmlFor="lifetime-slider" className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Timer className="w-4 h-4 text-[#fdcb6e]" aria-hidden="true" />
            Lifetime: {config.lifetime.min.toFixed(1)}s - {config.lifetime.max.toFixed(1)}s
          </label>
          <input
            id="lifetime-slider"
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={config.lifetime.max}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              lifetime: { min: prev.lifetime.min, max: Number(e.target.value) }
            }))}
            className="w-full accent-[#fdcb6e]"
            aria-label={`Particle lifetime: ${config.lifetime.max.toFixed(1)} seconds`}
          />
        </div>

        {/* Gravity */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label htmlFor="vfx-gravity" className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-[#e17055]" aria-hidden="true" />
            Gravity: {config.gravity}
          </label>
          <input
            id="vfx-gravity"
            type="range"
            min="-300"
            max="300"
            value={config.gravity}
            onChange={(e) => setConfig(prev => ({ ...prev, gravity: Number(e.target.value) }))}
            className="w-full accent-[#e17055]"
            aria-label={`Gravity: ${config.gravity}`}
          />
        </div>

        {/* Wind */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label htmlFor="vfx-wind" className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Wind className="w-4 h-4 text-[#74b9ff]" aria-hidden="true" />
            Wind: {config.wind}
          </label>
          <input
            id="vfx-wind"
            type="range"
            min="-150"
            max="150"
            value={config.wind}
            onChange={(e) => setConfig(prev => ({ ...prev, wind: Number(e.target.value) }))}
            className="w-full accent-[#74b9ff]"
            aria-label={`Wind: ${config.wind}`}
          />
        </div>

        {/* Size */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Move className="w-4 h-4 text-[#a29bfe]" aria-hidden="true" />
            Size: {config.size.start} → {config.size.end}
          </label>
          <div className="flex gap-2">
            <input
              type="range"
              min="1"
              max="50"
              value={config.size.start}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                size: { ...prev.size, start: Number(e.target.value) }
              }))}
              className="w-1/2 accent-[#a29bfe]"
              aria-label={`Start size: ${config.size.start}`}
            />
            <input
              type="range"
              min="0"
              max="30"
              value={config.size.end}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                size: { ...prev.size, end: Number(e.target.value) }
              }))}
              className="w-1/2 accent-[#a29bfe]"
              aria-label={`End size: ${config.size.end}`}
            />
          </div>
        </div>

        {/* Start Color */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label htmlFor="start-color" className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Palette className="w-4 h-4 text-[#ff7675]" aria-hidden="true" />
            Start Color
          </label>
          <input
            id="start-color"
            type="color"
            value={rgbToHex(config.startColor)}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              startColor: hexToRgb(e.target.value)
            }))}
            className="w-full h-8 rounded cursor-pointer"
          />
        </div>

        {/* End Color */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Palette className="w-4 h-4 text-[#fd79a8]" />
            End Color
          </label>
          <input
            type="color"
            value={rgbToHex(config.endColor)}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              endColor: hexToRgb(e.target.value)
            }))}
            className="w-full h-8 rounded cursor-pointer"
          />
        </div>

        {/* Toggles */}
        <div className="bg-bg-secondary rounded-lg p-3">
          <label className="text-sm text-text-secondary flex items-center gap-2 mb-2">
            <Settings className="w-4 h-4" />
            Options
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setConfig(prev => ({ ...prev, alphaFade: !prev.alphaFade }))}
              className={`px-2 py-1 rounded text-xs ${config.alphaFade ? 'bg-[#00b894] text-white' : 'bg-bg-card text-text-secondary'}`}
            >
              Alpha Fade
            </button>
            <button
              onClick={() => setConfig(prev => ({ ...prev, burst: !prev.burst }))}
              className={`px-2 py-1 rounded text-xs ${config.burst ? 'bg-[#fdcb6e] text-black' : 'bg-bg-card text-text-secondary'}`}
            >
              Burst Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== BLEND MODE DEMO ==============
export function BlendModeDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [blendMode, setBlendMode] = useState<'normal' | 'additive' | 'multiply' | 'screen'>('normal');
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: RGB }[]>([]);
  const lastSpawnRef = useRef(0);
  const lastTimeRef = useRef(0);

  const colors = [
    { r: 255, g: 100, b: 100 },
    { r: 100, g: 255, b: 100 },
    { r: 100, g: 100, b: 255 }
  ];

  const spawnParticle = useCallback(() => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 40;
    const color = colors[Math.floor(Math.random() * colors.length)];

    particlesRef.current.push({
      x: 300,
      y: 160,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 2 + Math.random(),
      maxLife: 3,
      color
    });

    if (particlesRef.current.length > 150) {
      particlesRef.current.shift();
    }
  }, []);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = timestamp;

    // Spawn particles
    if (timestamp - lastSpawnRef.current > 50) {
      spawnParticle();
      lastSpawnRef.current = timestamp;
    }

    // Update particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set blend mode
    switch (blendMode) {
      case 'additive':
        ctx.globalCompositeOperation = 'lighter';
        break;
      case 'multiply':
        ctx.globalCompositeOperation = 'multiply';
        break;
      case 'screen':
        ctx.globalCompositeOperation = 'screen';
        break;
      default:
        ctx.globalCompositeOperation = 'source-over';
    }

    // Draw particles
    for (const p of particlesRef.current) {
      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio;
      const size = 15 + (1 - lifeRatio) * 10;

      ctx.fillStyle = rgbToString(p.color, alpha * 0.7);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`BLEND MODE: ${blendMode.toUpperCase()}`, 300, 30);

    animationRef.current = requestAnimationFrame(draw);
  }, [blendMode, spawnParticle]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  const modes = [
    { id: 'normal' as const, label: 'Normal', desc: 'Standard alpha blending' },
    { id: 'additive' as const, label: 'Additive', desc: 'Colors add up, great for glows' },
    { id: 'multiply' as const, label: 'Multiply', desc: 'Darkens, good for shadows' },
    { id: 'screen' as const, label: 'Screen', desc: 'Lightens, like projector' }
  ];

  return (
    <div className="bg-bg-card rounded-xl p-4 md:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {modes.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setBlendMode(id)}
            className={`px-4 py-2 rounded-lg transition-colors ${blendMode === id ? 'bg-[#6c5ce7] text-white' : 'bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={320}
        className="w-full rounded-lg border border-border"
        style={{ maxWidth: '600px' }}
      />

      <div className="mt-4 text-sm text-text-secondary">
        {modes.find(m => m.id === blendMode)?.desc}
      </div>
    </div>
  );
}

// ============== EFFECT BUILDER ==============
export function EffectBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const poolRef = useRef(new ParticlePool(300));
  const lastSpawnRef = useRef(0);
  const lastTimeRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [config, setConfig] = useState({
    emitterType: 'circle' as 'point' | 'line' | 'circle' | 'box',
    count: 60,
    lifetime: 2,
    speed: 50,
    gravity: -30,
    wind: 0,
    startSize: 12,
    endSize: 4,
    startColor: '#9b59b6',
    endColor: '#3498db',
    alphaFade: true,
    blendMode: 'additive' as 'normal' | 'additive'
  });

  const spawnParticle = useCallback(() => {
    const pool = poolRef.current;
    let x = 300, y = 180;

    switch (config.emitterType) {
      case 'line':
        x = 150 + Math.random() * 300;
        break;
      case 'circle':
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 40;
        x = 300 + Math.cos(angle) * r;
        y = 180 + Math.sin(angle) * r;
        break;
      case 'box':
        x = 250 + Math.random() * 100;
        y = 140 + Math.random() * 80;
        break;
    }

    const spawnAngle = Math.random() * Math.PI * 2;
    const speed = config.speed * (0.5 + Math.random() * 0.5);

    pool.spawn({
      x, y,
      vx: Math.cos(spawnAngle) * speed,
      vy: Math.sin(spawnAngle) * speed,
      life: config.lifetime * (0.5 + Math.random() * 0.5),
      maxLife: config.lifetime,
      size: config.startSize,
      startSize: config.startSize,
      endSize: config.endSize,
      startColor: hexToRgb(config.startColor),
      endColor: hexToRgb(config.endColor),
      color: hexToRgb(config.startColor),
      alpha: 1,
      rotation: 0,
      rotationSpeed: 0
    });
  }, [config]);

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = lastTimeRef.current ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.05) : 0.016;
    lastTimeRef.current = timestamp;

    const pool = poolRef.current;

    if (isPlaying) {
      const spawnRate = 1000 / config.count;
      if (timestamp - lastSpawnRef.current > spawnRate) {
        spawnParticle();
        lastSpawnRef.current = timestamp;
      }
    }

    // Update particles
    const toRelease: Particle[] = [];
    for (const p of pool.getActive()) {
      p.vy += config.gravity * dt;
      p.vx += config.wind * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      const lifeRatio = Math.max(0, p.life / p.maxLife);
      p.size = lerp(p.endSize, p.startSize, lifeRatio);
      p.color = lerpColor(p.endColor, p.startColor, lifeRatio);
      p.alpha = config.alphaFade ? lifeRatio : 1;

      if (p.life <= 0) toRelease.push(p);
    }
    toRelease.forEach(p => pool.release(p));

    // Clear
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Set blend mode
    ctx.globalCompositeOperation = config.blendMode === 'additive' ? 'lighter' : 'source-over';

    // Draw particles
    for (const p of pool.getActive()) {
      ctx.fillStyle = rgbToString(p.color, p.alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    animationRef.current = requestAnimationFrame(draw);
  }, [isPlaying, config, spawnParticle]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  return (
    <div className="bg-bg-card rounded-xl p-4 md:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${isPlaying ? 'bg-[#e17055] text-white' : 'bg-[#00b894] text-white'}`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => poolRef.current.clear()}
          className="px-4 py-2 rounded-lg bg-bg-secondary text-white flex items-center gap-2 hover:bg-bg-secondary/80"
        >
          <RotateCcw className="w-4 h-4" />
          Clear
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <canvas
          ref={canvasRef}
          width={600}
          height={360}
          className="w-full rounded-lg border border-border"
          style={{ maxWidth: '600px' }}
        />

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Emitter</label>
              <select
                value={config.emitterType}
                onChange={(e) => setConfig(prev => ({ ...prev, emitterType: e.target.value as any }))}
                className="w-full bg-bg-secondary rounded px-2 py-1.5 text-sm"
              >
                <option value="point">Point</option>
                <option value="line">Line</option>
                <option value="circle">Circle</option>
                <option value="box">Box</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Blend Mode</label>
              <select
                value={config.blendMode}
                onChange={(e) => setConfig(prev => ({ ...prev, blendMode: e.target.value as any }))}
                className="w-full bg-bg-secondary rounded px-2 py-1.5 text-sm"
              >
                <option value="normal">Normal</option>
                <option value="additive">Additive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Count: {config.count}</label>
            <input type="range" min="10" max="200" value={config.count}
              onChange={(e) => setConfig(prev => ({ ...prev, count: Number(e.target.value) }))}
              className="w-full accent-[#00b894]" />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Lifetime: {config.lifetime.toFixed(1)}s</label>
            <input type="range" min="0.5" max="5" step="0.1" value={config.lifetime}
              onChange={(e) => setConfig(prev => ({ ...prev, lifetime: Number(e.target.value) }))}
              className="w-full accent-[#fdcb6e]" />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Speed: {config.speed}</label>
            <input type="range" min="10" max="200" value={config.speed}
              onChange={(e) => setConfig(prev => ({ ...prev, speed: Number(e.target.value) }))}
              className="w-full accent-[#74b9ff]" />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Gravity: {config.gravity}</label>
            <input type="range" min="-200" max="200" value={config.gravity}
              onChange={(e) => setConfig(prev => ({ ...prev, gravity: Number(e.target.value) }))}
              className="w-full accent-[#e17055]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Start Color</label>
              <input type="color" value={config.startColor}
                onChange={(e) => setConfig(prev => ({ ...prev, startColor: e.target.value }))}
                className="w-full h-8 rounded cursor-pointer" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">End Color</label>
              <input type="color" value={config.endColor}
                onChange={(e) => setConfig(prev => ({ ...prev, endColor: e.target.value }))}
                className="w-full h-8 rounded cursor-pointer" />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setConfig(prev => ({ ...prev, alphaFade: !prev.alphaFade }))}
              className={`flex-1 px-3 py-2 rounded text-sm ${config.alphaFade ? 'bg-[#00b894] text-white' : 'bg-bg-secondary text-text-secondary'}`}
            >
              Alpha Fade
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
