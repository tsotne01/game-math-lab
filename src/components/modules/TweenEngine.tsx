import { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Zap, TrendingUp, Timer, Palette, Move, RotateCw, Maximize, Film, Copy, Check } from 'lucide-react';

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

interface Keyframe {
  t: number; // 0 to 1
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: RGB;
  easing: string;
}

interface Animation {
  id: string;
  name: string;
  duration: number;
  keyframes: Keyframe[];
}

// ============== EASING FUNCTIONS ==============
const easingFunctions: Record<string, (t: number) => number> = {
  // Linear
  linear: (t) => t,
  
  // Quadratic
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  // Cubic
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  
  // Quartic
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  
  // Quintic
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 + (--t) * t * t * t * t,
  easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
  
  // Sine
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  
  // Exponential
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  
  // Circular
  easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t) => Math.sqrt(1 - (--t) * t),
  easeInOutCirc: (t) => t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  
  // Back (overshoots)
  easeInBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutBack: (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  
  // Elastic
  easeInElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInOutElastic: (t) => {
    const c5 = (2 * Math.PI) / 4.5;
    return t === 0 ? 0 : t === 1 ? 1 : t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },
  
  // Bounce
  easeInBounce: (t) => 1 - easingFunctions.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  easeInOutBounce: (t) => t < 0.5
    ? (1 - easingFunctions.easeOutBounce(1 - 2 * t)) / 2
    : (1 + easingFunctions.easeOutBounce(2 * t - 1)) / 2,
};

// ============== INTERPOLATION HELPERS ==============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

function rgbToHex(c: RGB): string {
  return `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 184, b: 148 };
}

// Quadratic Bezier
function quadraticBezier(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
    y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y,
  };
}

// Cubic Bezier
function cubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const oneMinusT = 1 - t;
  const oneMinusT2 = oneMinusT * oneMinusT;
  const oneMinusT3 = oneMinusT2 * oneMinusT;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: oneMinusT3 * p0.x + 3 * oneMinusT2 * t * p1.x + 3 * oneMinusT * t2 * p2.x + t3 * p3.x,
    y: oneMinusT3 * p0.y + 3 * oneMinusT2 * t * p1.y + 3 * oneMinusT * t2 * p2.y + t3 * p3.y,
  };
}

// Catmull-Rom Spline
function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// ============== DEMO 1: LERP VISUALIZER ==============
export function LerpDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0.5);
  const [startPos, setStartPos] = useState<Vec2>({ x: 80, y: 150 });
  const [endPos, setEndPos] = useState<Vec2>({ x: 520, y: 150 });
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Draw line between points
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    ctx.lineTo(endPos.x, endPos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Calculate interpolated position
    const lerpPos = lerpVec2(startPos, endPos, t);

    // Draw start point (A)
    ctx.fillStyle = '#e17055';
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A', startPos.x, startPos.y + 5);

    // Draw end point (B)
    ctx.fillStyle = '#74b9ff';
    ctx.beginPath();
    ctx.arc(endPos.x, endPos.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('B', endPos.x, endPos.y + 5);

    // Draw interpolated point
    ctx.fillStyle = '#00b894';
    ctx.beginPath();
    ctx.arc(lerpPos.x, lerpPos.y, 12, 0, Math.PI * 2);
    ctx.fill();

    // Draw t value indicator
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`lerp(A, B, ${t.toFixed(2)})`, 20, 30);
    ctx.fillText(`Result: (${lerpPos.x.toFixed(0)}, ${lerpPos.y.toFixed(0)})`, 20, 50);

    // Formula visualization
    ctx.fillStyle = '#6c5ce7';
    ctx.font = '12px monospace';
    ctx.fillText(`A + (B - A) × t`, 20, 280);
    ctx.fillText(`= A × (1-t) + B × t`, 20, 300);

  }, [t, startPos, endPos]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const distToStart = Math.hypot(coords.x - startPos.x, coords.y - startPos.y);
    const distToEnd = Math.hypot(coords.x - endPos.x, coords.y - endPos.y);

    if (distToStart < 25) setDragging('start');
    else if (distToEnd < 25) setDragging('end');
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    
    const x = Math.max(20, Math.min(canvas.width - 20, coords.x));
    const y = Math.max(20, Math.min(canvas.height - 20, coords.y));

    if (dragging === 'start') setStartPos({ x, y });
    else setEndPos({ x, y });
  };

  const handlePointerUp = () => setDragging(null);

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={600}
        height={320}
        className="w-full rounded-lg cursor-crosshair touch-none"
        role="img"
        aria-label="Linear interpolation demo canvas. Drag points A and B to change positions."
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-4">
          <label className="text-sm text-text-secondary w-16">t = {t.toFixed(2)}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={t}
            onChange={(e) => setT(parseFloat(e.target.value))}
            className="flex-1 accent-[#00b894]"
          />
        </div>
        <p className="text-xs text-text-secondary">
          Drag points A and B, or adjust the t slider to see interpolation in action.
        </p>
      </div>
    </div>
  );
}

// ============== DEMO 2: EASING COMPARISON ==============
export function EasingComparison() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const categories = [
    { name: 'Quad', easings: ['easeInQuad', 'easeOutQuad', 'easeInOutQuad'] },
    { name: 'Cubic', easings: ['easeInCubic', 'easeOutCubic', 'easeInOutCubic'] },
    { name: 'Elastic', easings: ['easeInElastic', 'easeOutElastic', 'easeInOutElastic'] },
    { name: 'Bounce', easings: ['easeInBounce', 'easeOutBounce', 'easeInOutBounce'] },
  ];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rowHeight = 60;
    const startX = 150;
    const trackWidth = canvas.width - startX - 40;

    categories.forEach((cat, catIdx) => {
      cat.easings.forEach((easingName, i) => {
        const y = 40 + (catIdx * 3 + i) * rowHeight;
        const easing = easingFunctions[easingName];
        const easedT = easing(t);

        // Label
        ctx.fillStyle = '#8a8aaa';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(easingName, startX - 10, y + 5);

        // Track
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(startX, y - 10, trackWidth, 20);

        // Ball position
        const ballX = startX + easedT * trackWidth;
        const color = i === 0 ? '#e17055' : i === 1 ? '#00b894' : '#74b9ff';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ballX, y, 8, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Timeline indicator
    ctx.fillStyle = '#6c5ce7';
    ctx.fillRect(startX + t * trackWidth - 1, 20, 2, canvas.height - 40);
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`t = ${t.toFixed(2)}`, startX + t * trackWidth, 15);

  }, [t]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;

    const animate = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      setT(prev => {
        const next = prev + delta * 0.4;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing]);

  const reset = () => {
    setT(0);
    setPlaying(false);
    lastTimeRef.current = 0;
  };

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={700}
        height={760}
        className="w-full rounded-lg"
        role="img"
        aria-label="Easing comparison chart showing different easing functions animated side by side"
      />
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => { if (t >= 1) setT(0); setPlaying(!playing); lastTimeRef.current = 0; }}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-bg-primary rounded-lg transition-colors"
          aria-label={playing ? 'Pause comparison animation' : 'Play comparison animation'}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 bg-bg-secondary hover:bg-bg-secondary/80 text-text-secondary rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={t}
          onChange={(e) => { setT(parseFloat(e.target.value)); setPlaying(false); }}
          className="flex-1 accent-[#6c5ce7]"
        />
      </div>
    </div>
  );
}

// ============== DEMO 3: EASING CURVE GRAPH ==============
export function EasingCurveGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedEasing, setSelectedEasing] = useState('easeOutCubic');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<number>(0);

  const easingOptions = [
    'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
    'easeInElastic', 'easeOutElastic', 'easeInOutElastic',
    'easeInBounce', 'easeOutBounce', 'easeInOutBounce',
    'easeInBack', 'easeOutBack', 'easeInOutBack',
  ];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const padding = 50;
    const graphWidth = canvas.width - padding * 2;
    const graphHeight = canvas.height - padding * 2;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i / 10) * graphWidth;
      const y = padding + (i / 10) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + graphHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + graphWidth, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + graphHeight);
    ctx.lineTo(padding + graphWidth, padding + graphHeight);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#8a8aaa';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('t (input)', padding + graphWidth / 2, canvas.height - 10);
    ctx.save();
    ctx.translate(15, padding + graphHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('value (output)', 0, 0);
    ctx.restore();

    // Draw linear reference
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, padding + graphHeight);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw easing curve
    const easing = easingFunctions[selectedEasing];
    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const inputT = i / 100;
      const outputT = easing(inputT);
      const x = padding + inputT * graphWidth;
      const y = padding + graphHeight - outputT * graphHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw current position
    const currentOutput = easing(t);
    const posX = padding + t * graphWidth;
    const posY = padding + graphHeight - currentOutput * graphHeight;

    // Vertical line to curve
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(posX, padding + graphHeight);
    ctx.lineTo(posX, posY);
    ctx.lineTo(padding, posY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current point
    ctx.fillStyle = '#e17055';
    ctx.beginPath();
    ctx.arc(posX, posY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Values
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Input t: ${t.toFixed(2)}`, padding + 10, padding + 20);
    ctx.fillText(`Output: ${currentOutput.toFixed(3)}`, padding + 10, padding + 40);

  }, [selectedEasing, t]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;

    let startTime: number;
    const duration = 2000;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      setT(progress);
      
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setPlaying(false);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing]);

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={500}
        height={400}
        className="w-full rounded-lg"
      />
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <select
            value={selectedEasing}
            onChange={(e) => setSelectedEasing(e.target.value)}
            className="bg-bg-secondary text-white px-3 py-2 rounded-lg border border-border"
          >
            {easingOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button
            onClick={() => { setT(0); setPlaying(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-bg-primary rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Animate
          </button>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={t}
          onChange={(e) => { setT(parseFloat(e.target.value)); setPlaying(false); }}
          className="w-full accent-[#00b894]"
        />
      </div>
    </div>
  );
}

// ============== DEMO 4: BEZIER CURVE EDITOR ==============
export function BezierEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [curveType, setCurveType] = useState<'quadratic' | 'cubic'>('cubic');
  const [points, setPoints] = useState<Vec2[]>([
    { x: 60, y: 300 },
    { x: 150, y: 80 },
    { x: 450, y: 80 },
    { x: 540, y: 300 },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [t, setT] = useState(0.5);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    const activePoints = curveType === 'quadratic' ? points.slice(0, 3) : points;

    // Draw control lines
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(activePoints[0].x, activePoints[0].y);
    for (let i = 1; i < activePoints.length; i++) {
      ctx.lineTo(activePoints[i].x, activePoints[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw curve
    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const currT = i / 100;
      let pos: Vec2;
      if (curveType === 'quadratic') {
        pos = quadraticBezier(activePoints[0], activePoints[1], activePoints[2], currT);
      } else {
        pos = cubicBezier(activePoints[0], activePoints[1], activePoints[2], activePoints[3], currT);
      }
      if (i === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    }
    ctx.stroke();

    // Draw current point on curve
    let currentPos: Vec2;
    if (curveType === 'quadratic') {
      currentPos = quadraticBezier(activePoints[0], activePoints[1], activePoints[2], t);
    } else {
      currentPos = cubicBezier(activePoints[0], activePoints[1], activePoints[2], activePoints[3], t);
    }

    ctx.fillStyle = '#e17055';
    ctx.beginPath();
    ctx.arc(currentPos.x, currentPos.y, 10, 0, Math.PI * 2);
    ctx.fill();

    // Draw control points
    activePoints.forEach((point, i) => {
      const isEndpoint = i === 0 || i === activePoints.length - 1;
      ctx.fillStyle = isEndpoint ? '#74b9ff' : '#6c5ce7';
      ctx.beginPath();
      ctx.arc(point.x, point.y, isEndpoint ? 12 : 10, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`P${i}`, point.x, point.y + 4);
    });

    // Labels
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${curveType === 'quadratic' ? 'Quadratic' : 'Cubic'} Bezier`, 10, 25);
    ctx.fillText(`t = ${t.toFixed(2)}`, 10, 45);

  }, [curveType, points, t]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const activePoints = curveType === 'quadratic' ? points.slice(0, 3) : points;
    for (let i = 0; i < activePoints.length; i++) {
      const dist = Math.hypot(coords.x - activePoints[i].x, coords.y - activePoints[i].y);
      if (dist < 20) {
        setDragging(i);
        return;
      }
    }
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    
    const x = Math.max(10, Math.min(canvas.width - 10, coords.x));
    const y = Math.max(10, Math.min(canvas.height - 10, coords.y));

    setPoints(prev => {
      const newPoints = [...prev];
      newPoints[dragging] = { x, y };
      return newPoints;
    });
  };

  const handlePointerUp = () => setDragging(null);

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={600}
        height={360}
        className="w-full rounded-lg cursor-crosshair touch-none"
        role="img"
        aria-label="Bezier curve editor. Drag control points to shape the curve."
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurveType('quadratic')}
            className={`px-4 py-2 rounded-lg transition-colors ${curveType === 'quadratic' ? 'bg-accent text-bg-primary' : 'bg-bg-secondary text-text-secondary'}`}
          >
            Quadratic (3 points)
          </button>
          <button
            onClick={() => setCurveType('cubic')}
            className={`px-4 py-2 rounded-lg transition-colors ${curveType === 'cubic' ? 'bg-accent text-bg-primary' : 'bg-bg-secondary text-text-secondary'}`}
          >
            Cubic (4 points)
          </button>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm text-text-secondary">t = {t.toFixed(2)}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={t}
            onChange={(e) => setT(parseFloat(e.target.value))}
            className="flex-1 accent-[#e17055]"
          />
        </div>
        <p className="text-xs text-text-secondary">
          Drag control points to shape the curve. Blue points are endpoints, purple points are control handles.
        </p>
      </div>
    </div>
  );
}

// ============== DEMO 5: SPLINE PATH EDITOR ==============
export function SplineEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Vec2[]>([
    { x: 80, y: 200 },
    { x: 180, y: 80 },
    { x: 320, y: 280 },
    { x: 460, y: 120 },
    { x: 560, y: 200 },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    // Draw connecting lines
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Catmull-Rom spline
    if (points.length >= 4) {
      ctx.strokeStyle = '#00b894';
      ctx.lineWidth = 3;
      ctx.beginPath();

      // For each segment
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[Math.min(points.length - 1, i + 1)];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        for (let j = 0; j <= 20; j++) {
          const segT = j / 20;
          const pos = catmullRom(p0, p1, p2, p3, segT);
          if (i === 0 && j === 0) ctx.moveTo(pos.x, pos.y);
          else ctx.lineTo(pos.x, pos.y);
        }
      }
      ctx.stroke();

      // Draw current position on spline
      const numSegments = points.length - 1;
      const totalT = t * numSegments;
      const segmentIndex = Math.min(Math.floor(totalT), numSegments - 1);
      const segT = totalT - segmentIndex;

      const p0 = points[Math.max(0, segmentIndex - 1)];
      const p1 = points[segmentIndex];
      const p2 = points[Math.min(points.length - 1, segmentIndex + 1)];
      const p3 = points[Math.min(points.length - 1, segmentIndex + 2)];
      const currentPos = catmullRom(p0, p1, p2, p3, segT);

      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.arc(currentPos.x, currentPos.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw control points
    points.forEach((point, i) => {
      ctx.fillStyle = '#74b9ff';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i}`, point.x, point.y + 4);
    });

    // Info
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Catmull-Rom Spline (${points.length} points)`, 10, 25);
    ctx.fillText(`t = ${t.toFixed(2)}`, 10, 45);

  }, [points, t]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;

    let startTime: number;
    const duration = 3000;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      setT(progress);
      
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setPlaying(false);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    for (let i = 0; i < points.length; i++) {
      const dist = Math.hypot(coords.x - points[i].x, coords.y - points[i].y);
      if (dist < 20) {
        setDragging(i);
        return;
      }
    }
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    
    const x = Math.max(10, Math.min(canvas.width - 10, coords.x));
    const y = Math.max(10, Math.min(canvas.height - 10, coords.y));

    setPoints(prev => {
      const newPoints = [...prev];
      newPoints[dragging] = { x, y };
      return newPoints;
    });
  };

  const handlePointerUp = () => setDragging(null);

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Check if clicking on existing point to remove
    for (let i = 0; i < points.length; i++) {
      const dist = Math.hypot(coords.x - points[i].x, coords.y - points[i].y);
      if (dist < 20 && points.length > 4) {
        setPoints(prev => prev.filter((_, idx) => idx !== i));
        return;
      }
    }

    // Add new point
    setPoints(prev => [...prev, { x: coords.x, y: coords.y }]);
  };

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="w-full rounded-lg cursor-crosshair touch-none"
        role="img"
        aria-label="Catmull-Rom spline editor. Drag points to reshape. Double-click to add or remove points."
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setT(0); setPlaying(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-bg-primary rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Animate
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={t}
            onChange={(e) => { setT(parseFloat(e.target.value)); setPlaying(false); }}
            className="flex-1 accent-[#00b894]"
          />
        </div>
        <p className="text-xs text-text-secondary">
          Drag points to reshape. Double-click to add/remove points. Minimum 4 points for Catmull-Rom.
        </p>
      </div>
    </div>
  );
}

// ============== MAIN TWEEN ENGINE ==============
export default function TweenEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [selectedEasing, setSelectedEasing] = useState('easeInOutCubic');
  const [showCurve, setShowCurve] = useState(true);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Animation sequence
  const [animations, setAnimations] = useState<Animation[]>([
    {
      id: '1',
      name: 'Move & Scale',
      duration: 2,
      keyframes: [
        { t: 0, x: 100, y: 200, scale: 1, rotation: 0, color: { r: 0, g: 184, b: 148 }, easing: 'easeInOutCubic' },
        { t: 0.5, x: 400, y: 100, scale: 1.5, rotation: 180, color: { r: 108, g: 92, b: 231 }, easing: 'easeInOutCubic' },
        { t: 1, x: 500, y: 250, scale: 1, rotation: 360, color: { r: 225, g: 112, b: 85 }, easing: 'easeOutBounce' },
      ],
    },
  ]);
  const [activeAnimIndex, setActiveAnimIndex] = useState(0);

  const easingOptions = [
    'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
    'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
    'easeInElastic', 'easeOutElastic', 'easeInOutElastic',
    'easeInBounce', 'easeOutBounce', 'easeInOutBounce',
    'easeInBack', 'easeOutBack', 'easeInOutBack',
  ];

  // Interpolate keyframes
  const getInterpolatedState = useCallback((anim: Animation, globalT: number) => {
    const keyframes = anim.keyframes;
    if (keyframes.length === 0) return null;
    if (keyframes.length === 1) return keyframes[0];

    // Find surrounding keyframes
    let startKf = keyframes[0];
    let endKf = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (globalT >= keyframes[i].t && globalT <= keyframes[i + 1].t) {
        startKf = keyframes[i];
        endKf = keyframes[i + 1];
        break;
      }
    }

    // Calculate local t within this segment
    const segmentDuration = endKf.t - startKf.t;
    const localT = segmentDuration > 0 ? (globalT - startKf.t) / segmentDuration : 0;
    
    // Apply easing
    const easing = easingFunctions[endKf.easing] || easingFunctions.linear;
    const easedT = easing(Math.max(0, Math.min(1, localT)));

    return {
      t: globalT,
      x: lerp(startKf.x, endKf.x, easedT),
      y: lerp(startKf.y, endKf.y, easedT),
      scale: lerp(startKf.scale, endKf.scale, easedT),
      rotation: lerp(startKf.rotation, endKf.rotation, easedT),
      color: lerpColor(startKf.color, endKf.color, easedT),
      easing: endKf.easing,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    const anim = animations[activeAnimIndex];
    if (!anim) return;

    // Draw path preview
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i <= 50; i++) {
      const previewT = i / 50;
      const state = getInterpolatedState(anim, previewT);
      if (state) {
        if (i === 0) ctx.moveTo(state.x, state.y);
        else ctx.lineTo(state.x, state.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw keyframe markers
    anim.keyframes.forEach((kf, i) => {
      ctx.fillStyle = rgbToHex(kf.color);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(kf.x, kf.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(kf.x, kf.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i}`, kf.x, kf.y + 4);
    });

    // Draw animated object
    const state = getInterpolatedState(anim, t);
    if (state) {
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate((state.rotation * Math.PI) / 180);
      ctx.scale(state.scale, state.scale);

      // Draw object (a rounded square)
      const size = 30;
      ctx.fillStyle = rgbToHex(state.color);
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, 6);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    // Draw easing curve preview (bottom right)
    if (showCurve) {
      const curveX = canvas.width - 160;
      const curveY = canvas.height - 110;
      const curveW = 140;
      const curveH = 90;

      ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
      ctx.fillRect(curveX, curveY, curveW, curveH);
      ctx.strokeStyle = '#2a2a4e';
      ctx.lineWidth = 1;
      ctx.strokeRect(curveX, curveY, curveW, curveH);

      // Draw curve
      const easing = easingFunctions[selectedEasing];
      ctx.strokeStyle = '#00b894';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const inputT = i / 40;
        const outputT = easing(inputT);
        const x = curveX + 10 + inputT * (curveW - 20);
        const y = curveY + curveH - 10 - outputT * (curveH - 20);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Current position dot
      const dotX = curveX + 10 + t * (curveW - 20);
      const easedT = easing(t);
      const dotY = curveY + curveH - 10 - easedT * (curveH - 20);
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8a8aaa';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(selectedEasing, curveX + 5, curveY + 12);
    }

    // Info display
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Animation: ${anim.name}`, 15, 30);
    ctx.fillText(`Time: ${(t * anim.duration).toFixed(2)}s / ${anim.duration}s`, 15, 50);
    ctx.fillText(`Progress: ${(t * 100).toFixed(0)}%`, 15, 70);

  }, [t, animations, activeAnimIndex, selectedEasing, showCurve, getInterpolatedState]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;

    const anim = animations[activeAnimIndex];
    if (!anim) return;

    const animate = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      setT(prev => {
        const next = prev + (delta * speed) / anim.duration;
        if (next >= 1) {
          return 1;
        }
        return next;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed, animations, activeAnimIndex]);

  const reset = () => {
    setT(0);
    setPlaying(false);
    lastTimeRef.current = 0;
  };

  const togglePlay = () => {
    if (t >= 1) setT(0);
    setPlaying(!playing);
    lastTimeRef.current = 0;
  };

  // Keyboard support for timeline
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setT(prev => Math.max(0, prev - step));
        setPlaying(false);
        break;
      case 'ArrowRight':
        e.preventDefault();
        setT(prev => Math.min(1, prev + step));
        setPlaying(false);
        break;
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'Home':
        e.preventDefault();
        reset();
        break;
    }
  };

  // Generate code for current animation
  const [copied, setCopied] = useState(false);
  const generateCode = () => {
    const anim = animations[activeAnimIndex];
    if (!anim) return '';
    
    const keyframesCode = anim.keyframes.map((kf, i) => 
      `  { t: ${kf.t}, x: ${kf.x}, y: ${kf.y}, scale: ${kf.scale}, rotation: ${kf.rotation}, color: { r: ${kf.color.r}, g: ${kf.color.g}, b: ${kf.color.b} }, easing: '${kf.easing}' }`
    ).join(',\n');

    return `const animation = {
  name: '${anim.name}',
  duration: ${anim.duration},
  keyframes: [
${keyframesCode}
  ]
};

// Easing function
const ${selectedEasing} = ${easingFunctions[selectedEasing].toString()};

// Interpolate between keyframes
function getState(animation, t) {
  const keyframes = animation.keyframes;
  // Find surrounding keyframes and interpolate...
}`;
  };

  const copyCode = async () => {
    const code = generateCode();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy code');
    }
  };

  return (
    <div 
      className="bg-bg-card rounded-xl p-4"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Tween Engine - Animation timeline and controls"
    >
      <canvas
        ref={canvasRef}
        width={700}
        height={400}
        className="w-full rounded-lg"
        role="img"
        aria-label="Animation preview canvas showing keyframe interpolation"
      />
      
      {/* Timeline */}
      <div className="mt-4 bg-bg-secondary rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-white">Timeline</span>
          </div>
          <span className="text-xs text-text-secondary">Use ←→ keys to scrub, Space to play/pause</span>
        </div>
        
        {/* Timeline track */}
        <div 
          className="relative h-8 bg-[#1a1a2e] rounded-lg overflow-hidden mb-3"
          role="slider"
          aria-label="Animation timeline"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(t * 100)}
          aria-valuetext={`${(t * 100).toFixed(0)}% progress`}
        >
          {/* Keyframe markers */}
          {animations[activeAnimIndex]?.keyframes.map((kf, i) => (
            <div
              key={i}
              className="absolute top-1 w-3 h-6 rounded cursor-pointer hover:ring-2 ring-white"
              style={{
                left: `calc(${kf.t * 100}% - 6px)`,
                backgroundColor: rgbToHex(kf.color),
              }}
              title={`Keyframe ${i} (t=${kf.t})`}
              role="button"
              aria-label={`Jump to keyframe ${i}`}
              onClick={() => { setT(kf.t); setPlaying(false); }}
            />
          ))}
          
          {/* Playhead */}
          <div
            className="absolute top-0 w-0.5 h-full bg-[#e17055]"
            style={{ left: `${t * 100}%` }}
            aria-hidden="true"
          />
        </div>

        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={t}
          onChange={(e) => { setT(parseFloat(e.target.value)); setPlaying(false); }}
          className="w-full accent-[#e17055]"
          aria-label="Timeline scrubber"
        />
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-bg-primary rounded-lg transition-colors"
          aria-label={playing ? 'Pause animation' : 'Play animation'}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 bg-bg-secondary hover:bg-bg-secondary/80 text-text-secondary rounded-lg transition-colors"
          aria-label="Reset animation to beginning"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        
        <div className="flex items-center gap-2">
          <label htmlFor="speed-select" className="text-sm text-text-secondary">Speed:</label>
          <select
            id="speed-select"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="bg-bg-secondary text-white px-2 py-1 rounded border border-border text-sm"
            aria-label="Playback speed"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="easing-select" className="text-sm text-text-secondary">Easing:</label>
          <select
            id="easing-select"
            value={selectedEasing}
            onChange={(e) => setSelectedEasing(e.target.value)}
            className="bg-bg-secondary text-white px-2 py-1 rounded border border-border text-sm"
            aria-label="Easing function"
          >
            {easingOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowCurve(!showCurve)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showCurve ? 'bg-[#6c5ce7] text-white' : 'bg-bg-secondary text-text-secondary'}`}
          aria-pressed={showCurve}
          aria-label="Toggle easing curve preview"
        >
          <TrendingUp className="w-4 h-4" />
          Curve
        </button>

        <button
          onClick={copyCode}
          className="flex items-center gap-2 px-3 py-2 bg-bg-secondary hover:bg-bg-secondary/80 text-text-secondary rounded-lg transition-colors ml-auto"
          aria-label="Copy animation code to clipboard"
        >
          {copied ? <Check className="w-4 h-4 text-[#00b894]" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      {/* Property display */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {(() => {
          const anim = animations[activeAnimIndex];
          const state = anim ? getInterpolatedState(anim, t) : null;
          if (!state) return null;
          return (
            <>
              <div className="bg-bg-secondary rounded-lg p-3">
                <div className="flex items-center gap-2 text-text-secondary text-xs mb-1">
                  <Move className="w-3 h-3" />
                  Position
                </div>
                <div className="text-white font-mono text-sm">
                  ({state.x.toFixed(0)}, {state.y.toFixed(0)})
                </div>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <div className="flex items-center gap-2 text-text-secondary text-xs mb-1">
                  <Maximize className="w-3 h-3" />
                  Scale
                </div>
                <div className="text-white font-mono text-sm">
                  {state.scale.toFixed(2)}x
                </div>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <div className="flex items-center gap-2 text-text-secondary text-xs mb-1">
                  <RotateCw className="w-3 h-3" />
                  Rotation
                </div>
                <div className="text-white font-mono text-sm">
                  {state.rotation.toFixed(0)}°
                </div>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <div className="flex items-center gap-2 text-text-secondary text-xs mb-1">
                  <Palette className="w-3 h-3" />
                  Color
                </div>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded border border-white/20"
                    style={{ backgroundColor: rgbToHex(state.color) }}
                  />
                  <span className="text-white font-mono text-xs">{rgbToHex(state.color)}</span>
                </div>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <div className="flex items-center gap-2 text-text-secondary text-xs mb-1">
                  <Zap className="w-3 h-3" />
                  Easing
                </div>
                <div className="text-white font-mono text-sm truncate">
                  {state.easing}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ============== CUTSCENE CREATOR ==============
export function CutsceneCreator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [globalT, setGlobalT] = useState(0);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Sequence of animations
  const sequence = [
    { name: 'Slide In', start: 0, end: 1, easing: 'easeOutCubic', 
      from: { x: -50, y: 180, scale: 0.5, rotation: -45, color: { r: 225, g: 112, b: 85 } },
      to: { x: 150, y: 180, scale: 1, rotation: 0, color: { r: 225, g: 112, b: 85 } }
    },
    { name: 'Pulse', start: 1, end: 1.5, easing: 'easeInOutQuad',
      from: { x: 150, y: 180, scale: 1, rotation: 0, color: { r: 225, g: 112, b: 85 } },
      to: { x: 150, y: 180, scale: 1.3, rotation: 0, color: { r: 255, g: 200, b: 100 } }
    },
    { name: 'Shrink', start: 1.5, end: 2, easing: 'easeInOutQuad',
      from: { x: 150, y: 180, scale: 1.3, rotation: 0, color: { r: 255, g: 200, b: 100 } },
      to: { x: 150, y: 180, scale: 1, rotation: 0, color: { r: 0, g: 184, b: 148 } }
    },
    { name: 'Move Across', start: 2, end: 3.5, easing: 'easeInOutCubic',
      from: { x: 150, y: 180, scale: 1, rotation: 0, color: { r: 0, g: 184, b: 148 } },
      to: { x: 500, y: 180, scale: 1, rotation: 720, color: { r: 108, g: 92, b: 231 } }
    },
    { name: 'Bounce Out', start: 3.5, end: 4.5, easing: 'easeOutBounce',
      from: { x: 500, y: 180, scale: 1, rotation: 720, color: { r: 108, g: 92, b: 231 } },
      to: { x: 500, y: 300, scale: 1.2, rotation: 720, color: { r: 116, g: 185, b: 255 } }
    },
    { name: 'Slide Out', start: 4.5, end: 5, easing: 'easeInBack',
      from: { x: 500, y: 300, scale: 1.2, rotation: 720, color: { r: 116, g: 185, b: 255 } },
      to: { x: 700, y: 300, scale: 0.5, rotation: 900, color: { r: 116, g: 185, b: 255 } }
    },
  ];

  const totalDuration = 5;

  const getCurrentState = useCallback(() => {
    const time = globalT * totalDuration;
    
    // Find active animation
    for (const anim of sequence) {
      if (time >= anim.start && time <= anim.end) {
        const localT = (time - anim.start) / (anim.end - anim.start);
        const easing = easingFunctions[anim.easing] || easingFunctions.linear;
        const easedT = easing(localT);

        return {
          x: lerp(anim.from.x, anim.to.x, easedT),
          y: lerp(anim.from.y, anim.to.y, easedT),
          scale: lerp(anim.from.scale, anim.to.scale, easedT),
          rotation: lerp(anim.from.rotation, anim.to.rotation, easedT),
          color: lerpColor(anim.from.color, anim.to.color, easedT),
          animName: anim.name,
        };
      }
    }

    // Return last state if past all animations
    const lastAnim = sequence[sequence.length - 1];
    return { ...lastAnim.to, animName: 'Complete' };
  }, [globalT]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
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

    // Draw object
    const state = getCurrentState();
    
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.scale, state.scale);

    // Star shape
    ctx.fillStyle = rgbToHex(state.color);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = Math.cos(angle) * 25;
      const y = Math.sin(angle) * 25;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Info
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Current: ${state.animName}`, 15, 30);
    ctx.fillText(`Time: ${(globalT * totalDuration).toFixed(2)}s / ${totalDuration}s`, 15, 50);

  }, [globalT, getCurrentState]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;

    const animate = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      setGlobalT(prev => {
        const next = prev + delta / totalDuration;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing]);

  const reset = () => {
    setGlobalT(0);
    setPlaying(false);
    lastTimeRef.current = 0;
  };

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <canvas
        ref={canvasRef}
        width={650}
        height={360}
        className="w-full rounded-lg"
      />

      {/* Sequence timeline */}
      <div className="mt-4 bg-bg-secondary rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Film className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-white">Animation Sequence</span>
        </div>
        
        <div className="relative h-12 bg-[#1a1a2e] rounded-lg overflow-hidden mb-3">
          {sequence.map((anim, i) => {
            const colors = ['#e17055', '#fdcb6e', '#00b894', '#74b9ff', '#6c5ce7', '#a29bfe'];
            const left = (anim.start / totalDuration) * 100;
            const width = ((anim.end - anim.start) / totalDuration) * 100;
            return (
              <div
                key={i}
                className="absolute top-1 bottom-1 rounded flex items-center justify-center text-xs font-medium text-white overflow-hidden"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: colors[i % colors.length],
                }}
              >
                {anim.name}
              </div>
            );
          })}
          
          {/* Playhead */}
          <div
            className="absolute top-0 w-1 h-full bg-white"
            style={{ left: `${globalT * 100}%` }}
          />
        </div>

        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={globalT}
          onChange={(e) => { setGlobalT(parseFloat(e.target.value)); setPlaying(false); }}
          className="w-full accent-white"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => { if (globalT >= 1) setGlobalT(0); setPlaying(!playing); lastTimeRef.current = 0; }}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 text-bg-primary rounded-lg transition-colors"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pause' : 'Play Sequence'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 bg-bg-secondary hover:bg-bg-secondary/80 text-text-secondary rounded-lg transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>
    </div>
  );
}
