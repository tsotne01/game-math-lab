import { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

// Game constants
const SHIP_SIZE = 20;
const SHIP_TURN_SPEED = 0.08;
const SHIP_THRUST = 0.15;
const SHIP_FRICTION = 0.99;
const BULLET_SPEED = 8;
const BULLET_LIFETIME = 60;
const ASTEROID_SPEED = 1.5;
const ASTEROID_SIZES = [40, 25, 15];
const ASTEROID_POINTS = [20, 50, 100];
const INITIAL_ASTEROIDS = 4;
const INVINCIBILITY_TIME = 120;

interface Vec2 {
  x: number;
  y: number;
}

interface Ship {
  x: number;
  y: number;
  angle: number;  // in radians!
  vx: number;
  vy: number;
  thrusting: boolean;
  invincible: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  sizeIndex: number;
  vertices: Vec2[];
}

// Generate random asteroid shape
function generateAsteroidVertices(size: number): Vec2[] {
  const vertices: Vec2[] = [];
  const numVertices = 8 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numVertices; i++) {
    const angle = (i / numVertices) * Math.PI * 2;
    const radius = size * (0.7 + Math.random() * 0.3);
    vertices.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    });
  }
  return vertices;
}

// Screen wrapping
function wrap(value: number, max: number): number {
  if (value < 0) return max;
  if (value > max) return 0;
  return value;
}

// Circle collision
function circleCollision(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < r1 + r2;
}

export default function Asteroids() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const keysRef = useRef<Set<string>>(new Set());
  const gameRef = useRef<{
    ship: Ship;
    bullets: Bullet[];
    asteroids: Asteroid[];
    running: boolean;
    wave: number;
  } | null>(null);

  const width = 700;
  const height = 500;

  const createAsteroid = useCallback((x: number, y: number, sizeIndex: number): Asteroid => {
    const angle = Math.random() * Math.PI * 2;
    const speed = ASTEROID_SPEED * (1 + Math.random() * 0.5);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: ASTEROID_SIZES[sizeIndex],
      sizeIndex,
      vertices: generateAsteroidVertices(ASTEROID_SIZES[sizeIndex])
    };
  }, []);

  const spawnAsteroids = useCallback((count: number) => {
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < count; i++) {
      // Spawn on edges
      let x: number, y: number;
      if (Math.random() > 0.5) {
        x = Math.random() > 0.5 ? 0 : width;
        y = Math.random() * height;
      } else {
        x = Math.random() * width;
        y = Math.random() > 0.5 ? 0 : height;
      }
      asteroids.push(createAsteroid(x, y, 0));
    }
    return asteroids;
  }, [createAsteroid]);

  const initGame = useCallback(() => {
    gameRef.current = {
      ship: {
        x: width / 2,
        y: height / 2,
        angle: -Math.PI / 2, // Pointing up
        vx: 0,
        vy: 0,
        thrusting: false,
        invincible: INVINCIBILITY_TIME
      },
      bullets: [],
      asteroids: spawnAsteroids(INITIAL_ASTEROIDS),
      running: false,
      wave: 1
    };
  }, [spawnAsteroids]);

  const respawnShip = useCallback(() => {
    if (!gameRef.current) return;
    gameRef.current.ship = {
      x: width / 2,
      y: height / 2,
      angle: -Math.PI / 2,
      vx: 0,
      vy: 0,
      thrusting: false,
      invincible: INVINCIBILITY_TIME
    };
  }, []);

  const shoot = useCallback(() => {
    if (!gameRef.current?.running) return;
    const { ship, bullets } = gameRef.current;
    
    // Limit bullets
    if (bullets.length >= 5) return;
    
    bullets.push({
      x: ship.x + Math.cos(ship.angle) * SHIP_SIZE,
      y: ship.y + Math.sin(ship.angle) * SHIP_SIZE,
      vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
      vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
      life: BULLET_LIFETIME
    });
  }, []);

  const startGame = useCallback(() => {
    initGame();
    if (gameRef.current) {
      gameRef.current.running = true;
    }
    setScore(0);
    setLives(3);
    setGameState('playing');
  }, [initGame]);

  useEffect(() => {
    initGame();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
        
        if (e.key === ' ' && gameState === 'playing') {
          shoot();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [initGame, shoot, gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    let animationId: number;
    let lastTime = 0;

    const update = () => {
      if (!gameRef.current?.running) return;
      const { ship, bullets, asteroids } = gameRef.current;

      // Ship rotation - THIS IS WHERE TRIG MATTERS!
      if (keysRef.current.has('ArrowLeft')) {
        ship.angle -= SHIP_TURN_SPEED;
      }
      if (keysRef.current.has('ArrowRight')) {
        ship.angle += SHIP_TURN_SPEED;
      }

      // Thrust - using cos/sin to convert angle to direction vector
      ship.thrusting = keysRef.current.has('ArrowUp');
      if (ship.thrusting) {
        // This is the key formula: angle → velocity vector
        ship.vx += Math.cos(ship.angle) * SHIP_THRUST;
        ship.vy += Math.sin(ship.angle) * SHIP_THRUST;
      }

      // Apply friction
      ship.vx *= SHIP_FRICTION;
      ship.vy *= SHIP_FRICTION;

      // Move ship
      ship.x += ship.vx;
      ship.y += ship.vy;

      // Screen wrapping
      ship.x = wrap(ship.x, width);
      ship.y = wrap(ship.y, height);

      // Decrease invincibility
      if (ship.invincible > 0) ship.invincible--;

      // Update bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        bullet.x = wrap(bullet.x, width);
        bullet.y = wrap(bullet.y, height);
        bullet.life--;
        
        if (bullet.life <= 0) {
          bullets.splice(i, 1);
        }
      }

      // Update asteroids
      for (const asteroid of asteroids) {
        asteroid.x += asteroid.vx;
        asteroid.y += asteroid.vy;
        asteroid.x = wrap(asteroid.x, width);
        asteroid.y = wrap(asteroid.y, height);
      }

      // Bullet-asteroid collisions
      for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const bullet = bullets[bi];
        for (let ai = asteroids.length - 1; ai >= 0; ai--) {
          const asteroid = asteroids[ai];
          if (circleCollision(bullet.x, bullet.y, 3, asteroid.x, asteroid.y, asteroid.size)) {
            // Remove bullet
            bullets.splice(bi, 1);
            
            // Add score
            setScore(s => s + ASTEROID_POINTS[asteroid.sizeIndex]);
            
            // Split asteroid
            if (asteroid.sizeIndex < 2) {
              asteroids.push(createAsteroid(asteroid.x, asteroid.y, asteroid.sizeIndex + 1));
              asteroids.push(createAsteroid(asteroid.x, asteroid.y, asteroid.sizeIndex + 1));
            }
            asteroids.splice(ai, 1);
            break;
          }
        }
      }

      // Ship-asteroid collision
      if (ship.invincible <= 0) {
        for (const asteroid of asteroids) {
          if (circleCollision(ship.x, ship.y, SHIP_SIZE * 0.5, asteroid.x, asteroid.y, asteroid.size * 0.8)) {
            setLives(l => {
              const newLives = l - 1;
              if (newLives <= 0) {
                gameRef.current!.running = false;
                setHighScore(h => Math.max(h, score));
                setGameState('gameover');
              } else {
                respawnShip();
              }
              return newLives;
            });
            break;
          }
        }
      }

      // Next wave
      if (asteroids.length === 0) {
        gameRef.current.wave++;
        gameRef.current.asteroids = spawnAsteroids(INITIAL_ASTEROIDS + gameRef.current.wave - 1);
        ship.invincible = INVINCIBILITY_TIME;
      }
    };

    const render = (time: number) => {
      if (time - lastTime > 16) {
        update();
        lastTime = time;
      }

      // Background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      // Stars
      ctx.fillStyle = '#2a2a3a';
      for (let i = 0; i < 50; i++) {
        const sx = (i * 137.5) % width;
        const sy = (i * 97.3) % height;
        ctx.fillRect(sx, sy, 1, 1);
      }

      if (gameRef.current) {
        const { ship, bullets, asteroids } = gameRef.current;

        // Draw asteroids
        ctx.strokeStyle = '#a0a0b0';
        ctx.lineWidth = 2;
        for (const asteroid of asteroids) {
          ctx.beginPath();
          const first = asteroid.vertices[0];
          ctx.moveTo(asteroid.x + first.x, asteroid.y + first.y);
          for (let i = 1; i < asteroid.vertices.length; i++) {
            const v = asteroid.vertices[i];
            ctx.lineTo(asteroid.x + v.x, asteroid.y + v.y);
          }
          ctx.closePath();
          ctx.stroke();
        }

        // Draw bullets
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#6c5ce7';
        ctx.shadowBlur = 10;
        for (const bullet of bullets) {
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Draw ship
        const blinkOff = ship.invincible > 0 && Math.floor(ship.invincible / 5) % 2 === 0;
        if (!blinkOff) {
          ctx.strokeStyle = '#6c5ce7';
          ctx.lineWidth = 2;
          ctx.beginPath();
          
          // Triangle ship pointing in direction of angle
          // Nose
          const noseX = ship.x + Math.cos(ship.angle) * SHIP_SIZE;
          const noseY = ship.y + Math.sin(ship.angle) * SHIP_SIZE;
          
          // Left wing (angle + 140 degrees)
          const leftAngle = ship.angle + (Math.PI * 0.78);
          const leftX = ship.x + Math.cos(leftAngle) * SHIP_SIZE * 0.8;
          const leftY = ship.y + Math.sin(leftAngle) * SHIP_SIZE * 0.8;
          
          // Right wing (angle - 140 degrees)
          const rightAngle = ship.angle - (Math.PI * 0.78);
          const rightX = ship.x + Math.cos(rightAngle) * SHIP_SIZE * 0.8;
          const rightY = ship.y + Math.sin(rightAngle) * SHIP_SIZE * 0.8;
          
          ctx.moveTo(noseX, noseY);
          ctx.lineTo(leftX, leftY);
          ctx.lineTo(ship.x - Math.cos(ship.angle) * SHIP_SIZE * 0.3, ship.y - Math.sin(ship.angle) * SHIP_SIZE * 0.3);
          ctx.lineTo(rightX, rightY);
          ctx.closePath();
          ctx.stroke();

          // Draw thrust flame
          if (ship.thrusting) {
            ctx.strokeStyle = '#e17055';
            ctx.beginPath();
            const thrustAngle = ship.angle + Math.PI;
            const flameLen = SHIP_SIZE * (0.5 + Math.random() * 0.5);
            ctx.moveTo(ship.x - Math.cos(ship.angle) * SHIP_SIZE * 0.3, ship.y - Math.sin(ship.angle) * SHIP_SIZE * 0.3);
            ctx.lineTo(
              ship.x + Math.cos(thrustAngle) * flameLen,
              ship.y + Math.sin(thrustAngle) * flameLen
            );
            ctx.stroke();
          }
        }

        // Draw ship direction indicator (for learning)
        if (gameState === 'playing') {
          ctx.strokeStyle = 'rgba(108, 92, 231, 0.3)';
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(ship.x, ship.y);
          ctx.lineTo(
            ship.x + Math.cos(ship.angle) * 50,
            ship.y + Math.sin(ship.angle) * 50
          );
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // UI
      ctx.font = 'bold 24px Inter, monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Score: ${score}`, 20, 35);
      
      ctx.fillStyle = '#6c5ce7';
      ctx.fillText('♦'.repeat(lives), 20, 65);

      // Overlay
      if (gameState !== 'playing') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.textAlign = 'center';

        if (gameState === 'gameover') {
          ctx.fillText('GAME OVER', width / 2, height / 2 - 30);
          ctx.font = '24px Inter, sans-serif';
          ctx.fillText(`Final Score: ${score}`, width / 2, height / 2 + 20);
          if (highScore > 0) {
            ctx.fillStyle = '#6c5ce7';
            ctx.fillText(`High Score: ${highScore}`, width / 2, height / 2 + 55);
          }
        } else {
          ctx.fillText('ASTEROIDS', width / 2, height / 2 - 30);
          ctx.font = '18px Inter, sans-serif';
          ctx.fillStyle = '#a0a0b0';
          ctx.fillText('← → to rotate | ↑ to thrust | SPACE to shoot', width / 2, height / 2 + 20);
        }

        ctx.textAlign = 'left';
      }

      animationId = requestAnimationFrame(render);
    };

    render(0);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameState, score, lives, highScore, createAsteroid, spawnAsteroids, respawnShip]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg cursor-crosshair"
        style={{ width, height }}
        tabIndex={0}
      />
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={startGame}
          className="px-6 py-2 bg-[#6c5ce7] text-white font-semibold rounded-lg hover:bg-[#8677ed] transition-colors"
        >
          {gameState === 'playing' ? 'Restart' : gameState === 'gameover' ? 'Play Again' : 'Start Game'}
        </button>
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3 flex items-center justify-center gap-1">
        <ArrowLeft className="w-4 h-4 inline" /> <ArrowRight className="w-4 h-4 inline" /> Rotate | <ArrowUp className="w-4 h-4 inline" /> Thrust | SPACE Shoot | Ship wraps around edges!
      </p>
    </div>
  );
}

// Interactive Unit Circle Visualizer
export function UnitCircleVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [angle, setAngle] = useState(Math.PI / 4);
  const [isDragging, setIsDragging] = useState(false);

  const width = 400;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 150;

  const updateAngle = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - centerX;
    const y = e.clientY - rect.top - centerY;
    setAngle(Math.atan2(y, x));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(centerX + i * 50, 0);
      ctx.lineTo(centerX + i * 50, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, centerY + i * 50);
      ctx.lineTo(width, centerY + i * 50);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#3a3a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Unit circle
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Point on circle
    const px = centerX + Math.cos(angle) * radius;
    const py = centerY + Math.sin(angle) * radius;

    // Angle arc
    ctx.strokeStyle = '#fdcb6e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, angle, angle < 0);
    ctx.stroke();

    // Cos line (x projection)
    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(px, centerY);
    ctx.stroke();

    // Sin line (y projection)
    ctx.strokeStyle = '#e17055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, centerY);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Radius line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Point
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#6c5ce7';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Labels
    ctx.font = '14px Inter, monospace';
    ctx.fillStyle = '#00b894';
    ctx.fillText(`cos(θ) = ${Math.cos(angle).toFixed(3)}`, 20, 30);
    ctx.fillStyle = '#e17055';
    ctx.fillText(`sin(θ) = ${Math.sin(angle).toFixed(3)}`, 20, 50);
    ctx.fillStyle = '#fdcb6e';
    const degrees = ((angle * 180 / Math.PI) + 360) % 360;
    ctx.fillText(`θ = ${angle.toFixed(2)} rad = ${degrees.toFixed(0)}°`, 20, 70);

    // Coordinate label
    ctx.fillStyle = '#a0a0b0';
    ctx.fillText(`(${Math.cos(angle).toFixed(2)}, ${Math.sin(angle).toFixed(2)})`, px + 15, py - 10);

  }, [angle]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg cursor-crosshair"
        style={{ width, height }}
        onMouseMove={isDragging ? updateAngle : undefined}
        onMouseDown={(e) => { setIsDragging(true); updateAngle(e); }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      />
      <p className="text-center text-sm text-[#a0a0b0] mt-3">
        Click and drag to change the angle. Watch how sin and cos change!
      </p>
      <div className="flex justify-center gap-4 mt-3">
        <span className="text-[#00b894]">■ cos(θ) = x</span>
        <span className="text-[#e17055]">■ sin(θ) = y</span>
        <span className="text-[#fdcb6e]">■ angle</span>
      </div>
    </div>
  );
}

// Rotation Matrix Demo
export function RotationDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotationAngle, setRotationAngle] = useState(0);

  const width = 400;
  const height = 300;
  const centerX = width / 2;
  const centerY = height / 2;

  // Original shape vertices
  const originalShape: Vec2[] = [
    { x: 0, y: -40 },
    { x: 30, y: 40 },
    { x: -30, y: 40 }
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(centerX + i * 25, 0);
      ctx.lineTo(centerX + i * 25, height);
      ctx.moveTo(0, centerY + i * 25);
      ctx.lineTo(width, centerY + i * 25);
      ctx.stroke();
    }

    // Original shape (faded)
    ctx.strokeStyle = '#3a3a4a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(centerX + originalShape[0].x, centerY + originalShape[0].y);
    for (let i = 1; i < originalShape.length; i++) {
      ctx.lineTo(centerX + originalShape[i].x, centerY + originalShape[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Rotated shape using rotation matrix!
    // x' = x*cos(θ) - y*sin(θ)
    // y' = x*sin(θ) + y*cos(θ)
    const cos = Math.cos(rotationAngle);
    const sin = Math.sin(rotationAngle);
    
    const rotatedShape = originalShape.map(v => ({
      x: v.x * cos - v.y * sin,
      y: v.x * sin + v.y * cos
    }));

    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX + rotatedShape[0].x, centerY + rotatedShape[0].y);
    for (let i = 1; i < rotatedShape.length; i++) {
      ctx.lineTo(centerX + rotatedShape[i].x, centerY + rotatedShape[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw rotation indicator
    ctx.strokeStyle = '#fdcb6e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60, -Math.PI / 2, -Math.PI / 2 + rotationAngle, rotationAngle < 0);
    ctx.stroke();

    // Formula display
    ctx.font = '12px Inter, monospace';
    ctx.fillStyle = '#a0a0b0';
    ctx.fillText('Rotation Matrix:', 10, 25);
    ctx.fillStyle = '#6c5ce7';
    ctx.fillText(`x' = x·cos(${(rotationAngle * 180 / Math.PI).toFixed(0)}°) - y·sin(${(rotationAngle * 180 / Math.PI).toFixed(0)}°)`, 10, 45);
    ctx.fillText(`y' = x·sin(${(rotationAngle * 180 / Math.PI).toFixed(0)}°) + y·cos(${(rotationAngle * 180 / Math.PI).toFixed(0)}°)`, 10, 65);

  }, [rotationAngle]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg"
        style={{ width, height }}
      />
      <div className="flex flex-col items-center mt-4">
        <input
          type="range"
          min={-Math.PI}
          max={Math.PI}
          step={0.01}
          value={rotationAngle}
          onChange={(e) => setRotationAngle(parseFloat(e.target.value))}
          className="w-64 accent-[#6c5ce7]"
        />
        <p className="text-sm text-[#a0a0b0] mt-2">
          Angle: {(rotationAngle * 180 / Math.PI).toFixed(0)}° ({rotationAngle.toFixed(2)} rad)
        </p>
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3">
        Drag the slider to rotate. The rotation matrix transforms each point!
      </p>
    </div>
  );
}
