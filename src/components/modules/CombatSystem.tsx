import { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Eye, EyeOff, 
  Swords, Zap, 
  Circle, ArrowRight, ChevronLeft, ChevronRight 
} from 'lucide-react';

// ============ TYPES ============
type PlayerState = 'idle' | 'walk' | 'jump' | 'attack_light' | 'attack_heavy' | 'hit' | 'block' | 'death';
type EnemyState = 'idle' | 'patrol' | 'chase' | 'attack' | 'hit' | 'death';
type Direction = 'left' | 'right';

interface Vec2 {
  x: number;
  y: number;
}

interface Hitbox {
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  active: boolean;
}

interface Hurtbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Character {
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  health: number;
  maxHealth: number;
  state: PlayerState | EnemyState;
  stateTime: number;
  hitbox: Hitbox | null;
  hurtbox: Hurtbox;
  invincible: number;
  comboCount: number;
  inputBuffer: string[];
}

interface StateTransition {
  from: string;
  to: string;
  condition: string;
}

// ============ CONSTANTS ============
const GROUND_Y = 280;
const GRAVITY = 0.6;
const WALK_SPEED = 4;
const JUMP_FORCE = -14;
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 80;
const ENEMY_WIDTH = 50;
const ENEMY_HEIGHT = 80;

// State durations in frames
const STATE_DURATIONS: Record<string, number> = {
  attack_light: 20,
  attack_heavy: 35,
  hit: 15,
  death: 60,
};

// Attack data
const ATTACKS = {
  light: { damage: 10, width: 60, height: 40, startup: 5, active: 8, recovery: 7 },
  heavy: { damage: 25, width: 80, height: 50, startup: 12, active: 10, recovery: 13 },
};

// ============ MAIN COMBAT SYSTEM ============
export default function CombatSystem() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'victory' | 'defeat'>('idle');
  const [showHitboxes, setShowHitboxes] = useState(true);
  const [showStateInfo, setShowStateInfo] = useState(true);
  const keysRef = useRef<Set<string>>(new Set());
  const gameRef = useRef<{
    player: Character;
    enemy: Character;
    running: boolean;
  } | null>(null);

  const width = 700;
  const height = 350;

  const createPlayer = useCallback((): Character => ({
    x: 150,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    direction: 'right',
    health: 100,
    maxHealth: 100,
    state: 'idle',
    stateTime: 0,
    hitbox: null,
    hurtbox: { x: 0, y: 0, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
    invincible: 0,
    comboCount: 0,
    inputBuffer: [],
  }), []);

  const createEnemy = useCallback((): Character => ({
    x: 500,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    direction: 'left',
    health: 100,
    maxHealth: 100,
    state: 'patrol',
    stateTime: 0,
    hitbox: null,
    hurtbox: { x: 0, y: 0, width: ENEMY_WIDTH, height: ENEMY_HEIGHT },
    invincible: 0,
    comboCount: 0,
    inputBuffer: [],
  }), []);

  const initGame = useCallback(() => {
    gameRef.current = {
      player: createPlayer(),
      enemy: createEnemy(),
      running: false,
    };
  }, [createPlayer, createEnemy]);

  const startGame = useCallback(() => {
    initGame();
    if (gameRef.current) {
      gameRef.current.running = true;
    }
    setGameState('playing');
  }, [initGame]);

  // Handle key events
  useEffect(() => {
    initGame();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'z', 'x', 'c', 'Z', 'X', 'C'].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key.toLowerCase());
        
        // Add to input buffer for combos
        if (gameRef.current && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'x')) {
          gameRef.current.player.inputBuffer.push(e.key.toLowerCase());
          if (gameRef.current.player.inputBuffer.length > 5) {
            gameRef.current.player.inputBuffer.shift();
          }
        }
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
  }, [initGame]);

  // State machine transition logic
  const canTransitionTo = useCallback((char: Character, newState: PlayerState | EnemyState): boolean => {
    const { state, stateTime } = char;
    
    // Death is permanent
    if (state === 'death') return false;
    
    // Hit interrupts most actions
    if (newState === 'hit' && state !== 'death') return true;
    
    // Can't interrupt attack mid-animation
    if ((state === 'attack_light' || state === 'attack_heavy') && 
        stateTime < (STATE_DURATIONS[state] || 0)) {
      return false;
    }
    
    // Block requires holding C
    if (newState === 'block' && !keysRef.current.has('c')) return false;
    
    return true;
  }, []);

  const transitionState = useCallback((char: Character, newState: PlayerState | EnemyState) => {
    if (!canTransitionTo(char, newState)) return;
    
    char.state = newState;
    char.stateTime = 0;
    char.hitbox = null;
    
    // Reset combo if transitioning to non-attack state
    if (newState !== 'attack_light' && newState !== 'attack_heavy') {
      char.comboCount = 0;
    }
  }, [canTransitionTo]);

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

    const updatePlayer = (player: Character) => {
      const keys = keysRef.current;
      
      // Update state time
      player.stateTime++;
      
      // Decrease invincibility
      if (player.invincible > 0) player.invincible--;
      
      // State machine logic
      const { state, stateTime } = player;
      
      // Handle state completion
      if (STATE_DURATIONS[state] && stateTime >= STATE_DURATIONS[state]) {
        transitionState(player, 'idle');
        return;
      }
      
      // Player input handling based on current state
      if (state === 'idle' || state === 'walk') {
        // Movement
        if (keys.has('arrowleft')) {
          player.vx = -WALK_SPEED;
          player.direction = 'left';
          if (state !== 'walk') transitionState(player, 'walk');
        } else if (keys.has('arrowright')) {
          player.vx = WALK_SPEED;
          player.direction = 'right';
          if (state !== 'walk') transitionState(player, 'walk');
        } else {
          player.vx = 0;
          if (state === 'walk') transitionState(player, 'idle');
        }
        
        // Jump
        if (keys.has('arrowup') && player.y >= GROUND_Y) {
          player.vy = JUMP_FORCE;
          transitionState(player, 'jump');
        }
        
        // Attacks
        if (keys.has('z')) {
          transitionState(player, 'attack_light');
          player.comboCount++;
          keysRef.current.delete('z');
        } else if (keys.has('x')) {
          transitionState(player, 'attack_heavy');
          player.comboCount++;
          keysRef.current.delete('x');
        }
        
        // Block
        if (keys.has('c')) {
          transitionState(player, 'block');
        }
      }
      
      // Jump state
      if (state === 'jump') {
        // Air control
        if (keys.has('arrowleft')) {
          player.vx = -WALK_SPEED * 0.7;
          player.direction = 'left';
        } else if (keys.has('arrowright')) {
          player.vx = WALK_SPEED * 0.7;
          player.direction = 'right';
        }
        
        // Air attacks
        if (keys.has('z')) {
          transitionState(player, 'attack_light');
          keysRef.current.delete('z');
        } else if (keys.has('x')) {
          transitionState(player, 'attack_heavy');
          keysRef.current.delete('x');
        }
        
        // Land
        if (player.y >= GROUND_Y && player.vy >= 0) {
          player.y = GROUND_Y;
          player.vy = 0;
          transitionState(player, 'idle');
        }
      }
      
      // Block state
      if (state === 'block') {
        player.vx = 0;
        if (!keys.has('c')) {
          transitionState(player, 'idle');
        }
      }
      
      // Attack hitbox creation
      if (state === 'attack_light' || state === 'attack_heavy') {
        const attackType = state === 'attack_light' ? 'light' : 'heavy';
        const attack = ATTACKS[attackType];
        
        if (stateTime >= attack.startup && stateTime < attack.startup + attack.active) {
          const hitboxX = player.direction === 'right' 
            ? player.x + PLAYER_WIDTH / 2 
            : player.x - PLAYER_WIDTH / 2 - attack.width;
          
          player.hitbox = {
            x: hitboxX,
            y: player.y - PLAYER_HEIGHT / 2 - attack.height / 2,
            width: attack.width,
            height: attack.height,
            damage: attack.damage + (player.comboCount > 1 ? 5 : 0),
            active: true,
          };
        } else {
          player.hitbox = null;
        }
      }
      
      // Physics
      player.vy += GRAVITY;
      player.x += player.vx;
      player.y += player.vy;
      
      // Boundaries
      player.x = Math.max(PLAYER_WIDTH / 2, Math.min(width - PLAYER_WIDTH / 2, player.x));
      if (player.y > GROUND_Y) {
        player.y = GROUND_Y;
        player.vy = 0;
      }
      
      // Update hurtbox
      player.hurtbox = {
        x: player.x - PLAYER_WIDTH / 2,
        y: player.y - PLAYER_HEIGHT,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
      };
    };

    const updateEnemy = (enemy: Character, player: Character) => {
      enemy.stateTime++;
      if (enemy.invincible > 0) enemy.invincible--;
      
      const { state, stateTime } = enemy;
      const distToPlayer = Math.abs(player.x - enemy.x);
      
      // Handle state completion
      if (STATE_DURATIONS[state] && stateTime >= STATE_DURATIONS[state]) {
        transitionState(enemy, 'idle' as EnemyState);
        return;
      }
      
      // Face player
      enemy.direction = player.x < enemy.x ? 'left' : 'right';
      
      // Enemy AI State Machine
      switch (state) {
        case 'idle':
          if (distToPlayer < 300) {
            transitionState(enemy, 'chase');
          } else if (stateTime > 60) {
            transitionState(enemy, 'patrol');
          }
          enemy.vx = 0;
          break;
          
        case 'patrol':
          enemy.vx = enemy.direction === 'right' ? WALK_SPEED * 0.5 : -WALK_SPEED * 0.5;
          if (distToPlayer < 250) {
            transitionState(enemy, 'chase');
          }
          // Reverse at boundaries
          if (enemy.x < 100 || enemy.x > width - 100) {
            enemy.direction = enemy.direction === 'left' ? 'right' : 'left';
          }
          break;
          
        case 'chase':
          if (distToPlayer < 80) {
            transitionState(enemy, 'attack');
          } else if (distToPlayer > 350) {
            transitionState(enemy, 'patrol');
          } else {
            enemy.vx = enemy.direction === 'right' ? WALK_SPEED * 0.8 : -WALK_SPEED * 0.8;
          }
          break;
          
        case 'attack':
          enemy.vx = 0;
          // Create hitbox during attack
          if (stateTime >= 10 && stateTime < 20) {
            const hitboxX = enemy.direction === 'right'
              ? enemy.x + ENEMY_WIDTH / 2
              : enemy.x - ENEMY_WIDTH / 2 - 50;
            
            enemy.hitbox = {
              x: hitboxX,
              y: enemy.y - ENEMY_HEIGHT / 2 - 20,
              width: 50,
              height: 40,
              damage: 15,
              active: true,
            };
          } else {
            enemy.hitbox = null;
          }
          
          if (stateTime >= 30) {
            transitionState(enemy, 'idle' as EnemyState);
          }
          break;
          
        case 'hit':
          enemy.vx = 0;
          if (stateTime >= 15) {
            transitionState(enemy, 'idle' as EnemyState);
          }
          break;
          
        case 'death':
          enemy.vx = 0;
          break;
      }
      
      // Physics
      enemy.x += enemy.vx;
      enemy.x = Math.max(ENEMY_WIDTH / 2, Math.min(width - ENEMY_WIDTH / 2, enemy.x));
      
      // Update hurtbox
      enemy.hurtbox = {
        x: enemy.x - ENEMY_WIDTH / 2,
        y: enemy.y - ENEMY_HEIGHT,
        width: ENEMY_WIDTH,
        height: ENEMY_HEIGHT,
      };
    };

    const checkCollisions = (player: Character, enemy: Character) => {
      // Player attack hits enemy
      if (player.hitbox?.active && enemy.state !== 'death' && enemy.invincible === 0) {
        const hit = aabbCollision(player.hitbox, enemy.hurtbox);
        if (hit) {
          enemy.health -= player.hitbox.damage;
          enemy.invincible = 20;
          transitionState(enemy, 'hit' as EnemyState);
          
          // Knockback
          enemy.x += player.direction === 'right' ? 20 : -20;
          
          if (enemy.health <= 0) {
            enemy.health = 0;
            transitionState(enemy, 'death' as EnemyState);
          }
        }
      }
      
      // Enemy attack hits player
      if (enemy.hitbox?.active && player.state !== 'death' && player.invincible === 0) {
        const hit = aabbCollision(enemy.hitbox, player.hurtbox);
        if (hit) {
          if (player.state === 'block') {
            // Blocked - reduced damage and no stun
            player.health -= Math.floor(enemy.hitbox.damage * 0.2);
            player.invincible = 10;
          } else {
            player.health -= enemy.hitbox.damage;
            player.invincible = 20;
            transitionState(player, 'hit');
            
            // Knockback
            player.x += enemy.direction === 'right' ? 15 : -15;
          }
          
          if (player.health <= 0) {
            player.health = 0;
            transitionState(player, 'death');
          }
        }
      }
    };

    const aabbCollision = (a: { x: number; y: number; width: number; height: number }, 
                          b: { x: number; y: number; width: number; height: number }): boolean => {
      return a.x < b.x + b.width &&
             a.x + a.width > b.x &&
             a.y < b.y + b.height &&
             a.y + a.height > b.y;
    };

    const drawCharacter = (char: Character, isPlayer: boolean) => {
      const x = char.x;
      const y = char.y;
      const w = isPlayer ? PLAYER_WIDTH : ENEMY_WIDTH;
      const h = isPlayer ? PLAYER_HEIGHT : ENEMY_HEIGHT;
      
      // Blink when invincible
      if (char.invincible > 0 && Math.floor(char.invincible / 3) % 2 === 0) return;
      
      ctx.save();
      
      // Flip based on direction
      if (char.direction === 'left') {
        ctx.translate(x, 0);
        ctx.scale(-1, 1);
        ctx.translate(-x, 0);
      }
      
      // Body color based on state
      let bodyColor = isPlayer ? '#6c5ce7' : '#e17055';
      if (char.state === 'hit') bodyColor = '#fff';
      if (char.state === 'block') bodyColor = '#00b894';
      if (char.state === 'death') bodyColor = '#4a4a5a';
      if (char.state === 'attack_light' || char.state === 'attack_heavy' || char.state === 'attack') {
        bodyColor = isPlayer ? '#a29bfe' : '#fab1a0';
      }
      
      // Draw body
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x - w/2, y - h, w, h);
      
      // Draw face/details
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 5, y - h + 15, 6, 6); // Eye
      
      // Draw action indicator
      if (char.state === 'attack_light' || char.state === 'attack_heavy' || char.state === 'attack') {
        // Attack arm
        ctx.fillStyle = bodyColor;
        const armLength = char.state === 'attack_heavy' ? 40 : 25;
        ctx.fillRect(x + w/2, y - h/2 - 10, armLength, 15);
      }
      
      if (char.state === 'block') {
        // Shield
        ctx.fillStyle = '#55efc4';
        ctx.fillRect(x + w/2 - 5, y - h + 20, 15, h - 30);
      }
      
      ctx.restore();
      
      // Draw hitbox (debug)
      if (showHitboxes && char.hitbox?.active) {
        ctx.strokeStyle = '#e17055';
        ctx.lineWidth = 2;
        ctx.strokeRect(char.hitbox.x, char.hitbox.y, char.hitbox.width, char.hitbox.height);
        ctx.fillStyle = 'rgba(225, 112, 85, 0.3)';
        ctx.fillRect(char.hitbox.x, char.hitbox.y, char.hitbox.width, char.hitbox.height);
      }
      
      // Draw hurtbox (debug)
      if (showHitboxes) {
        ctx.strokeStyle = '#00b894';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(char.hurtbox.x, char.hurtbox.y, char.hurtbox.width, char.hurtbox.height);
        ctx.setLineDash([]);
      }
    };

    const drawHealthBar = (char: Character, x: number, y: number, label: string) => {
      const barWidth = 150;
      const barHeight = 16;
      const healthPercent = char.health / char.maxHealth;
      
      // Background
      ctx.fillStyle = '#1a1a24';
      ctx.fillRect(x, y, barWidth, barHeight);
      
      // Health
      ctx.fillStyle = healthPercent > 0.5 ? '#00b894' : healthPercent > 0.25 ? '#fdcb6e' : '#e17055';
      ctx.fillRect(x, y, barWidth * healthPercent, barHeight);
      
      // Border
      ctx.strokeStyle = '#3a3a4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, barWidth, barHeight);
      
      // Label
      ctx.font = '12px Inter, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x, y - 5);
      
      // Health text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(`${char.health}/${char.maxHealth}`, x + barWidth / 2, y + 12);
      ctx.textAlign = 'left';
    };

    const drawStateInfo = (char: Character, x: number, y: number, isPlayer: boolean) => {
      if (!showStateInfo) return;
      
      ctx.font = 'bold 14px Inter, monospace';
      ctx.fillStyle = isPlayer ? '#6c5ce7' : '#e17055';
      ctx.fillText(`State: ${char.state.toUpperCase()}`, x, y);
      
      ctx.font = '12px Inter, monospace';
      ctx.fillStyle = '#a0a0b0';
      ctx.fillText(`Frame: ${char.stateTime}`, x, y + 18);
      
      if (isPlayer && char.comboCount > 1) {
        ctx.fillStyle = '#fdcb6e';
        ctx.fillText(`Combo: ${char.comboCount}x`, x, y + 36);
      }
    };

    const render = () => {
      // Background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);
      
      // Ground
      ctx.fillStyle = '#1a1a24';
      ctx.fillRect(0, GROUND_Y, width, height - GROUND_Y);
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(width, GROUND_Y);
      ctx.stroke();

      if (gameRef.current?.running) {
        const { player, enemy } = gameRef.current;
        
        // Update
        updatePlayer(player);
        updateEnemy(enemy, player);
        checkCollisions(player, enemy);
        
        // Check win/lose
        if (enemy.state === 'death' && enemy.stateTime >= 60) {
          gameRef.current.running = false;
          setGameState('victory');
        }
        if (player.state === 'death' && player.stateTime >= 60) {
          gameRef.current.running = false;
          setGameState('defeat');
        }
        
        // Draw
        drawCharacter(player, true);
        drawCharacter(enemy, false);
        
        // UI
        drawHealthBar(player, 20, 35, 'PLAYER');
        drawHealthBar(enemy, width - 170, 35, 'ENEMY');
        
        drawStateInfo(player, 20, 80, true);
        drawStateInfo(enemy, width - 170, 80, false);
      } else if (gameRef.current) {
        const { player, enemy } = gameRef.current;
        drawCharacter(player, true);
        drawCharacter(enemy, false);
        drawHealthBar(player, 20, 35, 'PLAYER');
        drawHealthBar(enemy, width - 170, 35, 'ENEMY');
      }

      // Overlay for non-playing states
      if (gameState !== 'playing') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        
        if (gameState === 'victory') {
          ctx.fillStyle = '#00b894';
          ctx.fillText('VICTORY!', width / 2, height / 2 - 20);
        } else if (gameState === 'defeat') {
          ctx.fillStyle = '#e17055';
          ctx.fillText('DEFEAT', width / 2, height / 2 - 20);
        } else {
          ctx.fillText('COMBAT SYSTEM', width / 2, height / 2 - 30);
          ctx.font = '16px Inter, sans-serif';
          ctx.fillStyle = '#a0a0b0';
          ctx.fillText('Learn about State Machines through fighting!', width / 2, height / 2 + 10);
        }
        
        ctx.textAlign = 'left';
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameState, showHitboxes, showStateInfo, transitionState]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas
        ref={canvasRef}
        className="block mx-auto rounded-lg"
        style={{ width, height }}
        tabIndex={0}
      />
      
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        <button
          onClick={startGame}
          className="px-6 py-2 bg-[#6c5ce7] text-white font-semibold rounded-lg hover:bg-[#8677ed] transition-colors flex items-center gap-2"
        >
          {gameState === 'playing' ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {gameState === 'playing' ? 'Restart' : 'Start Fight'}
        </button>
        
        <button
          onClick={() => setShowHitboxes(!showHitboxes)}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
            showHitboxes ? 'bg-[#00b894] text-white' : 'bg-[#2a2a3a] text-[#a0a0b0]'
          }`}
        >
          {showHitboxes ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          Hitboxes
        </button>
        
        <button
          onClick={() => setShowStateInfo(!showStateInfo)}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
            showStateInfo ? 'bg-[#fdcb6e] text-[#1a1a24]' : 'bg-[#2a2a3a] text-[#a0a0b0]'
          }`}
        >
          <Circle className="w-4 h-4" />
          State Info
        </button>
      </div>
      
      <div className="mt-4 text-center text-sm text-[#a0a0b0]">
        <p className="flex items-center justify-center gap-2 flex-wrap">
          <span className="flex items-center gap-1"><ChevronLeft className="w-4 h-4" /><ChevronRight className="w-4 h-4" /> Move</span>
          <span className="text-[#4a4a5a]">|</span>
          <span>↑ Jump</span>
          <span className="text-[#4a4a5a]">|</span>
          <span className="text-[#6c5ce7]">Z Light Attack</span>
          <span className="text-[#4a4a5a]">|</span>
          <span className="text-[#e17055]">X Heavy Attack</span>
          <span className="text-[#4a4a5a]">|</span>
          <span className="text-[#00b894]">C Block</span>
        </p>
      </div>
    </div>
  );
}

// ============ STATE MACHINE VISUALIZER ============
export function StateMachineVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedState, setSelectedState] = useState<string | null>('idle');
  const [isAnimating, setIsAnimating] = useState(false);
  
  const width = 650;
  const height = 400;

  // State positions for visualization
  const states: Record<string, { x: number; y: number; color: string }> = {
    idle: { x: 150, y: 200, color: '#6c5ce7' },
    walk: { x: 300, y: 100, color: '#00b894' },
    jump: { x: 300, y: 300, color: '#74b9ff' },
    attack: { x: 500, y: 150, color: '#e17055' },
    hit: { x: 500, y: 250, color: '#fdcb6e' },
    block: { x: 150, y: 320, color: '#00b894' },
  };

  // Transitions
  const transitions: StateTransition[] = [
    { from: 'idle', to: 'walk', condition: '← → pressed' },
    { from: 'walk', to: 'idle', condition: 'no input' },
    { from: 'idle', to: 'jump', condition: '↑ pressed' },
    { from: 'walk', to: 'jump', condition: '↑ pressed' },
    { from: 'jump', to: 'idle', condition: 'landed' },
    { from: 'idle', to: 'attack', condition: 'Z or X' },
    { from: 'walk', to: 'attack', condition: 'Z or X' },
    { from: 'attack', to: 'idle', condition: 'anim done' },
    { from: 'idle', to: 'hit', condition: 'took damage' },
    { from: 'walk', to: 'hit', condition: 'took damage' },
    { from: 'hit', to: 'idle', condition: 'stun done' },
    { from: 'idle', to: 'block', condition: 'C held' },
    { from: 'block', to: 'idle', condition: 'C released' },
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
    
    // Draw transitions (arrows)
    transitions.forEach(({ from, to, condition }) => {
      const fromState = states[from];
      const toState = states[to];
      if (!fromState || !toState) return;
      
      const isActive = selectedState === from;
      
      // Calculate control point for curved lines
      const midX = (fromState.x + toState.x) / 2;
      const midY = (fromState.y + toState.y) / 2;
      const dx = toState.x - fromState.x;
      const dy = toState.y - fromState.y;
      const perpX = -dy * 0.2;
      const perpY = dx * 0.2;
      const ctrlX = midX + perpX;
      const ctrlY = midY + perpY;
      
      // Draw line
      ctx.strokeStyle = isActive ? '#6c5ce7' : '#2a2a3a';
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(fromState.x, fromState.y);
      ctx.quadraticCurveTo(ctrlX, ctrlY, toState.x, toState.y);
      ctx.stroke();
      
      // Draw arrowhead
      const angle = Math.atan2(toState.y - ctrlY, toState.x - ctrlX);
      const arrowLen = 12;
      const arrowX = toState.x - Math.cos(angle) * 35;
      const arrowY = toState.y - Math.sin(angle) * 35;
      
      ctx.fillStyle = isActive ? '#6c5ce7' : '#2a2a3a';
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - Math.cos(angle - 0.4) * arrowLen,
        arrowY - Math.sin(angle - 0.4) * arrowLen
      );
      ctx.lineTo(
        arrowX - Math.cos(angle + 0.4) * arrowLen,
        arrowY - Math.sin(angle + 0.4) * arrowLen
      );
      ctx.closePath();
      ctx.fill();
      
      // Draw condition label for active transitions
      if (isActive) {
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = '#a0a0b0';
        ctx.textAlign = 'center';
        ctx.fillText(condition, ctrlX, ctrlY - 5);
        ctx.textAlign = 'left';
      }
    });
    
    // Draw states (circles)
    Object.entries(states).forEach(([name, { x, y, color }]) => {
      const isSelected = selectedState === name;
      const radius = isSelected ? 35 : 30;
      
      // Glow effect for selected
      if (isSelected) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
      }
      
      // Circle
      ctx.fillStyle = isSelected ? color : '#1a1a24';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      ctx.shadowBlur = 0;
      
      // Label
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillStyle = isSelected ? '#fff' : color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.toUpperCase(), x, y);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    });
    
    // Legend
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#6a6a7a';
    ctx.fillText('Click a state to see its transitions', 20, height - 20);

  }, [selectedState]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check which state was clicked
    for (const [name, state] of Object.entries(states)) {
      const dist = Math.sqrt(Math.pow(x - state.x, 2) + Math.pow(y - state.y, 2));
      if (dist < 35) {
        setSelectedState(name);
        return;
      }
    }
  };

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas
        ref={canvasRef}
        className="block mx-auto rounded-lg cursor-pointer"
        style={{ width, height }}
        onClick={handleCanvasClick}
      />
      
      {selectedState && (
        <div className="mt-4 p-4 bg-[#0a0a0f] rounded-lg">
          <h4 className="font-bold text-white mb-2 flex items-center gap-2">
            <Circle className="w-4 h-4" style={{ color: states[selectedState]?.color }} />
            {selectedState.toUpperCase()} State
          </h4>
          <div className="text-sm text-[#a0a0b0]">
            <p className="mb-2">Transitions from this state:</p>
            <ul className="list-disc list-inside space-y-1">
              {transitions
                .filter(t => t.from === selectedState)
                .map((t, i) => (
                  <li key={i}>
                    <ArrowRight className="w-3 h-3 inline mx-1" />
                    <span style={{ color: states[t.to]?.color }}>{t.to.toUpperCase()}</span>
                    <span className="text-[#6a6a7a]"> when {t.condition}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
      
      <p className="text-center text-sm text-[#6a6a7a] mt-3">
        Click on any state node to explore its transitions
      </p>
    </div>
  );
}

// ============ HITBOX VISUALIZER ============
export function HitboxVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [attackType, setAttackType] = useState<'light' | 'heavy'>('light');
  
  const width = 500;
  const height = 300;
  const totalFrames = attackType === 'light' ? 20 : 35;
  
  const attack = ATTACKS[attackType];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setFrame(f => (f + 1) % totalFrames);
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, totalFrames]);

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
    
    // Ground
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 220, width, 80);
    
    const charX = 200;
    const charY = 220;
    const charW = 50;
    const charH = 80;
    
    // Determine phase
    const isStartup = frame < attack.startup;
    const isActive = frame >= attack.startup && frame < attack.startup + attack.active;
    const isRecovery = frame >= attack.startup + attack.active;
    
    // Phase indicator
    let phaseText = '';
    let phaseColor = '';
    if (isStartup) {
      phaseText = 'STARTUP';
      phaseColor = '#fdcb6e';
    } else if (isActive) {
      phaseText = 'ACTIVE';
      phaseColor = '#e17055';
    } else {
      phaseText = 'RECOVERY';
      phaseColor = '#74b9ff';
    }
    
    // Draw character
    ctx.fillStyle = isActive ? '#a29bfe' : '#6c5ce7';
    ctx.fillRect(charX - charW/2, charY - charH, charW, charH);
    
    // Draw attacking arm
    if (frame >= attack.startup - 3) {
      const armProgress = isActive ? 1 : isRecovery ? 0.5 : (frame - attack.startup + 3) / 3;
      const armLength = (attackType === 'light' ? 25 : 40) * armProgress;
      ctx.fillStyle = ctx.fillStyle;
      ctx.fillRect(charX + charW/2, charY - charH/2 - 10, armLength, 15);
    }
    
    // Draw hurtbox (always visible)
    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(charX - charW/2, charY - charH, charW, charH);
    ctx.setLineDash([]);
    
    // Draw hitbox (only during active frames)
    if (isActive) {
      const hitboxX = charX + charW/2;
      const hitboxY = charY - charH/2 - attack.height/2;
      
      ctx.strokeStyle = '#e17055';
      ctx.lineWidth = 3;
      ctx.strokeRect(hitboxX, hitboxY, attack.width, attack.height);
      ctx.fillStyle = 'rgba(225, 112, 85, 0.3)';
      ctx.fillRect(hitboxX, hitboxY, attack.width, attack.height);
      
      // Damage label
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillStyle = '#e17055';
      ctx.fillText(`${attack.damage} DMG`, hitboxX + attack.width/2 - 25, hitboxY - 10);
    }
    
    // Timeline
    const timelineY = 260;
    const timelineWidth = width - 40;
    const frameWidth = timelineWidth / totalFrames;
    
    // Draw timeline background
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(20, timelineY, timelineWidth, 20);
    
    // Draw phase sections
    // Startup
    ctx.fillStyle = 'rgba(253, 203, 110, 0.3)';
    ctx.fillRect(20, timelineY, frameWidth * attack.startup, 20);
    
    // Active
    ctx.fillStyle = 'rgba(225, 112, 85, 0.3)';
    ctx.fillRect(20 + frameWidth * attack.startup, timelineY, frameWidth * attack.active, 20);
    
    // Recovery
    ctx.fillStyle = 'rgba(116, 185, 255, 0.3)';
    ctx.fillRect(20 + frameWidth * (attack.startup + attack.active), timelineY, frameWidth * attack.recovery, 20);
    
    // Current frame indicator
    ctx.fillStyle = '#fff';
    ctx.fillRect(20 + frameWidth * frame, timelineY - 2, frameWidth, 24);
    
    // Phase label
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillStyle = phaseColor;
    ctx.fillText(phaseText, 20, 30);
    
    // Frame counter
    ctx.font = '14px Inter, monospace';
    ctx.fillStyle = '#a0a0b0';
    ctx.fillText(`Frame: ${frame + 1}/${totalFrames}`, width - 120, 30);
    
    // Legend
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#fdcb6e';
    ctx.fillText(`Startup: ${attack.startup}f`, 20, timelineY + 40);
    ctx.fillStyle = '#e17055';
    ctx.fillText(`Active: ${attack.active}f`, 100, timelineY + 40);
    ctx.fillStyle = '#74b9ff';
    ctx.fillText(`Recovery: ${attack.recovery}f`, 180, timelineY + 40);

  }, [frame, attackType, attack]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas
        ref={canvasRef}
        className="block mx-auto rounded-lg"
        style={{ width, height }}
      />
      
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-4 py-2 bg-[#6c5ce7] text-white font-semibold rounded-lg hover:bg-[#8677ed] transition-colors flex items-center gap-2"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        
        <button
          onClick={() => { setFrame(0); setAttackType('light'); }}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            attackType === 'light' ? 'bg-[#6c5ce7] text-white' : 'bg-[#2a2a3a] text-[#a0a0b0]'
          }`}
        >
          <Zap className="w-4 h-4 inline mr-1" /> Light (20f)
        </button>
        
        <button
          onClick={() => { setFrame(0); setAttackType('heavy'); }}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            attackType === 'heavy' ? 'bg-[#e17055] text-white' : 'bg-[#2a2a3a] text-[#a0a0b0]'
          }`}
        >
          <Swords className="w-4 h-4 inline mr-1" /> Heavy (35f)
        </button>
      </div>
      
      <div className="flex justify-center gap-4 mt-3">
        <span className="text-[#00b894] text-sm flex items-center gap-1">
          <div className="w-3 h-3 border-2 border-[#00b894] border-dashed" /> Hurtbox
        </span>
        <span className="text-[#e17055] text-sm flex items-center gap-1">
          <div className="w-3 h-3 border-2 border-[#e17055]" /> Hitbox
        </span>
      </div>
    </div>
  );
}

// ============ INPUT BUFFER DEMO ============
export function InputBufferDemo() {
  const [buffer, setBuffer] = useState<{ key: string; time: number }[]>([]);
  const [combo, setCombo] = useState<string | null>(null);
  const bufferWindowMs = 500;
  
  const combos: Record<string, string[]> = {
    'Uppercut': ['z', 'z', 'x'],
    'Sweep': ['x', 'x', 'z'],
    'Super': ['z', 'x', 'z', 'x'],
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'x') {
        e.preventDefault();
        const now = Date.now();
        
        setBuffer(prev => {
          // Filter old inputs
          const filtered = prev.filter(b => now - b.time < bufferWindowMs);
          const newBuffer = [...filtered, { key: e.key.toLowerCase(), time: now }];
          
          // Check for combos
          const recentKeys = newBuffer.map(b => b.key);
          for (const [name, sequence] of Object.entries(combos)) {
            if (recentKeys.length >= sequence.length) {
              const lastN = recentKeys.slice(-sequence.length);
              if (lastN.every((k, i) => k === sequence[i])) {
                setCombo(name);
                setTimeout(() => setCombo(null), 1000);
                return []; // Clear buffer after combo
              }
            }
          }
          
          return newBuffer;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cleanup old buffer entries
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setBuffer(prev => prev.filter(b => now - b.time < bufferWindowMs));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-6">
      <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-[#fdcb6e]" /> Input Buffer Demo
      </h4>
      
      <div className="flex items-center justify-center gap-2 mb-4 h-16">
        {buffer.map((b, i) => (
          <div
            key={i}
            className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl animate-pulse ${
              b.key === 'z' ? 'bg-[#6c5ce7] text-white' : 'bg-[#e17055] text-white'
            }`}
          >
            {b.key.toUpperCase()}
          </div>
        ))}
        {buffer.length === 0 && (
          <p className="text-[#6a6a7a]">Press Z or X to add inputs...</p>
        )}
      </div>
      
      {combo && (
        <div className="text-center mb-4 animate-bounce">
          <span className="text-2xl font-bold text-[#fdcb6e]">{combo}!</span>
        </div>
      )}
      
      <div className="bg-[#0a0a0f] rounded-lg p-4 mt-4">
        <h5 className="font-semibold text-white mb-2">Try these combos:</h5>
        <ul className="text-sm text-[#a0a0b0] space-y-1">
          {Object.entries(combos).map(([name, seq]) => (
            <li key={name} className="flex items-center gap-2">
              <span className="text-[#6c5ce7]">{name}:</span>
              {seq.map((k, i) => (
                <span key={i} className={`px-2 py-0.5 rounded ${
                  k === 'z' ? 'bg-[#6c5ce7]/30 text-[#6c5ce7]' : 'bg-[#e17055]/30 text-[#e17055]'
                }`}>
                  {k.toUpperCase()}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </div>
      
      <p className="text-center text-sm text-[#6a6a7a] mt-4">
        Inputs expire after {bufferWindowMs}ms — timing matters!
      </p>
    </div>
  );
}
