import { useRef, useEffect, useState, useCallback } from 'react';

// Constants
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 6;
const BALL_SIZE = 12;
const BALL_SPEED = 5;
const WINNING_SCORE = 5;

interface Vec2 {
  x: number;
  y: number;
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Ball {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
}

function aabbCollision(rect1: { x: number; y: number; width: number; height: number }, rect2: { x: number; y: number; width: number; height: number }): boolean {
  return rect1.x < rect2.x + rect2.width &&
         rect1.x + rect1.width > rect2.x &&
         rect1.y < rect2.y + rect2.height &&
         rect1.y + rect1.height > rect2.y;
}

export default function Pong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [scores, setScores] = useState({ player: 0, ai: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const gameRef = useRef<{
    player: Paddle;
    ai: Paddle;
    ball: Ball;
    running: boolean;
  } | null>(null);

  const width = 700;
  const height = 400;

  const resetBall = useCallback(() => {
    if (!gameRef.current) return;
    gameRef.current.ball = {
      x: width / 2 - BALL_SIZE / 2,
      y: height / 2 - BALL_SIZE / 2,
      size: BALL_SIZE,
      vx: BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
      vy: BALL_SPEED * (Math.random() - 0.5)
    };
  }, []);

  const initGame = useCallback(() => {
    gameRef.current = {
      player: {
        x: 30,
        y: height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT
      },
      ai: {
        x: width - 30 - PADDLE_WIDTH,
        y: height / 2 - PADDLE_HEIGHT / 2,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT
      },
      ball: {
        x: width / 2 - BALL_SIZE / 2,
        y: height / 2 - BALL_SIZE / 2,
        size: BALL_SIZE,
        vx: BALL_SPEED,
        vy: BALL_SPEED * (Math.random() - 0.5)
      },
      running: false
    };
  }, []);

  const startGame = useCallback(() => {
    initGame();
    if (gameRef.current) {
      gameRef.current.running = true;
    }
    setScores({ player: 0, ai: 0 });
    setGameState('playing');
  }, [initGame]);

  const resetGame = useCallback(() => {
    initGame();
    setScores({ player: 0, ai: 0 });
    setGameState('idle');
  }, [initGame]);

  useEffect(() => {
    initGame();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S'].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key.toLowerCase());
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
      const { player, ai, ball } = gameRef.current;

      // Player movement
      if (keysRef.current.has('arrowup') || keysRef.current.has('w')) {
        player.y = Math.max(0, player.y - PADDLE_SPEED);
      }
      if (keysRef.current.has('arrowdown') || keysRef.current.has('s')) {
        player.y = Math.min(height - PADDLE_HEIGHT, player.y + PADDLE_SPEED);
      }

      // AI movement
      const aiCenter = ai.y + PADDLE_HEIGHT / 2;
      const targetY = ball.y + ball.size / 2;
      const aiSpeed = PADDLE_SPEED * 0.7;
      
      if (aiCenter < targetY - 10) {
        ai.y = Math.min(height - PADDLE_HEIGHT, ai.y + aiSpeed);
      } else if (aiCenter > targetY + 10) {
        ai.y = Math.max(0, ai.y - aiSpeed);
      }

      // Ball movement
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Ball collision with top/bottom
      if (ball.y <= 0 || ball.y + ball.size >= height) {
        ball.vy *= -1;
        ball.y = ball.y <= 0 ? 0 : height - ball.size;
      }

      // Ball collision with paddles
      const ballRect = { x: ball.x, y: ball.y, width: ball.size, height: ball.size };

      if (aabbCollision(ballRect, player) && ball.vx < 0) {
        ball.vx *= -1.05;
        ball.x = player.x + player.width;
        const hitPos = (ball.y + ball.size / 2 - player.y) / PADDLE_HEIGHT;
        ball.vy = (hitPos - 0.5) * BALL_SPEED * 2;
      }

      if (aabbCollision(ballRect, ai) && ball.vx > 0) {
        ball.vx *= -1.05;
        ball.x = ai.x - ball.size;
        const hitPos = (ball.y + ball.size / 2 - ai.y) / PADDLE_HEIGHT;
        ball.vy = (hitPos - 0.5) * BALL_SPEED * 2;
      }

      // Scoring
      if (ball.x < 0) {
        setScores(s => {
          const newScores = { ...s, ai: s.ai + 1 };
          if (newScores.ai >= WINNING_SCORE) {
            gameRef.current!.running = false;
            setGameState('lost');
          } else {
            resetBall();
          }
          return newScores;
        });
      }

      if (ball.x > width) {
        setScores(s => {
          const newScores = { ...s, player: s.player + 1 };
          if (newScores.player >= WINNING_SCORE) {
            gameRef.current!.running = false;
            setGameState('won');
          } else {
            resetBall();
          }
          return newScores;
        });
      }
    };

    const render = (time: number) => {
      // Run update at ~60fps
      if (time - lastTime > 16) {
        update();
        lastTime = time;
      }

      // Background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      // Center line
      ctx.strokeStyle = '#2a2a3a';
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.setLineDash([]);

      if (gameRef.current) {
        const { player, ai, ball } = gameRef.current;

        // Player paddle (accent color)
        ctx.fillStyle = '#6c5ce7';
        ctx.fillRect(player.x, player.y, player.width, player.height);

        // AI paddle (danger color)
        ctx.fillStyle = '#e17055';
        ctx.fillRect(ai.x, ai.y, ai.width, ai.height);

        // Ball with glow effect
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ball.x + ball.size / 2, ball.y + ball.size / 2, ball.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Scores
      ctx.font = 'bold 48px Inter, sans-serif';
      ctx.fillStyle = '#6c5ce7';
      ctx.fillText(scores.player.toString(), width / 4, 60);
      ctx.fillStyle = '#e17055';
      ctx.fillText(scores.ai.toString(), width * 3 / 4 - 20, 60);

      // Overlay for non-playing states
      if (gameState !== 'playing') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.textAlign = 'center';

        if (gameState === 'won') {
          ctx.fillText('You Win! 🎉', width / 2, height / 2);
        } else if (gameState === 'lost') {
          ctx.fillText('AI Wins!', width / 2, height / 2);
        } else {
          ctx.fillText('Press Start to Play', width / 2, height / 2);
          ctx.font = '16px Inter, sans-serif';
          ctx.fillStyle = '#a0a0b0';
          ctx.fillText('Use ↑↓ or W/S keys to move', width / 2, height / 2 + 40);
        }

        ctx.textAlign = 'left';
      }

      animationId = requestAnimationFrame(render);
    };

    render(0);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [gameState, scores, resetBall]);

  return (
    <div className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg"
        style={{ width, height }}
        tabIndex={0}
      />
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={startGame}
          className="px-6 py-2 bg-[#6c5ce7] text-white font-semibold rounded-lg hover:bg-[#8677ed] transition-colors"
        >
          {gameState === 'playing' ? 'Restart' : 'Start Game'}
        </button>
        <button
          onClick={resetGame}
          className="px-6 py-2 bg-[#2a2a3a] text-white font-semibold rounded-lg hover:bg-[#3a3a4a] transition-colors"
        >
          Reset
        </button>
      </div>
      <p className="text-center text-sm text-[#a0a0b0] mt-3">
        ⬆️⬇️ Arrow keys or W/S to move. First to {WINNING_SCORE} wins!
      </p>
    </div>
  );
}
