import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Eye, EyeOff, Bird, Navigation, Compass, Crosshair, Circle, Sparkles, Layers } from 'lucide-react';

// ============== TYPES ==============
interface Vec2 {
  x: number;
  y: number;
}

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

interface Obstacle {
  x: number;
  y: number;
  radius: number;
}

// ============== VECTOR MATH ==============
function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function magnitude(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalize(v: Vec2): Vec2 {
  const mag = magnitude(v);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

function limit(v: Vec2, max: number): Vec2 {
  const mag = magnitude(v);
  if (mag > max) {
    return scale(normalize(v), max);
  }
  return v;
}

function distance(a: Vec2, b: Vec2): number {
  return magnitude(sub(a, b));
}

function setMagnitude(v: Vec2, mag: number): Vec2 {
  return scale(normalize(v), mag);
}

// ============== STEERING BEHAVIORS ==============

// SEEK: Steer toward a target
function seek(boid: Boid, target: Vec2, maxSpeed: number, maxForce: number): Vec2 {
  const desired = sub(target, vec2(boid.x, boid.y));
  const desiredVel = setMagnitude(desired, maxSpeed);
  const steer = sub(desiredVel, vec2(boid.vx, boid.vy));
  return limit(steer, maxForce);
}

// FLEE: Steer away from a target
function flee(boid: Boid, target: Vec2, maxSpeed: number, maxForce: number, fleeRadius: number): Vec2 {
  const d = distance(vec2(boid.x, boid.y), target);
  if (d > fleeRadius) return vec2(0, 0);
  
  const desired = sub(vec2(boid.x, boid.y), target);
  const desiredVel = setMagnitude(desired, maxSpeed);
  const steer = sub(desiredVel, vec2(boid.vx, boid.vy));
  // Strength diminishes with distance
  const strength = 1 - (d / fleeRadius);
  return scale(limit(steer, maxForce), strength);
}

// ARRIVE: Seek with slowing down near target
function arrive(boid: Boid, target: Vec2, maxSpeed: number, maxForce: number, slowRadius: number): Vec2 {
  const desired = sub(target, vec2(boid.x, boid.y));
  const d = magnitude(desired);
  
  if (d < 1) return vec2(0, 0);
  
  // Slow down when within slowRadius
  let speed = maxSpeed;
  if (d < slowRadius) {
    speed = maxSpeed * (d / slowRadius);
  }
  
  const desiredVel = setMagnitude(desired, speed);
  const steer = sub(desiredVel, vec2(boid.vx, boid.vy));
  return limit(steer, maxForce);
}

// WANDER: Random exploration
function wander(boid: Boid, wanderAngle: number, maxSpeed: number, maxForce: number): { force: Vec2; newAngle: number } {
  const wanderRadius = 50;
  const wanderDist = 80;
  const angleChange = 0.5;
  
  // Get the center of the wander circle
  const vel = vec2(boid.vx, boid.vy);
  const velNorm = magnitude(vel) > 0 ? normalize(vel) : vec2(1, 0);
  const circleCenter = add(vec2(boid.x, boid.y), scale(velNorm, wanderDist));
  
  // Calculate the displacement force
  const newAngle = wanderAngle + (Math.random() * angleChange * 2 - angleChange);
  const displacement = vec2(
    Math.cos(newAngle) * wanderRadius,
    Math.sin(newAngle) * wanderRadius
  );
  
  const wanderTarget = add(circleCenter, displacement);
  const force = seek(boid, wanderTarget, maxSpeed, maxForce);
  
  return { force, newAngle };
}

// SEPARATION: Avoid crowding neighbors
function separation(boid: Boid, boids: Boid[], perceptionRadius: number, maxSpeed: number, maxForce: number): Vec2 {
  let steering = vec2(0, 0);
  let count = 0;
  
  for (const other of boids) {
    if (other === boid) continue;
    const d = distance(vec2(boid.x, boid.y), vec2(other.x, other.y));
    if (d > 0 && d < perceptionRadius) {
      const diff = sub(vec2(boid.x, boid.y), vec2(other.x, other.y));
      const weighted = scale(normalize(diff), 1 / d); // Weighted by distance
      steering = add(steering, weighted);
      count++;
    }
  }
  
  if (count > 0) {
    steering = scale(steering, 1 / count);
    steering = setMagnitude(steering, maxSpeed);
    steering = sub(steering, vec2(boid.vx, boid.vy));
    steering = limit(steering, maxForce);
  }
  
  return steering;
}

// ALIGNMENT: Steer toward average heading of neighbors
function alignment(boid: Boid, boids: Boid[], perceptionRadius: number, maxSpeed: number, maxForce: number): Vec2 {
  let avgVel = vec2(0, 0);
  let count = 0;
  
  for (const other of boids) {
    if (other === boid) continue;
    const d = distance(vec2(boid.x, boid.y), vec2(other.x, other.y));
    if (d < perceptionRadius) {
      avgVel = add(avgVel, vec2(other.vx, other.vy));
      count++;
    }
  }
  
  if (count > 0) {
    avgVel = scale(avgVel, 1 / count);
    avgVel = setMagnitude(avgVel, maxSpeed);
    const steer = sub(avgVel, vec2(boid.vx, boid.vy));
    return limit(steer, maxForce);
  }
  
  return vec2(0, 0);
}

// COHESION: Steer toward center of mass of neighbors
function cohesion(boid: Boid, boids: Boid[], perceptionRadius: number, maxSpeed: number, maxForce: number): Vec2 {
  let centerOfMass = vec2(0, 0);
  let count = 0;
  
  for (const other of boids) {
    if (other === boid) continue;
    const d = distance(vec2(boid.x, boid.y), vec2(other.x, other.y));
    if (d < perceptionRadius) {
      centerOfMass = add(centerOfMass, vec2(other.x, other.y));
      count++;
    }
  }
  
  if (count > 0) {
    centerOfMass = scale(centerOfMass, 1 / count);
    return seek(boid, centerOfMass, maxSpeed, maxForce);
  }
  
  return vec2(0, 0);
}

// OBSTACLE AVOIDANCE
function avoidObstacles(boid: Boid, obstacles: Obstacle[], maxSpeed: number, maxForce: number): Vec2 {
  let steering = vec2(0, 0);
  
  for (const obs of obstacles) {
    const d = distance(vec2(boid.x, boid.y), vec2(obs.x, obs.y));
    const avoidDist = obs.radius + 40;
    
    if (d < avoidDist) {
      const diff = sub(vec2(boid.x, boid.y), vec2(obs.x, obs.y));
      const weighted = scale(normalize(diff), 1 / Math.max(d - obs.radius, 1));
      steering = add(steering, scale(weighted, 3)); // Strong avoidance
    }
  }
  
  if (magnitude(steering) > 0) {
    steering = setMagnitude(steering, maxSpeed);
    steering = sub(steering, vec2(boid.vx, boid.vy));
    steering = limit(steering, maxForce * 2);
  }
  
  return steering;
}

// BOUNDARY AVOIDANCE (soft walls)
function avoidBoundaries(boid: Boid, width: number, height: number, margin: number, maxSpeed: number, maxForce: number): Vec2 {
  let steering = vec2(0, 0);
  
  if (boid.x < margin) {
    steering.x = maxSpeed;
  } else if (boid.x > width - margin) {
    steering.x = -maxSpeed;
  }
  
  if (boid.y < margin) {
    steering.y = maxSpeed;
  } else if (boid.y > height - margin) {
    steering.y = -maxSpeed;
  }
  
  if (magnitude(steering) > 0) {
    steering = sub(steering, vec2(boid.vx, boid.vy));
    steering = limit(steering, maxForce);
  }
  
  return steering;
}

// ============== INDIVIDUAL BEHAVIOR DEMOS ==============

// SEEK DEMO
export function SeekDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [showForces, setShowForces] = useState(true);
  const animRef = useRef<number>();
  
  const width = 400;
  const height = 300;
  
  const agentRef = useRef<Boid>({ x: 50, y: 150, vx: 0, vy: 0, ax: 0, ay: 0 });
  const targetRef = useRef<Vec2>({ x: 350, y: 150 });

  const maxSpeed = 4;
  const maxForce = 0.15;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetRef.current = {
        x: (e.clientX - rect.left) * (width / rect.width),
        y: (e.clientY - rect.top) * (height / rect.height)
      };
    };
    
    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      targetRef.current = {
        x: (touch.clientX - rect.left) * (width / rect.width),
        y: (touch.clientY - rect.top) * (height / rect.height)
      };
    };
    
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });

    const update = () => {
      if (!isRunning) {
        animRef.current = requestAnimationFrame(update);
        return;
      }

      const agent = agentRef.current;
      const target = targetRef.current;
      
      // Calculate seek force
      const seekForce = seek(agent, target, maxSpeed, maxForce);
      
      // Apply force
      agent.ax = seekForce.x;
      agent.ay = seekForce.y;
      agent.vx += agent.ax;
      agent.vy += agent.ay;
      const vel = limit(vec2(agent.vx, agent.vy), maxSpeed);
      agent.vx = vel.x;
      agent.vy = vel.y;
      agent.x += agent.vx;
      agent.y += agent.vy;

      // Draw
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw target
      ctx.fillStyle = '#00b894';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00b894';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(target.x - 18, target.y);
      ctx.lineTo(target.x + 18, target.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(target.x, target.y - 18);
      ctx.lineTo(target.x, target.y + 18);
      ctx.stroke();

      // Draw force vector if enabled
      if (showForces) {
        ctx.strokeStyle = '#fdcb6e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(agent.x, agent.y);
        ctx.lineTo(agent.x + seekForce.x * 100, agent.y + seekForce.y * 100);
        ctx.stroke();
        // Arrow head
        const angle = Math.atan2(seekForce.y, seekForce.x);
        const arrowLen = 8;
        ctx.beginPath();
        ctx.moveTo(agent.x + seekForce.x * 100, agent.y + seekForce.y * 100);
        ctx.lineTo(
          agent.x + seekForce.x * 100 - arrowLen * Math.cos(angle - 0.5),
          agent.y + seekForce.y * 100 - arrowLen * Math.sin(angle - 0.5)
        );
        ctx.lineTo(
          agent.x + seekForce.x * 100 - arrowLen * Math.cos(angle + 0.5),
          agent.y + seekForce.y * 100 - arrowLen * Math.sin(angle + 0.5)
        );
        ctx.closePath();
        ctx.fillStyle = '#fdcb6e';
        ctx.fill();
      }

      // Draw velocity vector
      ctx.strokeStyle = '#6c5ce7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(agent.x, agent.y);
      ctx.lineTo(agent.x + agent.vx * 10, agent.y + agent.vy * 10);
      ctx.stroke();

      // Draw agent (triangle pointing in direction of velocity)
      ctx.save();
      ctx.translate(agent.x, agent.y);
      const velAngle = Math.atan2(agent.vy, agent.vx);
      ctx.rotate(velAngle);
      ctx.fillStyle = '#6c5ce7';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      animRef.current = requestAnimationFrame(update);
    };

    animRef.current = requestAnimationFrame(update);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleTouch);
    };
  }, [isRunning, showForces]);

  const reset = () => {
    agentRef.current = { x: 50, y: 150, vx: 0, vy: 0, ax: 0, ay: 0 };
    targetRef.current = { x: 350, y: 150 };
  };

  return (
    <div className="bg-bg-card rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-3 py-1.5 bg-bg-secondary text-text-primary rounded-lg text-sm hover:bg-border transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={() => setShowForces(!showForces)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showForces ? 'bg-[#fdcb6e] text-black' : 'bg-bg-secondary text-text-primary'
          }`}
        >
          {showForces ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          Force
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border border-border cursor-crosshair"
        style={{ maxWidth: '400px' }}
      />
      <p className="text-xs text-text-secondary mt-2">Click to set target position</p>
    </div>
  );
}

// FLEE DEMO
export function FleeDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [showForces, setShowForces] = useState(true);
  const animRef = useRef<number>();
  
  const width = 400;
  const height = 300;
  
  const agentRef = useRef<Boid>({ x: 200, y: 150, vx: 0, vy: 0, ax: 0, ay: 0 });
  const threatRef = useRef<Vec2>({ x: 200, y: 150 });

  const maxSpeed = 5;
  const maxForce = 0.2;
  const fleeRadius = 100;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      threatRef.current = {
        x: (e.clientX - rect.left) * (width / rect.width),
        y: (e.clientY - rect.top) * (height / rect.height)
      };
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      threatRef.current = {
        x: (touch.clientX - rect.left) * (width / rect.width),
        y: (touch.clientY - rect.top) * (height / rect.height)
      };
    };
    
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    const update = () => {
      if (!isRunning) {
        animRef.current = requestAnimationFrame(update);
        return;
      }

      const agent = agentRef.current;
      const threat = threatRef.current;
      
      // Calculate flee force
      const fleeForce = flee(agent, threat, maxSpeed, maxForce, fleeRadius);
      
      // Apply force
      agent.ax = fleeForce.x;
      agent.ay = fleeForce.y;
      agent.vx += agent.ax;
      agent.vy += agent.ay;
      
      // Add slight friction when no threat
      if (magnitude(fleeForce) === 0) {
        agent.vx *= 0.98;
        agent.vy *= 0.98;
      }
      
      const vel = limit(vec2(agent.vx, agent.vy), maxSpeed);
      agent.vx = vel.x;
      agent.vy = vel.y;
      agent.x += agent.vx;
      agent.y += agent.vy;
      
      // Wrap around edges
      if (agent.x < 0) agent.x = width;
      if (agent.x > width) agent.x = 0;
      if (agent.y < 0) agent.y = height;
      if (agent.y > height) agent.y = 0;

      // Draw
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw flee radius
      ctx.strokeStyle = '#e17055';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(threat.x, threat.y, fleeRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw threat (predator)
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.arc(threat.x, threat.y, 15, 0, Math.PI * 2);
      ctx.fill();

      // Draw force vector if enabled
      if (showForces && magnitude(fleeForce) > 0) {
        ctx.strokeStyle = '#fdcb6e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(agent.x, agent.y);
        ctx.lineTo(agent.x + fleeForce.x * 80, agent.y + fleeForce.y * 80);
        ctx.stroke();
      }

      // Draw velocity vector
      ctx.strokeStyle = '#00b894';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(agent.x, agent.y);
      ctx.lineTo(agent.x + agent.vx * 8, agent.y + agent.vy * 8);
      ctx.stroke();

      // Draw agent
      ctx.save();
      ctx.translate(agent.x, agent.y);
      const velAngle = Math.atan2(agent.vy, agent.vx);
      ctx.rotate(velAngle);
      ctx.fillStyle = '#00b894';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -6);
      ctx.lineTo(-8, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      animRef.current = requestAnimationFrame(update);
    };

    animRef.current = requestAnimationFrame(update);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isRunning, showForces]);

  const reset = () => {
    agentRef.current = { x: 200, y: 150, vx: 0, vy: 0, ax: 0, ay: 0 };
  };

  return (
    <div className="bg-bg-card rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-3 py-1.5 bg-bg-secondary text-text-primary rounded-lg text-sm hover:bg-border transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={() => setShowForces(!showForces)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showForces ? 'bg-[#fdcb6e] text-black' : 'bg-bg-secondary text-text-primary'
          }`}
        >
          {showForces ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          Force
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border border-border"
        style={{ maxWidth: '400px' }}
      />
      <p className="text-xs text-text-secondary mt-2">Move mouse to control the predator (red)</p>
    </div>
  );
}

// ARRIVE DEMO
export function ArriveDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [showRadius, setShowRadius] = useState(true);
  const animRef = useRef<number>();
  
  const width = 400;
  const height = 300;
  
  const agentRef = useRef<Boid>({ x: 50, y: 150, vx: 0, vy: 0, ax: 0, ay: 0 });
  const targetRef = useRef<Vec2>({ x: 300, y: 150 });

  const maxSpeed = 6;
  const maxForce = 0.2;
  const slowRadius = 80;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetRef.current = {
        x: (e.clientX - rect.left) * (width / rect.width),
        y: (e.clientY - rect.top) * (height / rect.height)
      };
    };
    
    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      targetRef.current = {
        x: (touch.clientX - rect.left) * (width / rect.width),
        y: (touch.clientY - rect.top) * (height / rect.height)
      };
    };
    
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });

    const update = () => {
      if (!isRunning) {
        animRef.current = requestAnimationFrame(update);
        return;
      }

      const agent = agentRef.current;
      const target = targetRef.current;
      
      // Calculate arrive force
      const arriveForce = arrive(agent, target, maxSpeed, maxForce, slowRadius);
      
      // Apply force
      agent.ax = arriveForce.x;
      agent.ay = arriveForce.y;
      agent.vx += agent.ax;
      agent.vy += agent.ay;
      const vel = limit(vec2(agent.vx, agent.vy), maxSpeed);
      agent.vx = vel.x;
      agent.vy = vel.y;
      agent.x += agent.vx;
      agent.y += agent.vy;

      // Draw
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw slow radius
      if (showRadius) {
        ctx.strokeStyle = '#74b9ff';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(target.x, target.y, slowRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#74b9ff';
        ctx.font = '11px monospace';
        ctx.fillText('slow radius', target.x - 30, target.y - slowRadius - 8);
      }

      // Draw target
      ctx.fillStyle = '#00b894';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Draw velocity (length shows speed)
      const speed = magnitude(vec2(agent.vx, agent.vy));
      ctx.strokeStyle = '#6c5ce7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(agent.x, agent.y);
      ctx.lineTo(agent.x + agent.vx * 8, agent.y + agent.vy * 8);
      ctx.stroke();

      // Draw speed indicator
      ctx.fillStyle = '#6c5ce7';
      ctx.font = '11px monospace';
      ctx.fillText(`Speed: ${speed.toFixed(1)}`, 10, 20);

      // Draw agent
      ctx.save();
      ctx.translate(agent.x, agent.y);
      const velAngle = Math.atan2(agent.vy, agent.vx);
      ctx.rotate(velAngle);
      ctx.fillStyle = '#6c5ce7';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      animRef.current = requestAnimationFrame(update);
    };

    animRef.current = requestAnimationFrame(update);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleTouch);
    };
  }, [isRunning, showRadius]);

  const reset = () => {
    agentRef.current = { x: 50, y: 150, vx: 0, vy: 0, ax: 0, ay: 0 };
    targetRef.current = { x: 300, y: 150 };
  };

  return (
    <div className="bg-bg-card rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-3 py-1.5 bg-bg-secondary text-text-primary rounded-lg text-sm hover:bg-border transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={() => setShowRadius(!showRadius)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showRadius ? 'bg-[#74b9ff] text-black' : 'bg-bg-secondary text-text-primary'
          }`}
        >
          <Circle className="w-4 h-4" />
          Radius
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border border-border cursor-crosshair"
        style={{ maxWidth: '400px' }}
      />
      <p className="text-xs text-text-secondary mt-2">Click to set target. Notice how it slows down smoothly!</p>
    </div>
  );
}

// WANDER DEMO
export function WanderDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const animRef = useRef<number>();
  
  const width = 400;
  const height = 300;
  
  const agentRef = useRef<Boid>({ x: 200, y: 150, vx: 2, vy: 0, ax: 0, ay: 0 });
  const wanderAngleRef = useRef(0);
  const trailRef = useRef<Vec2[]>([]);

  const maxSpeed = 3;
  const maxForce = 0.1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const update = () => {
      if (!isRunning) {
        animRef.current = requestAnimationFrame(update);
        return;
      }

      const agent = agentRef.current;
      
      // Calculate wander force
      const { force: wanderForce, newAngle } = wander(agent, wanderAngleRef.current, maxSpeed, maxForce);
      wanderAngleRef.current = newAngle;
      
      // Boundary avoidance
      const boundaryForce = avoidBoundaries(agent, width, height, 30, maxSpeed, maxForce * 2);
      
      // Combine forces
      agent.ax = wanderForce.x + boundaryForce.x;
      agent.ay = wanderForce.y + boundaryForce.y;
      agent.vx += agent.ax;
      agent.vy += agent.ay;
      const vel = limit(vec2(agent.vx, agent.vy), maxSpeed);
      agent.vx = vel.x;
      agent.vy = vel.y;
      agent.x += agent.vx;
      agent.y += agent.vy;
      
      // Update trail
      trailRef.current.push({ x: agent.x, y: agent.y });
      if (trailRef.current.length > 100) {
        trailRef.current.shift();
      }

      // Draw
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw trail
      if (trailRef.current.length > 1) {
        ctx.strokeStyle = '#6c5ce7';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
        trailRef.current.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw wander circle (debug)
      if (showDebug) {
        const velNorm = magnitude(vec2(agent.vx, agent.vy)) > 0 
          ? normalize(vec2(agent.vx, agent.vy)) 
          : vec2(1, 0);
        const circleCenter = add(vec2(agent.x, agent.y), scale(velNorm, 80));
        
        ctx.strokeStyle = '#fdcb6e';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(circleCenter.x, circleCenter.y, 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw wander target
        const wanderTarget = add(circleCenter, vec2(
          Math.cos(wanderAngleRef.current) * 50,
          Math.sin(wanderAngleRef.current) * 50
        ));
        ctx.fillStyle = '#fdcb6e';
        ctx.beginPath();
        ctx.arc(wanderTarget.x, wanderTarget.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Line to wander target
        ctx.strokeStyle = '#fdcb6e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(agent.x, agent.y);
        ctx.lineTo(wanderTarget.x, wanderTarget.y);
        ctx.stroke();
      }

      // Draw agent
      ctx.save();
      ctx.translate(agent.x, agent.y);
      const velAngle = Math.atan2(agent.vy, agent.vx);
      ctx.rotate(velAngle);
      ctx.fillStyle = '#6c5ce7';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      animRef.current = requestAnimationFrame(update);
    };

    animRef.current = requestAnimationFrame(update);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isRunning, showDebug]);

  const reset = () => {
    agentRef.current = { x: 200, y: 150, vx: 2, vy: 0, ax: 0, ay: 0 };
    wanderAngleRef.current = 0;
    trailRef.current = [];
  };

  return (
    <div className="bg-bg-card rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-3 py-1.5 bg-bg-secondary text-text-primary rounded-lg text-sm hover:bg-border transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={() => setShowDebug(!showDebug)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showDebug ? 'bg-[#fdcb6e] text-black' : 'bg-bg-secondary text-text-primary'
          }`}
        >
          <Compass className="w-4 h-4" />
          Debug
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border border-border"
        style={{ maxWidth: '400px' }}
      />
      <p className="text-xs text-text-secondary mt-2">Watch the agent explore randomly using a wander circle</p>
    </div>
  );
}

// ============== MAIN FLOCKING SIMULATION ==============
export default function FlockingSimulation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [showForces, setShowForces] = useState(false);
  const [showTrails, setShowTrails] = useState(false);
  const [boidCount, setBoidCount] = useState(80);
  const [separationWeight, setSeparationWeight] = useState(1.5);
  const [alignmentWeight, setAlignmentWeight] = useState(1.0);
  const [cohesionWeight, setCohesionWeight] = useState(1.0);
  const [predatorEnabled, setPredatorEnabled] = useState(true);
  
  const animRef = useRef<number>();
  const boidsRef = useRef<Boid[]>([]);
  const trailsRef = useRef<Vec2[][]>([]);
  const mouseRef = useRef<Vec2>({ x: -1000, y: -1000 });
  const obstaclesRef = useRef<Obstacle[]>([
    { x: 250, y: 200, radius: 30 },
    { x: 550, y: 150, radius: 40 },
  ]);
  
  const width = 800;
  const height = 450;
  const maxSpeed = 4;
  const maxForce = 0.15;
  const perceptionRadius = 50;
  const fleeRadius = 100;

  // Initialize boids
  const initBoids = useCallback((count: number) => {
    boidsRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      ax: 0,
      ay: 0,
    }));
    trailsRef.current = Array.from({ length: count }, () => []);
  }, []);
  
  // Preset configurations
  const applyPreset = (preset: 'tight' | 'loose' | 'chaos') => {
    switch (preset) {
      case 'tight':
        setSeparationWeight(1.0);
        setAlignmentWeight(1.5);
        setCohesionWeight(2.0);
        break;
      case 'loose':
        setSeparationWeight(2.0);
        setAlignmentWeight(0.5);
        setCohesionWeight(0.5);
        break;
      case 'chaos':
        setSeparationWeight(0.3);
        setAlignmentWeight(0.1);
        setCohesionWeight(0.1);
        break;
    }
  };

  useEffect(() => {
    initBoids(boidCount);
  }, []);

  // Update boid count
  useEffect(() => {
    const currentCount = boidsRef.current.length;
    if (boidCount > currentCount) {
      // Add more boids
      for (let i = 0; i < boidCount - currentCount; i++) {
        boidsRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          ax: 0,
          ay: 0,
        });
        trailsRef.current.push([]);
      }
    } else if (boidCount < currentCount) {
      // Remove boids
      boidsRef.current = boidsRef.current.slice(0, boidCount);
      trailsRef.current = trailsRef.current.slice(0, boidCount);
    }
  }, [boidCount]);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) * (width / rect.width),
        y: (e.clientY - rect.top) * (height / rect.height)
      };
    };
    
    const handleLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };
    
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);

    const update = () => {
      if (!isRunning) {
        animRef.current = requestAnimationFrame(update);
        // Still draw
        draw(ctx);
        return;
      }

      const boids = boidsRef.current;
      const obstacles = obstaclesRef.current;
      const mouse = mouseRef.current;

      // Update each boid
      for (let i = 0; i < boids.length; i++) {
        const boid = boids[i];
        // Calculate all steering forces
        const sep = scale(separation(boid, boids, perceptionRadius, maxSpeed, maxForce), separationWeight);
        const ali = scale(alignment(boid, boids, perceptionRadius, maxSpeed, maxForce), alignmentWeight);
        const coh = scale(cohesion(boid, boids, perceptionRadius, maxSpeed, maxForce), cohesionWeight);
        const obs = avoidObstacles(boid, obstacles, maxSpeed, maxForce);
        const bounds = avoidBoundaries(boid, width, height, 40, maxSpeed, maxForce);
        
        // Flee from mouse (predator)
        let fleeForce = vec2(0, 0);
        if (predatorEnabled && mouse.x > 0) {
          fleeForce = scale(flee(boid, mouse, maxSpeed, maxForce, fleeRadius), 2);
        }
        
        // Combine all forces
        boid.ax = sep.x + ali.x + coh.x + obs.x + bounds.x + fleeForce.x;
        boid.ay = sep.y + ali.y + coh.y + obs.y + bounds.y + fleeForce.y;
        
        // Update velocity
        boid.vx += boid.ax;
        boid.vy += boid.ay;
        const vel = limit(vec2(boid.vx, boid.vy), maxSpeed);
        boid.vx = vel.x;
        boid.vy = vel.y;
        
        // Update position
        boid.x += boid.vx;
        boid.y += boid.vy;
        
        // Wrap around edges
        if (boid.x < 0) boid.x = width;
        if (boid.x > width) boid.x = 0;
        if (boid.y < 0) boid.y = height;
        if (boid.y > height) boid.y = 0;
        
        // Record trail
        if (showTrails && trailsRef.current[i]) {
          trailsRef.current[i].push({ x: boid.x, y: boid.y });
          if (trailsRef.current[i].length > 30) {
            trailsRef.current[i].shift();
          }
        }
      }
      
      // Clear trails when disabled
      if (!showTrails) {
        trailsRef.current = trailsRef.current.map(() => []);
      }

      draw(ctx);
      animRef.current = requestAnimationFrame(update);
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
      const boids = boidsRef.current;
      const obstacles = obstaclesRef.current;
      const mouse = mouseRef.current;

      // Clear
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw obstacles
      for (const obs of obstacles) {
        // Outer glow
        const gradient = ctx.createRadialGradient(obs.x, obs.y, obs.radius * 0.5, obs.x, obs.y, obs.radius + 20);
        gradient.addColorStop(0, '#374151');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.radius + 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Obstacle
        ctx.fillStyle = '#374151';
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw predator radius if enabled
      if (predatorEnabled && mouse.x > 0) {
        ctx.strokeStyle = '#e17055';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, fleeRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Predator
        ctx.fillStyle = '#e17055';
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw trails
      if (showTrails) {
        const trails = trailsRef.current;
        for (let i = 0; i < Math.min(boids.length, trails.length); i++) {
          const trail = trails[i];
          if (trail.length > 1) {
            const boid = boids[i];
            const speed = magnitude(vec2(boid.vx, boid.vy));
            const hue = 260 - (speed / maxSpeed) * 80;
            
            ctx.beginPath();
            ctx.moveTo(trail[0].x, trail[0].y);
            for (let j = 1; j < trail.length; j++) {
              ctx.lineTo(trail[j].x, trail[j].y);
            }
            ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.3)`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
      
      // Draw boids
      for (const boid of boids) {
        // Debug: perception radius
        if (showDebug) {
          ctx.strokeStyle = 'rgba(108, 92, 231, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(boid.x, boid.y, perceptionRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Force visualization
        if (showForces) {
          // Calculate forces for visualization
          const sep = scale(separation(boid, boids, perceptionRadius, maxSpeed, maxForce), separationWeight);
          const ali = scale(alignment(boid, boids, perceptionRadius, maxSpeed, maxForce), alignmentWeight);
          const coh = scale(cohesion(boid, boids, perceptionRadius, maxSpeed, maxForce), cohesionWeight);
          
          // Draw force arrows
          const drawForce = (force: Vec2, color: string) => {
            if (magnitude(force) < 0.001) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(boid.x, boid.y);
            ctx.lineTo(boid.x + force.x * 50, boid.y + force.y * 50);
            ctx.stroke();
          };
          
          drawForce(sep, '#e17055'); // Red for separation
          drawForce(ali, '#00b894'); // Green for alignment
          drawForce(coh, '#74b9ff'); // Blue for cohesion
        }

        // Draw velocity vector
        if (showDebug) {
          ctx.strokeStyle = '#fdcb6e';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(boid.x, boid.y);
          ctx.lineTo(boid.x + boid.vx * 5, boid.y + boid.vy * 5);
          ctx.stroke();
        }

        // Draw boid (triangle)
        ctx.save();
        ctx.translate(boid.x, boid.y);
        const angle = Math.atan2(boid.vy, boid.vx);
        ctx.rotate(angle);
        
        // Color based on speed
        const speed = magnitude(vec2(boid.vx, boid.vy));
        const hue = 260 - (speed / maxSpeed) * 80; // Purple to blue-green
        ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
        
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Draw stats
      ctx.fillStyle = '#a0a0a0';
      ctx.font = '12px monospace';
      ctx.fillText(`Boids: ${boids.length}`, 10, 20);
    };

    animRef.current = requestAnimationFrame(update);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
    };
  }, [isRunning, showDebug, showForces, showTrails, separationWeight, alignmentWeight, cohesionWeight, predatorEnabled]);

  const reset = () => {
    initBoids(boidCount);
  };

  return (
    <div className="bg-bg-card rounded-xl p-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-4 py-2 bg-bg-secondary text-text-primary rounded-lg hover:bg-border transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={() => setShowDebug(!showDebug)}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
            showDebug ? 'bg-[#6c5ce7] text-white' : 'bg-bg-secondary text-text-primary'
          }`}
        >
          {showDebug ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          Debug
        </button>
        <button
          onClick={() => setShowForces(!showForces)}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
            showForces ? 'bg-[#fdcb6e] text-black' : 'bg-bg-secondary text-text-primary'
          }`}
        >
          <Navigation className="w-4 h-4" />
          Forces
        </button>
        <button
          onClick={() => setPredatorEnabled(!predatorEnabled)}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
            predatorEnabled ? 'bg-[#e17055] text-white' : 'bg-bg-secondary text-text-primary'
          }`}
          aria-pressed={predatorEnabled}
          aria-label="Toggle predator mode"
        >
          <Crosshair className="w-4 h-4" />
          Predator
        </button>
        <button
          onClick={() => setShowTrails(!showTrails)}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
            showTrails ? 'bg-[#a29bfe] text-white' : 'bg-bg-secondary text-text-primary'
          }`}
          aria-pressed={showTrails}
          aria-label="Toggle trail effect"
        >
          <Sparkles className="w-4 h-4" />
          Trails
        </button>
      </div>
      
      {/* Presets */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          <Layers className="w-3 h-3" />
          Presets:
        </span>
        <button
          onClick={() => applyPreset('tight')}
          className="px-3 py-1 text-xs bg-bg-secondary text-text-primary rounded-lg hover:bg-border transition-colors"
          aria-label="Apply tight flock preset"
        >
          Tight Flock
        </button>
        <button
          onClick={() => applyPreset('loose')}
          className="px-3 py-1 text-xs bg-bg-secondary text-text-primary rounded-lg hover:bg-border transition-colors"
          aria-label="Apply loose flock preset"
        >
          Loose Flock
        </button>
        <button
          onClick={() => applyPreset('chaos')}
          className="px-3 py-1 text-xs bg-bg-secondary text-text-primary rounded-lg hover:bg-border transition-colors"
          aria-label="Apply chaos preset"
        >
          Chaos
        </button>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4" role="group" aria-label="Flocking behavior controls">
        <div>
          <label htmlFor="boid-count" className="text-xs text-text-secondary flex items-center gap-1 mb-1">
            <Bird className="w-3 h-3" />
            Boids: {boidCount}
          </label>
          <input
            id="boid-count"
            type="range"
            min="10"
            max="200"
            value={boidCount}
            onChange={(e) => setBoidCount(Number(e.target.value))}
            className="w-full accent-accent"
            aria-label={`Boid count: ${boidCount}`}
          />
        </div>
        <div>
          <label htmlFor="separation-weight" className="text-xs text-text-secondary flex items-center gap-1 mb-1">
            <span className="w-3 h-3 rounded-full bg-[#e17055]" aria-hidden="true" />
            Separation: {separationWeight.toFixed(1)}
          </label>
          <input
            id="separation-weight"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={separationWeight}
            onChange={(e) => setSeparationWeight(Number(e.target.value))}
            className="w-full accent-[#e17055]"
            aria-label={`Separation weight: ${separationWeight.toFixed(1)}`}
          />
        </div>
        <div>
          <label htmlFor="alignment-weight" className="text-xs text-text-secondary flex items-center gap-1 mb-1">
            <span className="w-3 h-3 rounded-full bg-[#00b894]" aria-hidden="true" />
            Alignment: {alignmentWeight.toFixed(1)}
          </label>
          <input
            id="alignment-weight"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={alignmentWeight}
            onChange={(e) => setAlignmentWeight(Number(e.target.value))}
            className="w-full accent-[#00b894]"
            aria-label={`Alignment weight: ${alignmentWeight.toFixed(1)}`}
          />
        </div>
        <div>
          <label htmlFor="cohesion-weight" className="text-xs text-text-secondary flex items-center gap-1 mb-1">
            <span className="w-3 h-3 rounded-full bg-[#74b9ff]" aria-hidden="true" />
            Cohesion: {cohesionWeight.toFixed(1)}
          </label>
          <input
            id="cohesion-weight"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={cohesionWeight}
            onChange={(e) => setCohesionWeight(Number(e.target.value))}
            className="w-full accent-[#74b9ff]"
            aria-label={`Cohesion weight: ${cohesionWeight.toFixed(1)}`}
          />
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border border-border"
        role="img"
        aria-label="Flocking simulation canvas showing boids moving with steering behaviors"
      />
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <Bird className="w-3 h-3 text-[#6c5ce7]" />
          Boids
        </span>
        <span className="flex items-center gap-1">
          <Circle className="w-3 h-3 text-[#374151]" />
          Obstacles
        </span>
        {predatorEnabled && (
          <span className="flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-[#e17055]" />
            Predator (mouse)
          </span>
        )}
        {showForces && (
          <>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-[#e17055]" aria-hidden="true" /> Separation
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-[#00b894]" aria-hidden="true" /> Alignment
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-[#74b9ff]" aria-hidden="true" /> Cohesion
            </span>
          </>
        )}
        {showTrails && (
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#a29bfe]" />
            Trails enabled
          </span>
        )}
      </div>
    </div>
  );
}

// ============== FORCE VISUALIZATION DEMO ==============
export function ForceVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const animRef = useRef<number>();
  
  const width = 400;
  const height = 300;
  
  const agentRef = useRef<Boid>({ x: 200, y: 150, vx: 2, vy: -1, ax: 0, ay: 0 });
  const neighborsRef = useRef<Boid[]>([
    { x: 180, y: 130, vx: 1, vy: 0.5, ax: 0, ay: 0 },
    { x: 220, y: 140, vx: 1.5, vy: 0.2, ax: 0, ay: 0 },
    { x: 190, y: 170, vx: 0.8, vy: -0.3, ax: 0, ay: 0 },
  ]);

  const maxSpeed = 3;
  const maxForce = 0.1;
  const perceptionRadius = 80;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const update = () => {
      const agent = agentRef.current;
      const neighbors = neighborsRef.current;

      // Update neighbors (simple circular motion)
      for (const n of neighbors) {
        const centerX = 200;
        const centerY = 150;
        const angle = Math.atan2(n.y - centerY, n.x - centerX) + 0.02;
        const dist = distance(vec2(n.x, n.y), vec2(centerX, centerY));
        n.x = centerX + Math.cos(angle) * dist;
        n.y = centerY + Math.sin(angle) * dist;
        n.vx = Math.cos(angle + Math.PI/2) * 1.5;
        n.vy = Math.sin(angle + Math.PI/2) * 1.5;
      }

      if (isRunning) {
        // Calculate forces
        const sep = separation(agent, neighbors, perceptionRadius, maxSpeed, maxForce);
        const ali = alignment(agent, neighbors, perceptionRadius, maxSpeed, maxForce);
        const coh = cohesion(agent, neighbors, perceptionRadius, maxSpeed, maxForce);
        
        // Combine with weights
        agent.ax = sep.x * 1.5 + ali.x + coh.x;
        agent.ay = sep.y * 1.5 + ali.y + coh.y;
        agent.vx += agent.ax;
        agent.vy += agent.ay;
        const vel = limit(vec2(agent.vx, agent.vy), maxSpeed);
        agent.vx = vel.x;
        agent.vy = vel.y;
        agent.x += agent.vx;
        agent.y += agent.vy;
        
        // Soft boundaries
        const bound = avoidBoundaries(agent, width, height, 40, maxSpeed, maxForce);
        agent.vx += bound.x;
        agent.vy += bound.y;
      }

      // Draw
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Perception radius
      ctx.strokeStyle = 'rgba(108, 92, 231, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, perceptionRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Calculate forces for visualization
      const sep = separation(agent, neighbors, perceptionRadius, maxSpeed, maxForce);
      const ali = alignment(agent, neighbors, perceptionRadius, maxSpeed, maxForce);
      const coh = cohesion(agent, neighbors, perceptionRadius, maxSpeed, maxForce);

      // Draw force arrows
      const drawArrow = (from: Vec2, force: Vec2, color: string, label: string) => {
        if (magnitude(force) < 0.001) return;
        const scaled = scale(force, 150);
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(from.x + scaled.x, from.y + scaled.y);
        ctx.stroke();
        
        // Arrow head
        const angle = Math.atan2(scaled.y, scaled.x);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(from.x + scaled.x, from.y + scaled.y);
        ctx.lineTo(
          from.x + scaled.x - 10 * Math.cos(angle - 0.4),
          from.y + scaled.y - 10 * Math.sin(angle - 0.4)
        );
        ctx.lineTo(
          from.x + scaled.x - 10 * Math.cos(angle + 0.4),
          from.y + scaled.y - 10 * Math.sin(angle + 0.4)
        );
        ctx.closePath();
        ctx.fill();
        
        // Label
        ctx.fillStyle = color;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(label, from.x + scaled.x + 5, from.y + scaled.y);
      };

      drawArrow(vec2(agent.x, agent.y), sep, '#e17055', 'SEP');
      drawArrow(vec2(agent.x, agent.y), ali, '#00b894', 'ALI');
      drawArrow(vec2(agent.x, agent.y), coh, '#74b9ff', 'COH');

      // Draw neighbors
      for (const n of neighbors) {
        ctx.save();
        ctx.translate(n.x, n.y);
        const angle = Math.atan2(n.vy, n.vx);
        ctx.rotate(angle);
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Draw main agent
      ctx.save();
      ctx.translate(agent.x, agent.y);
      const agentAngle = Math.atan2(agent.vy, agent.vx);
      ctx.rotate(agentAngle);
      ctx.fillStyle = '#6c5ce7';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -7);
      ctx.lineTo(-8, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Legend
      ctx.fillStyle = '#a0a0a0';
      ctx.font = '10px monospace';
      ctx.fillText('Red: Separation (avoid crowding)', 10, height - 40);
      ctx.fillText('Green: Alignment (match heading)', 10, height - 26);
      ctx.fillText('Blue: Cohesion (move to center)', 10, height - 12);

      animRef.current = requestAnimationFrame(update);
    };

    animRef.current = requestAnimationFrame(update);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isRunning]);

  return (
    <div className="bg-bg-card rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Pause' : 'Play'}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-lg border border-border"
        style={{ maxWidth: '400px' }}
      />
      <p className="text-xs text-text-secondary mt-2">
        Watch how the three flocking forces combine to create emergent behavior
      </p>
    </div>
  );
}
