import { useRef, useEffect, useState, useCallback } from 'react';
import { Gamepad2, RotateCcw, Circle, Grid3X3, Move, Zap, Smartphone } from 'lucide-react';

// ============== TYPES ==============
interface Vec2 {
  x: number;
  y: number;
}

interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CircleShape {
  x: number;
  y: number;
  radius: number;
}

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facingRight: boolean;
  animFrame: number;
}

interface Coin {
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  bobOffset: number;
  collectTime?: number; // For collection animation
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Tile {
  x: number;
  y: number;
  solid: boolean;
  type: 'ground' | 'platform' | 'wall' | 'empty';
}

// ============== COLLISION MATH ==============

// AABB vs AABB collision detection
function aabbVsAabb(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// AABB overlap calculation (for resolution)
function getAabbOverlap(a: AABB, b: AABB): Vec2 | null {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  
  if (overlapX > 0 && overlapY > 0) {
    return { x: overlapX, y: overlapY };
  }
  return null;
}

// Circle vs Circle collision
function circleVsCircle(a: CircleShape, b: CircleShape): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < a.radius + b.radius;
}

// Circle vs AABB collision
function circleVsAabb(circle: CircleShape, box: AABB): boolean {
  // Find closest point on box to circle center
  const closestX = Math.max(box.x, Math.min(circle.x, box.x + box.width));
  const closestY = Math.max(box.y, Math.min(circle.y, box.y + box.height));
  
  // Check if closest point is within circle radius
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return (dx * dx + dy * dy) < (circle.radius * circle.radius);
}

// Swept AABB collision (for fast moving objects)
function sweptAabb(
  moving: AABB,
  velocity: Vec2,
  stationary: AABB
): { time: number; normalX: number; normalY: number } {
  // Broadphase check
  const broadphase: AABB = {
    x: velocity.x > 0 ? moving.x : moving.x + velocity.x,
    y: velocity.y > 0 ? moving.y : moving.y + velocity.y,
    width: velocity.x > 0 ? velocity.x + moving.width : moving.width - velocity.x,
    height: velocity.y > 0 ? velocity.y + moving.height : moving.height - velocity.y,
  };
  
  if (!aabbVsAabb(broadphase, stationary)) {
    return { time: 1, normalX: 0, normalY: 0 };
  }

  // Calculate entry and exit times
  let xEntry: number, yEntry: number;
  let xExit: number, yExit: number;
  
  if (velocity.x > 0) {
    xEntry = (stationary.x - (moving.x + moving.width)) / velocity.x;
    xExit = ((stationary.x + stationary.width) - moving.x) / velocity.x;
  } else if (velocity.x < 0) {
    xEntry = ((stationary.x + stationary.width) - moving.x) / velocity.x;
    xExit = (stationary.x - (moving.x + moving.width)) / velocity.x;
  } else {
    xEntry = -Infinity;
    xExit = Infinity;
  }
  
  if (velocity.y > 0) {
    yEntry = (stationary.y - (moving.y + moving.height)) / velocity.y;
    yExit = ((stationary.y + stationary.height) - moving.y) / velocity.y;
  } else if (velocity.y < 0) {
    yEntry = ((stationary.y + stationary.height) - moving.y) / velocity.y;
    yExit = (stationary.y - (moving.y + moving.height)) / velocity.y;
  } else {
    yEntry = -Infinity;
    yExit = Infinity;
  }
  
  const entryTime = Math.max(xEntry, yEntry);
  const exitTime = Math.min(xExit, yExit);
  
  // No collision
  if (entryTime > exitTime || (xEntry < 0 && yEntry < 0) || xEntry > 1 || yEntry > 1) {
    return { time: 1, normalX: 0, normalY: 0 };
  }
  
  // Calculate normal
  let normalX = 0;
  let normalY = 0;
  
  if (xEntry > yEntry) {
    normalX = velocity.x > 0 ? -1 : 1;
  } else {
    normalY = velocity.y > 0 ? -1 : 1;
  }
  
  return { time: entryTime, normalX, normalY };
}

// ============== CONSTANTS ==============
const GRAVITY = 0.6;
const JUMP_FORCE = -14;
const MOVE_SPEED = 0.8;
const MAX_SPEED = 6;
const FRICTION = 0.85;
const AIR_FRICTION = 0.95;
const TILE_SIZE = 32;

// ============== LEVEL DATA ==============
const LEVEL_1 = [
  '                          ',
  '                          ',
  '      C                   ',
  '    #####         C       ',
  '                #####     ',
  '  C        C              ',
  '####    ######       ###  ',
  '                          ',
  '        C            C    ',
  '      #####      ######   ',
  '                          ',
  '##########################',
];

// ============== MAIN PLATFORMER COMPONENT ==============
export default function Platformer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const respawnFlashRef = useRef(0); // Timer for death/respawn flash effect
  
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<{ left: boolean; right: boolean; jump: boolean }>({
    left: false,
    right: false,
    jump: false
  });
  const gameRef = useRef<{
    player: Player;
    tiles: Tile[];
    coins: Coin[];
    particles: Particle[];
    checkedTiles: Set<string>;
    totalCoins: number;
  }>({
    player: {
      x: 64, y: 280, width: 24, height: 32,
      vx: 0, vy: 0, grounded: false, facingRight: true, animFrame: 0
    },
    tiles: [],
    coins: [],
    particles: [],
    checkedTiles: new Set(),
    totalCoins: 0
  });

  const width = 832;
  const height = 384;

  // Parse level
  const parseLevel = useCallback(() => {
    const tiles: Tile[] = [];
    const coins: Coin[] = [];
    
    LEVEL_1.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const tileX = x * TILE_SIZE;
        const tileY = y * TILE_SIZE;
        
        if (char === '#') {
          tiles.push({
            x: tileX, y: tileY,
            solid: true,
            type: y === LEVEL_1.length - 1 ? 'ground' : 'platform'
          });
        } else if (char === 'C') {
          coins.push({
            x: tileX + TILE_SIZE / 2,
            y: tileY + TILE_SIZE / 2,
            radius: 10,
            collected: false,
            bobOffset: Math.random() * Math.PI * 2
          });
        }
      });
    });
    
    gameRef.current.tiles = tiles;
    gameRef.current.coins = coins;
    gameRef.current.totalCoins = coins.length;
  }, []);

  const resetGame = useCallback(() => {
    parseLevel();
    gameRef.current.player = {
      x: 64, y: 280, width: 24, height: 32,
      vx: 0, vy: 0, grounded: false, facingRight: true, animFrame: 0
    };
    gameRef.current.particles = [];
    setScore(0);
    setGameWon(false);
  }, [parseLevel]);

  // Helper to spawn coin collection particles
  const spawnCoinParticles = useCallback((x: number, y: number) => {
    // TODO: Add sound effect here - play coin collect sound
    const colors = ['#fdcb6e', '#ffeaa7', '#f39c12', '#fff'];
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
      const speed = 2 + Math.random() * 3;
      gameRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3
      });
    }
  }, []);

  useEffect(() => {
    parseLevel();
  }, [parseLevel]);

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        e.preventDefault();
        keysRef.current.add(key);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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
    let frameCount = 0;

    const update = () => {
      if (gameWon) return;
      
      const { player, tiles, coins } = gameRef.current;
      const keys = keysRef.current;
      
      // Clear checked tiles for debug
      gameRef.current.checkedTiles.clear();
      
      // Input handling (keyboard + touch)
      const touch = touchRef.current;
      const moveLeft = keys.has('a') || keys.has('arrowleft') || touch.left;
      const moveRight = keys.has('d') || keys.has('arrowright') || touch.right;
      const jump = keys.has('w') || keys.has('arrowup') || keys.has(' ') || touch.jump;
      
      // Horizontal movement with acceleration
      if (moveLeft) {
        player.vx -= MOVE_SPEED;
        player.facingRight = false;
      }
      if (moveRight) {
        player.vx += MOVE_SPEED;
        player.facingRight = true;
      }
      
      // Cap horizontal speed
      player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));
      
      // Apply friction
      player.vx *= player.grounded ? FRICTION : AIR_FRICTION;
      
      // Stop if very slow
      if (Math.abs(player.vx) < 0.1) player.vx = 0;
      
      // Jump
      if (jump && player.grounded) {
        player.vy = JUMP_FORCE;
        player.grounded = false;
      }
      
      // Apply gravity
      player.vy += GRAVITY;
      
      // Cap fall speed
      player.vy = Math.min(player.vy, 15);
      
      // Tile-based collision detection
      const playerBox: AABB = {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height
      };
      
      // Reset grounded state
      player.grounded = false;
      
      // Horizontal collision
      const futureX = player.x + player.vx;
      const hCheck: AABB = {
        x: futureX,
        y: player.y,
        width: player.width,
        height: player.height
      };
      
      for (const tile of tiles) {
        if (!tile.solid) continue;
        
        const tileBox: AABB = { x: tile.x, y: tile.y, width: TILE_SIZE, height: TILE_SIZE };
        
        // Check proximity for debug
        if (Math.abs(tile.x - player.x) < TILE_SIZE * 3 && Math.abs(tile.y - player.y) < TILE_SIZE * 3) {
          gameRef.current.checkedTiles.add(`${tile.x},${tile.y}`);
        }
        
        if (aabbVsAabb(hCheck, tileBox)) {
          // Collision resolution - push player out
          if (player.vx > 0) {
            player.x = tile.x - player.width;
          } else if (player.vx < 0) {
            player.x = tile.x + TILE_SIZE;
          }
          player.vx = 0;
        }
      }
      
      // Apply horizontal movement if no collision
      if (player.vx !== 0) {
        player.x += player.vx;
      }
      
      // Vertical collision
      const futureY = player.y + player.vy;
      const vCheck: AABB = {
        x: player.x,
        y: futureY,
        width: player.width,
        height: player.height
      };
      
      for (const tile of tiles) {
        if (!tile.solid) continue;
        
        const tileBox: AABB = { x: tile.x, y: tile.y, width: TILE_SIZE, height: TILE_SIZE };
        
        if (aabbVsAabb(vCheck, tileBox)) {
          if (player.vy > 0) {
            // Landing
            player.y = tile.y - player.height;
            player.grounded = true;
          } else if (player.vy < 0) {
            // Hit ceiling
            player.y = tile.y + TILE_SIZE;
          }
          player.vy = 0;
        }
      }
      
      // Apply vertical movement if no collision
      if (player.vy !== 0 && !player.grounded) {
        player.y += player.vy;
      }
      
      // World bounds
      player.x = Math.max(0, Math.min(width - player.width, player.x));
      if (player.y > height) {
        // Fell off - reset position with visual feedback
        player.x = 64;
        player.y = 280;
        player.vx = 0;
        player.vy = 0;
        respawnFlashRef.current = 30; // Flash for 30 frames
        // TODO: Add sound effect here - play death/respawn sound
      }
      
      // Update respawn flash timer
      if (respawnFlashRef.current > 0) {
        respawnFlashRef.current--;
      }
      
      // Coin collection (circle vs AABB)
      const playerCenter: CircleShape = {
        x: player.x + player.width / 2,
        y: player.y + player.height / 2,
        radius: player.width / 2
      };
      
      coins.forEach(coin => {
        if (coin.collected) return;
        
        if (circleVsCircle(playerCenter, { x: coin.x, y: coin.y, radius: coin.radius })) {
          coin.collected = true;
          coin.collectTime = frameCount;
          // Spawn particles for visual feedback
          spawnCoinParticles(coin.x, coin.y);
          setScore(s => {
            const newScore = s + 1;
            if (newScore >= gameRef.current.totalCoins) {
              setGameWon(true);
              // TODO: Add sound effect here - play victory sound
            }
            return newScore;
          });
        }
      });
      
      // Update particles
      const { particles } = gameRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // Gravity
        p.life--;
        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }
      
      // Animation
      if (Math.abs(player.vx) > 0.5) {
        player.animFrame = Math.floor(frameCount / 8) % 4;
      } else {
        player.animFrame = 0;
      }
    };

    const render = () => {
      const { player, tiles, coins, particles, checkedTiles } = gameRef.current;
      
      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0a0a1a');
      gradient.addColorStop(1, '#16162a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Stars
      ctx.fillStyle = '#ffffff22';
      for (let i = 0; i < 30; i++) {
        const sx = (i * 97) % width;
        const sy = (i * 53) % (height * 0.6);
        ctx.beginPath();
        ctx.arc(sx, sy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Draw tiles
      tiles.forEach(tile => {
        if (!tile.solid) return;
        
        const isChecked = showDebug && checkedTiles.has(`${tile.x},${tile.y}`);
        
        // Tile base
        if (tile.type === 'ground') {
          ctx.fillStyle = '#2d3436';
        } else {
          ctx.fillStyle = '#1a1a2e';
        }
        ctx.fillRect(tile.x, tile.y, TILE_SIZE, TILE_SIZE);
        
        // Tile border
        ctx.strokeStyle = tile.type === 'ground' ? '#3d4446' : '#2a2a4e';
        ctx.lineWidth = 1;
        ctx.strokeRect(tile.x + 0.5, tile.y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        
        // Debug: highlight checked tiles
        if (isChecked) {
          ctx.fillStyle = '#6c5ce733';
          ctx.fillRect(tile.x, tile.y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#6c5ce7';
          ctx.lineWidth = 2;
          ctx.strokeRect(tile.x, tile.y, TILE_SIZE, TILE_SIZE);
        }
        
        // Top grass/highlight
        if (tile.type === 'platform' || tile.type === 'ground') {
          ctx.fillStyle = '#00b894';
          ctx.fillRect(tile.x, tile.y, TILE_SIZE, 4);
        }
      });
      
      // Draw coins
      const time = frameCount * 0.05;
      coins.forEach(coin => {
        if (coin.collected) return;
        
        const bobY = Math.sin(time + coin.bobOffset) * 3;
        
        // Glow
        ctx.shadowColor = '#fdcb6e';
        ctx.shadowBlur = 15;
        
        // Coin body
        ctx.fillStyle = '#fdcb6e';
        ctx.beginPath();
        ctx.arc(coin.x, coin.y + bobY, coin.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner shine
        ctx.fillStyle = '#ffeaa7';
        ctx.beginPath();
        ctx.arc(coin.x - 2, coin.y + bobY - 2, coin.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        
        // Debug: show collision radius
        if (showDebug) {
          ctx.strokeStyle = '#fdcb6e66';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(coin.x, coin.y + bobY, coin.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      
      // Draw particles (coin collection effects)
      particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      
      // Draw player
      ctx.save();
      ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
      if (!player.facingRight) ctx.scale(-1, 1);
      ctx.translate(-player.width / 2, -player.height / 2);
      
      // Player shadow
      ctx.fillStyle = '#00000033';
      ctx.beginPath();
      ctx.ellipse(player.width / 2, player.height + 2, player.width / 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Body
      ctx.fillStyle = '#6c5ce7';
      ctx.fillRect(2, 8, player.width - 4, player.height - 12);
      
      // Head
      ctx.fillStyle = '#dfe6e9';
      ctx.beginPath();
      ctx.arc(player.width / 2, 8, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = '#2d3436';
      ctx.beginPath();
      ctx.arc(player.width / 2 + 2, 7, 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Legs animation
      const legOffset = player.grounded && Math.abs(player.vx) > 0.5 
        ? Math.sin(player.animFrame * Math.PI / 2) * 4 
        : 0;
      
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(4, player.height - 6, 6, 6 + legOffset);
      ctx.fillRect(player.width - 10, player.height - 6, 6, 6 - legOffset);
      
      ctx.restore();
      
      // Debug: show player hitbox
      if (showDebug) {
        ctx.strokeStyle = '#e17055';
        ctx.lineWidth = 2;
        ctx.strokeRect(player.x, player.y, player.width, player.height);
        
        // Show velocity vectors
        ctx.strokeStyle = '#00b894';
        ctx.beginPath();
        ctx.moveTo(player.x + player.width / 2, player.y + player.height / 2);
        ctx.lineTo(
          player.x + player.width / 2 + player.vx * 5,
          player.y + player.height / 2 + player.vy * 5
        );
        ctx.stroke();
      }
      
      // Respawn flash effect
      if (respawnFlashRef.current > 0) {
        const flashAlpha = (respawnFlashRef.current / 30) * 0.5;
        ctx.fillStyle = `rgba(225, 112, 85, ${flashAlpha})`;
        ctx.fillRect(0, 0, width, height);
        
        // Show "Oops!" text during flash
        if (respawnFlashRef.current > 15) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Oops!', width / 2, height / 2);
        }
      }
      
      // UI
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Coins: ${score}/${gameRef.current.totalCoins}`, 20, 30);
      
      // Grounded indicator
      ctx.fillStyle = player.grounded ? '#00b894' : '#e17055';
      ctx.beginPath();
      ctx.arc(20, 50, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '14px Inter, sans-serif';
      ctx.fillText(player.grounded ? 'Grounded' : 'Airborne', 32, 55);
      
      // Win screen
      if (gameWon) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#fdcb6e';
        ctx.font = 'bold 48px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Level Complete!', width / 2, height / 2 - 20);
        
        ctx.fillStyle = '#a0a0b0';
        ctx.font = '20px Inter, sans-serif';
        ctx.fillText('All coins collected!', width / 2, height / 2 + 20);
      }

      frameCount++;
      animationId = requestAnimationFrame(render);
      update();
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameWon, showDebug, spawnCoinParticles]);

  // Touch control handlers
  const handleTouchStart = useCallback((action: 'left' | 'right' | 'jump') => {
    touchRef.current[action] = true;
    // TODO: Add haptic feedback for mobile
  }, []);

  const handleTouchEnd = useCallback((action: 'left' | 'right' | 'jump') => {
    touchRef.current[action] = false;
  }, []);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      {/* Responsive canvas container */}
      <div className="relative w-full overflow-x-auto">
        <canvas 
          ref={canvasRef}
          className="block mx-auto rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]"
          style={{ width, height, maxWidth: '100%', minWidth: `${width}px` }}
          tabIndex={0}
          role="application"
          aria-label="Platformer game. Use WASD or Arrow keys to move, Space or W to jump. Collect all coins to win."
        />
      </div>
      
      {/* Control buttons */}
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={resetGame}
          className="px-6 py-2 bg-[#6c5ce7] text-white font-semibold rounded-lg hover:bg-[#8677ed] transition-colors flex items-center gap-2"
          aria-label="Reset game"
        >
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
        <button
          onClick={() => setShowDebug(!showDebug)}
          className={`px-6 py-2 font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            showDebug 
              ? 'bg-[#e17055] text-white' 
              : 'bg-[#2a2a3a] text-[#a0a0b0] hover:bg-[#3a3a4a]'
          }`}
          aria-label={showDebug ? 'Hide debug info' : 'Show debug info'}
          aria-pressed={showDebug}
        >
          <Grid3X3 className="w-4 h-4" /> Debug
        </button>
      </div>
      
      {/* Touch controls for mobile */}
      <div className="flex justify-center gap-2 mt-4 md:hidden" role="group" aria-label="Touch controls">
        <button
          onTouchStart={() => handleTouchStart('left')}
          onTouchEnd={() => handleTouchEnd('left')}
          onMouseDown={() => handleTouchStart('left')}
          onMouseUp={() => handleTouchEnd('left')}
          onMouseLeave={() => handleTouchEnd('left')}
          className="w-16 h-16 bg-[#2a2a3a] active:bg-[#3a3a4a] rounded-xl flex items-center justify-center text-white text-2xl select-none touch-none"
          aria-label="Move left"
        >
          ←
        </button>
        <button
          onTouchStart={() => handleTouchStart('jump')}
          onTouchEnd={() => handleTouchEnd('jump')}
          onMouseDown={() => handleTouchStart('jump')}
          onMouseUp={() => handleTouchEnd('jump')}
          onMouseLeave={() => handleTouchEnd('jump')}
          className="w-20 h-16 bg-[#00b894] active:bg-[#00a383] rounded-xl flex items-center justify-center text-white text-lg font-bold select-none touch-none"
          aria-label="Jump"
        >
          JUMP
        </button>
        <button
          onTouchStart={() => handleTouchStart('right')}
          onTouchEnd={() => handleTouchEnd('right')}
          onMouseDown={() => handleTouchStart('right')}
          onMouseUp={() => handleTouchEnd('right')}
          onMouseLeave={() => handleTouchEnd('right')}
          className="w-16 h-16 bg-[#2a2a3a] active:bg-[#3a3a4a] rounded-xl flex items-center justify-center text-white text-2xl select-none touch-none"
          aria-label="Move right"
        >
          →
        </button>
      </div>
      
      {/* Instructions */}
      <p className="text-center text-sm text-[#a0a0b0] mt-3 hidden md:flex items-center justify-center gap-1">
        <Gamepad2 className="w-4 h-4" /> WASD or Arrow Keys to move, W/Space to jump
      </p>
      <p className="text-center text-sm text-[#a0a0b0] mt-3 flex md:hidden items-center justify-center gap-1">
        <Smartphone className="w-4 h-4" /> Use touch buttons below to play
      </p>
    </div>
  );
}

// ============== AABB VISUALIZER COMPONENT ==============
export function AABBVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boxA, setBoxA] = useState({ x: 150, y: 120, width: 100, height: 80 });
  const [boxB, setBoxB] = useState({ x: 280, y: 150, width: 120, height: 100 });
  const [dragging, setDragging] = useState<'A' | 'B' | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const width = 600;
  const height = 350;

  const isColliding = aabbVsAabb(boxA, boxB);
  const overlap = isColliding ? getAabbOverlap(boxA, boxB) : null;

  // Get coordinates from mouse or touch event
  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    
    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * (width / rect.width),
      y: (clientY - rect.top) * (height / rect.height)
    };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoords(e);
    if (!coords) return;
    const { x, y } = coords;
    
    // Check if clicking on box A
    if (x >= boxA.x && x <= boxA.x + boxA.width && y >= boxA.y && y <= boxA.y + boxA.height) {
      setDragging('A');
      setDragOffset({ x: x - boxA.x, y: y - boxA.y });
      return;
    }
    
    // Check if clicking on box B
    if (x >= boxB.x && x <= boxB.x + boxB.width && y >= boxB.y && y <= boxB.y + boxB.height) {
      setDragging('B');
      setDragOffset({ x: x - boxB.x, y: y - boxB.y });
    }
  }, [boxA, boxB, getCoords]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    
    const coords = getCoords(e);
    if (!coords) return;
    const { x, y } = coords;
    
    if (dragging === 'A') {
      setBoxA(prev => ({ ...prev, x: x - dragOffset.x, y: y - dragOffset.y }));
    } else {
      setBoxB(prev => ({ ...prev, x: x - dragOffset.x, y: y - dragOffset.y }));
    }
  }, [dragging, dragOffset, getCoords]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
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
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Grid
    ctx.strokeStyle = '#1a1a2a';
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
    
    // Draw overlap region
    if (overlap) {
      const overlapX = Math.max(boxA.x, boxB.x);
      const overlapY = Math.max(boxA.y, boxB.y);
      
      ctx.fillStyle = '#e1705566';
      ctx.fillRect(overlapX, overlapY, overlap.x, overlap.y);
    }
    
    // Draw box A
    ctx.fillStyle = isColliding ? '#e1705533' : '#6c5ce733';
    ctx.fillRect(boxA.x, boxA.y, boxA.width, boxA.height);
    ctx.strokeStyle = isColliding ? '#e17055' : '#6c5ce7';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxA.x, boxA.y, boxA.width, boxA.height);
    
    // Draw box B
    ctx.fillStyle = isColliding ? '#e1705533' : '#00b89433';
    ctx.fillRect(boxB.x, boxB.y, boxB.width, boxB.height);
    ctx.strokeStyle = isColliding ? '#e17055' : '#00b894';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxB.x, boxB.y, boxB.width, boxB.height);
    
    // Labels
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    ctx.fillStyle = isColliding ? '#e17055' : '#6c5ce7';
    ctx.fillText('Box A', boxA.x + boxA.width / 2, boxA.y + boxA.height / 2 + 5);
    
    ctx.fillStyle = isColliding ? '#e17055' : '#00b894';
    ctx.fillText('Box B', boxB.x + boxB.width / 2, boxB.y + boxB.height / 2 + 5);
    
    // Collision status
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Collision:', 20, 30);
    
    ctx.fillStyle = isColliding ? '#e17055' : '#00b894';
    ctx.fillText(isColliding ? 'TRUE' : 'FALSE', 120, 30);
    
    if (overlap) {
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '14px Inter, sans-serif';
      ctx.fillText(`Overlap: ${overlap.x.toFixed(0)}px × ${overlap.y.toFixed(0)}px`, 20, 55);
    }
    
  }, [boxA, boxB, isColliding, overlap]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <div className="relative w-full overflow-x-auto">
        <canvas 
          ref={canvasRef}
          className="block mx-auto rounded-lg cursor-move touch-none"
          style={{ width, height, maxWidth: '100%', minWidth: `${width}px` }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          role="application"
          aria-label="AABB collision visualizer. Drag Box A (purple) and Box B (green) to see collision detection in action."
          tabIndex={0}
        />
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3 flex items-center justify-center gap-1">
        <Move className="w-4 h-4" /> Drag the boxes to test AABB collision detection
      </p>
    </div>
  );
}

// ============== CIRCLE VISUALIZER COMPONENT ==============
export function CircleVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [circleA, setCircleA] = useState({ x: 200, y: 180, radius: 50 });
  const [circleB, setCircleB] = useState({ x: 380, y: 200, radius: 70 });
  const [dragging, setDragging] = useState<'A' | 'B' | null>(null);
  
  const width = 600;
  const height = 350;

  const isColliding = circleVsCircle(circleA, circleB);
  const dx = circleB.x - circleA.x;
  const dy = circleB.y - circleA.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const combinedRadii = circleA.radius + circleB.radius;

  // Get coordinates from mouse or touch event
  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    
    let clientX: number, clientY: number;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * (width / rect.width),
      y: (clientY - rect.top) * (height / rect.height)
    };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoords(e);
    if (!coords) return;
    const { x, y } = coords;
    
    // Check if clicking on circle A
    const distA = Math.sqrt((x - circleA.x) ** 2 + (y - circleA.y) ** 2);
    if (distA <= circleA.radius) {
      setDragging('A');
      return;
    }
    
    // Check if clicking on circle B
    const distB = Math.sqrt((x - circleB.x) ** 2 + (y - circleB.y) ** 2);
    if (distB <= circleB.radius) {
      setDragging('B');
    }
  }, [circleA, circleB, getCoords]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    
    const coords = getCoords(e);
    if (!coords) return;
    const { x, y } = coords;
    
    if (dragging === 'A') {
      setCircleA(prev => ({ ...prev, x, y }));
    } else {
      setCircleB(prev => ({ ...prev, x, y }));
    }
  }, [dragging, getCoords]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
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
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Draw distance line
    ctx.strokeStyle = isColliding ? '#e1705566' : '#ffffff33';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(circleA.x, circleA.y);
    ctx.lineTo(circleB.x, circleB.y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw circle A
    ctx.fillStyle = isColliding ? '#e1705533' : '#6c5ce733';
    ctx.beginPath();
    ctx.arc(circleA.x, circleA.y, circleA.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isColliding ? '#e17055' : '#6c5ce7';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw circle B
    ctx.fillStyle = isColliding ? '#e1705533' : '#00b89433';
    ctx.beginPath();
    ctx.arc(circleB.x, circleB.y, circleB.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isColliding ? '#e17055' : '#00b894';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw centers
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(circleA.x, circleA.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(circleB.x, circleB.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Labels
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('A', circleA.x, circleA.y + 5);
    ctx.fillText('B', circleB.x, circleB.y + 5);
    
    // Info
    ctx.textAlign = 'left';
    ctx.font = '14px Inter, sans-serif';
    
    ctx.fillStyle = '#a0a0b0';
    ctx.fillText(`Distance: ${distance.toFixed(1)}px`, 20, 30);
    ctx.fillText(`r₁ + r₂ = ${combinedRadii}px`, 20, 50);
    
    ctx.fillStyle = isColliding ? '#e17055' : '#00b894';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText(
      isColliding 
        ? `${distance.toFixed(0)} < ${combinedRadii} ✓ COLLISION` 
        : `${distance.toFixed(0)} ≥ ${combinedRadii} - No collision`,
      20, 75
    );
    
  }, [circleA, circleB, isColliding, distance, combinedRadii]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <div className="relative w-full overflow-x-auto">
        <canvas 
          ref={canvasRef}
          className="block mx-auto rounded-lg cursor-move touch-none"
          style={{ width, height, maxWidth: '100%', minWidth: `${width}px` }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          role="application"
          aria-label="Circle collision visualizer. Drag Circle A and Circle B to see distance-based collision detection."
          tabIndex={0}
        />
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3 flex items-center justify-center gap-1">
        <Circle className="w-4 h-4" /> Drag circles to test distance-based collision
      </p>
    </div>
  );
}

// ============== SWEPT COLLISION VISUALIZER ==============
export function SweptCollisionVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [velocity, setVelocity] = useState(15);
  const [angle, setAngle] = useState(-30);
  const [position, setPosition] = useState({ x: 100, y: 150 });
  
  const width = 600;
  const height = 350;
  
  const obstacle: AABB = { x: 300, y: 100, width: 80, height: 200 };
  const projectile: AABB = { x: position.x, y: position.y, width: 30, height: 30 };
  
  const radAngle = (angle * Math.PI) / 180;
  const vel = { 
    x: velocity * Math.cos(radAngle), 
    y: velocity * Math.sin(radAngle) 
  };
  
  const sweepResult = sweptAabb(projectile, vel, obstacle);

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
    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Draw velocity path
    ctx.strokeStyle = '#fdcb6e';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(projectile.x + projectile.width / 2, projectile.y + projectile.height / 2);
    ctx.lineTo(
      projectile.x + projectile.width / 2 + vel.x * 10,
      projectile.y + projectile.height / 2 + vel.y * 10
    );
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw broadphase box
    const broadphase: AABB = {
      x: vel.x > 0 ? projectile.x : projectile.x + vel.x * 10,
      y: vel.y > 0 ? projectile.y : projectile.y + vel.y * 10,
      width: vel.x > 0 ? vel.x * 10 + projectile.width : projectile.width - vel.x * 10,
      height: vel.y > 0 ? vel.y * 10 + projectile.height : projectile.height - vel.y * 10,
    };
    
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 1;
    ctx.strokeRect(broadphase.x, broadphase.y, broadphase.width, broadphase.height);
    
    // Draw obstacle
    ctx.fillStyle = '#2d343666';
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 3;
    ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    
    // Draw collision point
    if (sweepResult.time < 1) {
      const collisionX = projectile.x + vel.x * 10 * sweepResult.time;
      const collisionY = projectile.y + vel.y * 10 * sweepResult.time;
      
      // Ghost showing where it would be without swept collision
      ctx.fillStyle = '#e1705533';
      ctx.fillRect(
        projectile.x + vel.x * 10,
        projectile.y + vel.y * 10,
        projectile.width,
        projectile.height
      );
      ctx.strokeStyle = '#e1705566';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        projectile.x + vel.x * 10,
        projectile.y + vel.y * 10,
        projectile.width,
        projectile.height
      );
      ctx.setLineDash([]);
      
      // Draw resolved position
      ctx.fillStyle = '#00b89466';
      ctx.fillRect(collisionX, collisionY, projectile.width, projectile.height);
      ctx.strokeStyle = '#00b894';
      ctx.lineWidth = 3;
      ctx.strokeRect(collisionX, collisionY, projectile.width, projectile.height);
      
      // Draw normal vector
      ctx.strokeStyle = '#6c5ce7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(collisionX + projectile.width / 2, collisionY + projectile.height / 2);
      ctx.lineTo(
        collisionX + projectile.width / 2 + sweepResult.normalX * 40,
        collisionY + projectile.height / 2 + sweepResult.normalY * 40
      );
      ctx.stroke();
      
      // Arrow head
      const endX = collisionX + projectile.width / 2 + sweepResult.normalX * 40;
      const endY = collisionY + projectile.height / 2 + sweepResult.normalY * 40;
      const arrowAngle = Math.atan2(sweepResult.normalY, sweepResult.normalX);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - 10 * Math.cos(arrowAngle - 0.5), endY - 10 * Math.sin(arrowAngle - 0.5));
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - 10 * Math.cos(arrowAngle + 0.5), endY - 10 * Math.sin(arrowAngle + 0.5));
      ctx.stroke();
    }
    
    // Draw projectile (starting position)
    ctx.fillStyle = '#fdcb6e';
    ctx.fillRect(projectile.x, projectile.y, projectile.width, projectile.height);
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 2;
    ctx.strokeRect(projectile.x, projectile.y, projectile.width, projectile.height);
    
    // Info
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Swept AABB Collision', 20, 30);
    
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#a0a0b0';
    ctx.fillText(`Time of impact: ${sweepResult.time < 1 ? (sweepResult.time * 100).toFixed(1) + '%' : 'No collision'}`, 20, 55);
    
    if (sweepResult.time < 1) {
      ctx.fillStyle = '#6c5ce7';
      ctx.fillText(`Normal: (${sweepResult.normalX}, ${sweepResult.normalY})`, 20, 75);
    }
    
    // Legend
    ctx.fillStyle = '#fdcb6e';
    ctx.fillRect(width - 150, 20, 15, 15);
    ctx.fillStyle = '#a0a0b0';
    ctx.fillText('Start', width - 130, 32);
    
    ctx.fillStyle = '#00b894';
    ctx.fillRect(width - 150, 45, 15, 15);
    ctx.fillText('Resolved', width - 130, 57);
    
    ctx.fillStyle = '#e17055';
    ctx.fillRect(width - 150, 70, 15, 15);
    ctx.fillText('Tunneled', width - 130, 82);
    
  }, [velocity, angle, position, sweepResult]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <div className="relative w-full overflow-x-auto">
        <canvas 
          ref={canvasRef}
          className="block mx-auto rounded-lg"
          style={{ width, height, maxWidth: '100%', minWidth: `${width}px` }}
          role="img"
          aria-label={`Swept AABB collision demo showing a projectile moving at speed ${velocity} and angle ${angle} degrees. ${sweepResult.time < 1 ? `Collision detected at ${(sweepResult.time * 100).toFixed(0)}% of movement path.` : 'No collision detected.'}`}
        />
      </div>
      <div className="flex flex-wrap justify-center gap-6 mt-4" role="group" aria-label="Swept collision controls">
        <div className="flex items-center gap-4">
          <label htmlFor="speed-slider" className="text-[#a0a0b0]">Speed:</label>
          <input
            id="speed-slider"
            type="range"
            min="5"
            max="30"
            step="1"
            value={velocity}
            onChange={(e) => setVelocity(parseFloat(e.target.value))}
            className="w-32 accent-[#fdcb6e]"
            aria-valuemin={5}
            aria-valuemax={30}
            aria-valuenow={velocity}
          />
          <span className="text-white w-12" aria-hidden="true">{velocity}</span>
        </div>
        <div className="flex items-center gap-4">
          <label htmlFor="angle-slider" className="text-[#a0a0b0]">Angle:</label>
          <input
            id="angle-slider"
            type="range"
            min="-60"
            max="60"
            step="5"
            value={angle}
            onChange={(e) => setAngle(parseFloat(e.target.value))}
            className="w-32 accent-[#6c5ce7]"
            aria-valuemin={-60}
            aria-valuemax={60}
            aria-valuenow={angle}
          />
          <span className="text-white w-12" aria-hidden="true">{angle}°</span>
        </div>
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3 flex items-center justify-center gap-1">
        <Zap className="w-4 h-4" aria-hidden="true" /> Swept collision prevents fast objects from tunneling through obstacles
      </p>
    </div>
  );
}
