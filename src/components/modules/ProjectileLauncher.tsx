import { useRef, useEffect, useState, useCallback } from 'react';

// ============== PHYSICS CONSTANTS ==============
const GRAVITY = 0.5;
const DRAG = 0.999;
const GROUND_FRICTION = 0.8;
const BOUNCE_DAMPING = 0.6;
const MAX_POWER = 25;
const SLINGSHOT_X = 120;
const SLINGSHOT_Y = 350;

// ============== TYPES ==============
interface Vec2 {
  x: number;
  y: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
  trail: Vec2[];
}

interface Target {
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  destroyed: boolean;
  vx: number;
  vy: number;
  angle: number;
  angularVel: number;
}

// ============== VECTOR MATH ==============
function magnitude(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalize(v: Vec2): Vec2 {
  const mag = magnitude(v);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============== COLLISION ==============
function circleRectCollision(
  cx: number, cy: number, radius: number,
  rx: number, ry: number, rw: number, rh: number
): { collision: boolean; penetration: Vec2; normal: Vec2 } {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  
  const dx = cx - closestX;
  const dy = cy - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < radius) {
    const normal = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: -1 };
    return {
      collision: true,
      penetration: { x: normal.x * (radius - dist), y: normal.y * (radius - dist) },
      normal
    };
  }
  
  return { collision: false, penetration: { x: 0, y: 0 }, normal: { x: 0, y: 0 } };
}

// ============== TRAJECTORY PREDICTION ==============
function predictTrajectory(
  startX: number, startY: number,
  vx: number, vy: number,
  gravity: number,
  steps: number,
  groundY: number
): Vec2[] {
  const points: Vec2[] = [];
  let x = startX, y = startY;
  let velX = vx, velY = vy;
  
  for (let i = 0; i < steps && y < groundY + 50; i++) {
    points.push({ x, y });
    velY += gravity;
    x += velX;
    y += velY;
    velX *= DRAG;
    velY *= DRAG;
  }
  
  return points;
}

// ============== MAIN GAME COMPONENT ==============
export default function ProjectileLauncher() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<Vec2 | null>(null);
  const [score, setScore] = useState(0);
  const [projectilesLeft, setProjectilesLeft] = useState(3);
  const [gameState, setGameState] = useState<'aiming' | 'flying' | 'won' | 'lost'>('aiming');
  
  const gameRef = useRef<{
    projectile: Projectile | null;
    targets: Target[];
    groundY: number;
  }>({
    projectile: null,
    targets: [],
    groundY: 380
  });

  const width = 800;
  const height = 420;

  // Initialize targets
  const initTargets = useCallback(() => {
    gameRef.current.targets = [
      // Ground blocks
      { x: 550, y: 340, width: 40, height: 40, health: 1, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
      { x: 600, y: 340, width: 40, height: 40, health: 1, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
      { x: 650, y: 340, width: 40, height: 40, health: 1, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
      // Second layer
      { x: 565, y: 300, width: 30, height: 40, health: 1, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
      { x: 635, y: 300, width: 30, height: 40, health: 1, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
      // Top block
      { x: 590, y: 260, width: 50, height: 40, health: 2, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
      // Right tower
      { x: 720, y: 320, width: 30, height: 60, health: 1, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
      { x: 720, y: 280, width: 30, height: 40, health: 1, destroyed: false, vx: 0, vy: 0, angle: 0, angularVel: 0 },
    ];
  }, []);

  const resetGame = useCallback(() => {
    gameRef.current.projectile = null;
    initTargets();
    setScore(0);
    setProjectilesLeft(3);
    setGameState('aiming');
  }, [initTargets]);

  useEffect(() => {
    initTargets();
  }, [initTargets]);

  // Handle mouse/touch events
  const getMousePos = useCallback((e: MouseEvent | TouchEvent): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (width / rect.width),
      y: (clientY - rect.top) * (height / rect.height)
    };
  }, []);

  const handleStart = useCallback((e: MouseEvent | TouchEvent) => {
    if (gameState !== 'aiming' || projectilesLeft <= 0) return;
    const pos = getMousePos(e);
    const dist = magnitude({ x: pos.x - SLINGSHOT_X, y: pos.y - SLINGSHOT_Y });
    if (dist < 60) {
      setIsDragging(true);
      setDragPos(pos);
    }
  }, [gameState, projectilesLeft, getMousePos]);

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setDragPos(getMousePos(e));
  }, [isDragging, getMousePos]);

  const handleEnd = useCallback(() => {
    if (!isDragging || !dragPos) return;
    
    const pullX = SLINGSHOT_X - dragPos.x;
    const pullY = SLINGSHOT_Y - dragPos.y;
    const power = Math.min(magnitude({ x: pullX, y: pullY }), MAX_POWER * 4) / 4;
    
    if (power > 2) {
      const dir = normalize({ x: pullX, y: pullY });
      gameRef.current.projectile = {
        x: SLINGSHOT_X,
        y: SLINGSHOT_Y,
        vx: dir.x * power,
        vy: dir.y * power,
        radius: 15,
        active: true,
        trail: []
      };
      setProjectilesLeft(p => p - 1);
      setGameState('flying');
    }
    
    setIsDragging(false);
    setDragPos(null);
  }, [isDragging, dragPos]);

  // Canvas event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => handleStart(e);
    const onMouseMove = (e: MouseEvent) => handleMove(e);
    const onMouseUp = () => handleEnd();
    const onTouchStart = (e: TouchEvent) => handleStart(e);
    const onTouchMove = (e: TouchEvent) => handleMove(e);
    const onTouchEnd = () => handleEnd();

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleStart, handleMove, handleEnd]);

  // Game loop
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

    const update = () => {
      const { projectile, targets, groundY } = gameRef.current;
      
      if (projectile && projectile.active) {
        // Apply gravity
        projectile.vy += GRAVITY;
        
        // Apply air drag
        projectile.vx *= DRAG;
        projectile.vy *= DRAG;
        
        // Update position
        projectile.x += projectile.vx;
        projectile.y += projectile.vy;
        
        // Add to trail
        projectile.trail.push({ x: projectile.x, y: projectile.y });
        if (projectile.trail.length > 50) projectile.trail.shift();
        
        // Ground collision
        if (projectile.y + projectile.radius > groundY) {
          projectile.y = groundY - projectile.radius;
          projectile.vy *= -BOUNCE_DAMPING;
          projectile.vx *= GROUND_FRICTION;
          
          // Stop if barely moving
          if (Math.abs(projectile.vy) < 0.5 && Math.abs(projectile.vx) < 0.5) {
            projectile.active = false;
          }
        }
        
        // Wall collision
        if (projectile.x < projectile.radius) {
          projectile.x = projectile.radius;
          projectile.vx *= -BOUNCE_DAMPING;
        }
        if (projectile.x > width - projectile.radius) {
          projectile.x = width - projectile.radius;
          projectile.vx *= -BOUNCE_DAMPING;
        }
        
        // Target collisions
        for (const target of targets) {
          if (target.destroyed) continue;
          
          const collision = circleRectCollision(
            projectile.x, projectile.y, projectile.radius,
            target.x, target.y, target.width, target.height
          );
          
          if (collision.collision) {
            // Push projectile out
            projectile.x += collision.penetration.x;
            projectile.y += collision.penetration.y;
            
            // Calculate impact force
            const impactSpeed = magnitude({ x: projectile.vx, y: projectile.vy });
            
            // Reflect velocity
            const dot = projectile.vx * collision.normal.x + projectile.vy * collision.normal.y;
            projectile.vx = (projectile.vx - 2 * dot * collision.normal.x) * BOUNCE_DAMPING;
            projectile.vy = (projectile.vy - 2 * dot * collision.normal.y) * BOUNCE_DAMPING;
            
            // Damage target
            if (impactSpeed > 3) {
              target.health--;
              target.vx += collision.normal.x * impactSpeed * 0.5;
              target.vy += collision.normal.y * impactSpeed * 0.3 - 2;
              target.angularVel = (Math.random() - 0.5) * 0.3;
              
              if (target.health <= 0) {
                target.destroyed = true;
                setScore(s => s + 100);
              }
            }
          }
        }
        
        // Check if projectile stopped or went off screen
        if (projectile.y > groundY + 50 || projectile.x > width + 50) {
          projectile.active = false;
        }
      }
      
      // Update destroyed targets (falling animation)
      for (const target of targets) {
        if (target.destroyed && target.y < groundY + 100) {
          target.vy += GRAVITY * 0.5;
          target.x += target.vx;
          target.y += target.vy;
          target.angle += target.angularVel;
          target.vx *= 0.99;
        }
      }
      
      // Check game state
      if (gameState === 'flying' && projectile && !projectile.active) {
        const activeTargets = targets.filter(t => !t.destroyed);
        if (activeTargets.length === 0) {
          setGameState('won');
        } else if (projectilesLeft <= 0) {
          setGameState('lost');
        } else {
          setGameState('aiming');
        }
      }
    };

    const render = () => {
      const { projectile, targets, groundY } = gameRef.current;
      
      // Clear with gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0a0a1a');
      gradient.addColorStop(1, '#1a1a2e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Stars
      ctx.fillStyle = '#ffffff33';
      for (let i = 0; i < 50; i++) {
        const sx = (i * 73) % width;
        const sy = (i * 47) % (groundY - 50);
        ctx.beginPath();
        ctx.arc(sx, sy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Ground
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(0, groundY, width, height - groundY);
      
      // Ground texture
      ctx.strokeStyle = '#3d4446';
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x + 10, groundY + 40);
        ctx.stroke();
      }
      
      // Slingshot
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(SLINGSHOT_X - 5, SLINGSHOT_Y, 10, 40);
      ctx.fillRect(SLINGSHOT_X - 25, SLINGSHOT_Y - 10, 20, 10);
      ctx.fillRect(SLINGSHOT_X + 5, SLINGSHOT_Y - 10, 20, 10);
      
      // Trajectory preview
      if (isDragging && dragPos) {
        const pullX = SLINGSHOT_X - dragPos.x;
        const pullY = SLINGSHOT_Y - dragPos.y;
        const power = Math.min(magnitude({ x: pullX, y: pullY }), MAX_POWER * 4) / 4;
        const dir = normalize({ x: pullX, y: pullY });
        
        // Elastic band
        ctx.strokeStyle = '#e17055';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(SLINGSHOT_X - 20, SLINGSHOT_Y - 5);
        ctx.lineTo(dragPos.x, dragPos.y);
        ctx.lineTo(SLINGSHOT_X + 20, SLINGSHOT_Y - 5);
        ctx.stroke();
        
        // Projectile in sling
        ctx.fillStyle = '#fdcb6e';
        ctx.shadowColor = '#fdcb6e';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(dragPos.x, dragPos.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Trajectory prediction
        if (power > 2) {
          const trajectory = predictTrajectory(
            SLINGSHOT_X, SLINGSHOT_Y,
            dir.x * power, dir.y * power,
            GRAVITY, 60, groundY
          );
          
          ctx.strokeStyle = '#6c5ce766';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          trajectory.forEach((point, i) => {
            if (i === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Dots along trajectory
          ctx.fillStyle = '#6c5ce7';
          trajectory.forEach((point, i) => {
            if (i % 5 === 0) {
              ctx.beginPath();
              ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          });
        }
        
        // Power indicator
        ctx.fillStyle = power > MAX_POWER * 0.7 ? '#e17055' : '#00b894';
        ctx.fillRect(20, 20, (power / MAX_POWER) * 100, 10);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(20, 20, 100, 10);
      } else if (gameState === 'aiming' && projectilesLeft > 0) {
        // Ready projectile
        ctx.fillStyle = '#fdcb6e';
        ctx.shadowColor = '#fdcb6e';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(SLINGSHOT_X, SLINGSHOT_Y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      
      // Projectile trail
      if (projectile && projectile.trail.length > 1) {
        ctx.strokeStyle = '#fdcb6e44';
        ctx.lineWidth = 4;
        ctx.beginPath();
        projectile.trail.forEach((point, i) => {
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      }
      
      // Flying projectile
      if (projectile && projectile.active) {
        ctx.fillStyle = '#fdcb6e';
        ctx.shadowColor = '#fdcb6e';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Motion blur effect
        ctx.fillStyle = '#fdcb6e33';
        const speed = magnitude({ x: projectile.vx, y: projectile.vy });
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(
            projectile.x - projectile.vx * i * 0.3,
            projectile.y - projectile.vy * i * 0.3,
            projectile.radius * (1 - i * 0.2),
            0, Math.PI * 2
          );
          ctx.fill();
        }
      }
      
      // Targets
      for (const target of targets) {
        if (target.y > height + 50) continue;
        
        ctx.save();
        ctx.translate(target.x + target.width / 2, target.y + target.height / 2);
        ctx.rotate(target.angle);
        
        // Target block
        const color = target.destroyed ? '#666' : (target.health > 1 ? '#e17055' : '#00b894');
        ctx.fillStyle = color;
        ctx.fillRect(-target.width / 2, -target.height / 2, target.width, target.height);
        
        // Block border
        ctx.strokeStyle = target.destroyed ? '#444' : '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-target.width / 2, -target.height / 2, target.width, target.height);
        
        // Health indicator for strong blocks
        if (!target.destroyed && target.health > 1) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 16px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(target.health.toString(), 0, 6);
        }
        
        ctx.restore();
      }
      
      // UI
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Score: ${score}`, 20, 60);
      
      // Projectiles left indicator
      ctx.fillStyle = '#fdcb6e';
      for (let i = 0; i < projectilesLeft; i++) {
        ctx.beginPath();
        ctx.arc(20 + i * 30, 90, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Game over screens
      if (gameState === 'won' || gameState === 'lost') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          gameState === 'won' ? '🎉 Victory!' : 'Try Again!',
          width / 2, height / 2 - 20
        );
        ctx.font = '20px Inter, sans-serif';
        ctx.fillText(`Final Score: ${score}`, width / 2, height / 2 + 20);
      }

      animationId = requestAnimationFrame(render);
      update();
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isDragging, dragPos, gameState, score, projectilesLeft]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg cursor-crosshair touch-none"
        style={{ width, height }}
      />
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={resetGame}
          className="px-6 py-2 bg-[#6c5ce7] text-white font-semibold rounded-lg hover:bg-[#8677ed] transition-colors"
        >
          Reset Game
        </button>
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3">
        🎯 Drag from the slingshot to aim and release to fire!
      </p>
    </div>
  );
}

// ============== GRAVITY VISUALIZER COMPONENT ==============
export function GravityVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gravity, setGravity] = useState(9.8);
  const ballsRef = useRef<{ y: number; vy: number; color: string }[]>([]);

  const width = 600;
  const height = 300;
  const groundY = 260;

  const resetBalls = useCallback(() => {
    ballsRef.current = [
      { y: 50, vy: 0, color: '#6c5ce7' },
      { y: 50, vy: 0, color: '#00b894' },
      { y: 50, vy: 0, color: '#e17055' },
    ];
  }, []);

  useEffect(() => {
    resetBalls();
  }, [gravity, resetBalls]);

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
    const scaledGravity = gravity / 60; // Scale to per-frame

    const render = () => {
      // Background
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, width, height);

      // Ground
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(0, groundY, width, height - groundY);

      // Update and draw balls
      ballsRef.current.forEach((ball, i) => {
        ball.vy += scaledGravity;
        ball.y += ball.vy;

        // Ground bounce
        if (ball.y > groundY - 15) {
          ball.y = groundY - 15;
          ball.vy *= -0.7;
          if (Math.abs(ball.vy) < 0.5) ball.vy = 0;
        }

        // Draw ball
        ctx.fillStyle = ball.color;
        ctx.shadowColor = ball.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(100 + i * 200, ball.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Velocity arrow
        if (Math.abs(ball.vy) > 0.5) {
          ctx.strokeStyle = ball.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(100 + i * 200, ball.y);
          ctx.lineTo(100 + i * 200, ball.y + ball.vy * 5);
          ctx.stroke();
          
          // Arrow head
          const arrowY = ball.y + ball.vy * 5;
          ctx.beginPath();
          ctx.moveTo(100 + i * 200 - 5, arrowY - Math.sign(ball.vy) * 5);
          ctx.lineTo(100 + i * 200, arrowY);
          ctx.lineTo(100 + i * 200 + 5, arrowY - Math.sign(ball.vy) * 5);
          ctx.stroke();
        }
      });

      // Labels
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`g = ${gravity.toFixed(1)} m/s²`, width / 2, 30);

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gravity]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg"
        style={{ width, height }}
      />
      <div className="flex flex-col items-center gap-4 mt-4">
        <div className="flex items-center gap-4">
          <span className="text-[#a0a0b0]">Gravity:</span>
          <input
            type="range"
            min="1"
            max="25"
            step="0.1"
            value={gravity}
            onChange={(e) => setGravity(parseFloat(e.target.value))}
            className="w-48 accent-[#6c5ce7]"
          />
          <span className="text-white w-20">{gravity.toFixed(1)} m/s²</span>
        </div>
        <button
          onClick={resetBalls}
          className="px-4 py-2 bg-[#2a2a3a] text-white rounded-lg hover:bg-[#3a3a4a] transition-colors"
        >
          Drop Again
        </button>
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3">
        Earth: 9.8 m/s² | Moon: 1.6 m/s² | Jupiter: 24.8 m/s²
      </p>
    </div>
  );
}

// ============== TRAJECTORY CALCULATOR COMPONENT ==============
export function TrajectoryCalculator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [velocity, setVelocity] = useState(20);
  const [angle, setAngle] = useState(45);

  const width = 600;
  const height = 350;
  const originX = 50;
  const originY = 300;
  const scale = 3;

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
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    for (let x = originX; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, originY);
      ctx.stroke();
    }
    for (let y = originY; y > 0; y -= 50) {
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(width - 20, originY);
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX, 20);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#a0a0b0';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Distance (m)', width / 2, originY + 30);
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Height (m)', 0, 0);
    ctx.restore();

    // Calculate trajectory
    const g = 9.8;
    const radAngle = (angle * Math.PI) / 180;
    const vx = velocity * Math.cos(radAngle);
    const vy = velocity * Math.sin(radAngle);

    // Time of flight
    const tFlight = (2 * vy) / g;
    // Max height
    const maxHeight = (vy * vy) / (2 * g);
    // Range
    const range = vx * tFlight;

    // Draw trajectory
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * tFlight;
      const x = vx * t;
      const y = vy * t - 0.5 * g * t * t;
      
      const canvasX = originX + x * scale;
      const canvasY = originY - y * scale;
      
      if (i === 0) ctx.moveTo(canvasX, canvasY);
      else ctx.lineTo(canvasX, canvasY);
    }
    ctx.stroke();

    // Draw velocity vector
    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + vx * 3, originY - vy * 3);
    ctx.stroke();
    
    // Arrow head
    const arrowSize = 10;
    const arrowAngle = Math.atan2(-vy * 3, vx * 3);
    ctx.beginPath();
    ctx.moveTo(originX + vx * 3, originY - vy * 3);
    ctx.lineTo(
      originX + vx * 3 - arrowSize * Math.cos(arrowAngle - Math.PI / 6),
      originY - vy * 3 - arrowSize * Math.sin(arrowAngle - Math.PI / 6)
    );
    ctx.moveTo(originX + vx * 3, originY - vy * 3);
    ctx.lineTo(
      originX + vx * 3 - arrowSize * Math.cos(arrowAngle + Math.PI / 6),
      originY - vy * 3 - arrowSize * Math.sin(arrowAngle + Math.PI / 6)
    );
    ctx.stroke();

    // Components
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#e1705588';
    ctx.lineWidth = 2;
    // Vx
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + vx * 3, originY);
    ctx.stroke();
    // Vy
    ctx.beginPath();
    ctx.moveTo(originX + vx * 3, originY);
    ctx.lineTo(originX + vx * 3, originY - vy * 3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Angle arc
    ctx.strokeStyle = '#fdcb6e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(originX, originY, 30, -radAngle, 0, false);
    ctx.stroke();

    // Mark max height
    const maxHeightX = originX + (vx * tFlight / 2) * scale;
    const maxHeightY = originY - maxHeight * scale;
    ctx.fillStyle = '#e17055';
    ctx.beginPath();
    ctx.arc(maxHeightX, maxHeightY, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#e1705566';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(maxHeightX, maxHeightY);
    ctx.lineTo(originX, maxHeightY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Stats
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Equations:', width - 180, 30);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#00b894';
    ctx.fillText(`vₓ = v₀ cos(θ) = ${vx.toFixed(1)} m/s`, width - 180, 55);
    ctx.fillText(`vᵧ = v₀ sin(θ) = ${vy.toFixed(1)} m/s`, width - 180, 75);
    ctx.fillStyle = '#e17055';
    ctx.fillText(`Max H = vᵧ²/2g = ${maxHeight.toFixed(1)} m`, width - 180, 100);
    ctx.fillStyle = '#6c5ce7';
    ctx.fillText(`Range = ${range.toFixed(1)} m`, width - 180, 125);
    ctx.fillStyle = '#fdcb6e';
    ctx.fillText(`Time = ${tFlight.toFixed(2)} s`, width - 180, 150);

  }, [velocity, angle]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg"
        style={{ width, height }}
      />
      <div className="flex flex-wrap justify-center gap-6 mt-4">
        <div className="flex items-center gap-4">
          <span className="text-[#a0a0b0]">Velocity:</span>
          <input
            type="range"
            min="5"
            max="40"
            step="1"
            value={velocity}
            onChange={(e) => setVelocity(parseFloat(e.target.value))}
            className="w-32 accent-[#00b894]"
          />
          <span className="text-white w-16">{velocity} m/s</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[#a0a0b0]">Angle:</span>
          <input
            type="range"
            min="5"
            max="85"
            step="1"
            value={angle}
            onChange={(e) => setAngle(parseFloat(e.target.value))}
            className="w-32 accent-[#fdcb6e]"
          />
          <span className="text-white w-12">{angle}°</span>
        </div>
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3">
        Optimal angle for maximum range: 45° (when launched from ground level)
      </p>
    </div>
  );
}
