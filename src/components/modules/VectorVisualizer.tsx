import { useRef, useEffect, useState, useCallback } from 'react';
import { MousePointer } from 'lucide-react';

// Vector utility functions
const Vec = {
  add: (v1: Vec2, v2: Vec2): Vec2 => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
  sub: (v1: Vec2, v2: Vec2): Vec2 => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
  scale: (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s }),
  magnitude: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),
  normalize: (v: Vec2): Vec2 => {
    const mag = Vec.magnitude(v);
    return mag === 0 ? { x: 0, y: 0 } : { x: v.x / mag, y: v.y / mag };
  },
  dot: (v1: Vec2, v2: Vec2): number => v1.x * v2.x + v1.y * v2.y,
};

interface Vec2 {
  x: number;
  y: number;
}

function drawArrow(
  ctx: CanvasRenderingContext2D, 
  fromX: number, 
  fromY: number, 
  toX: number, 
  toY: number, 
  color: string = '#6c5ce7'
) {
  const headLen = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = '#2a2a3a';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  for (let i = 0; i < height; i += 50) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
}

export default function VectorVisualizer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<Vec2>({ x: 300, y: 150 });
  const [dimensions, setDimensions] = useState({ width: 600, height: 300 });
  
  // Responsive resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 32; // account for padding
      const width = Math.min(600, Math.max(300, containerWidth));
      const height = Math.min(300, width * 0.5);
      setDimensions({ width, height });
      setMousePos({ x: width / 2 + 100, y: height / 2 });
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const { width, height } = dimensions;
  const centerX = width / 2;
  const centerY = height / 2;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    let animationId: number;

    const render = () => {
      // Background
      ctx.fillStyle = '#1a1a24';
      ctx.fillRect(0, 0, width, height);

      // Grid
      drawGrid(ctx, width, height);

      // Center point
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Vector from center to mouse
      drawArrow(ctx, centerX, centerY, mousePos.x, mousePos.y, '#6c5ce7');

      // Calculate vector properties
      const vec = Vec.sub(mousePos, { x: centerX, y: centerY });
      const mag = Vec.magnitude(vec);
      const norm = Vec.normalize(vec);

      // Display info
      ctx.fillStyle = '#fff';
      ctx.font = '14px Inter, sans-serif';
      ctx.fillText(`Vector: (${vec.x.toFixed(0)}, ${(-vec.y).toFixed(0)})`, 10, 25);
      ctx.fillText(`Magnitude: ${mag.toFixed(1)}`, 10, 45);
      ctx.fillText(`Normalized: (${norm.x.toFixed(2)}, ${(-norm.y).toFixed(2)})`, 10, 65);

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [mousePos, centerX, centerY]);

  return (
    <div ref={containerRef} className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onTouchMove={(e) => {
          e.preventDefault();
          const touch = e.touches[0];
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            setMousePos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
          }
        }}
        className="block mx-auto rounded-lg cursor-crosshair touch-none"
        style={{ width, height }}
        role="img"
        aria-label="Interactive vector visualization. Move mouse or touch to see vector properties."
      />
      <p className="text-center text-sm text-[#a0a0b0] mt-3 flex items-center justify-center gap-1">
        <MousePointer className="w-4 h-4 inline" /> Move your mouse (or touch) to see the vector from center to cursor
      </p>
    </div>
  );
}

// Dot Product Visualizer
export function DotProductVisualizer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<Vec2>({ x: 400, y: 100 });
  const [dimensions, setDimensions] = useState({ width: 600, height: 300 });
  
  // Responsive resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 32;
      const width = Math.min(600, Math.max(300, containerWidth));
      const height = Math.min(300, width * 0.5);
      setDimensions({ width, height });
      setMousePos({ x: width / 2 + 100, y: height / 2 - 50 });
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const { width, height } = dimensions;
  const centerX = width / 2;
  const centerY = height / 2;
  const fixedVec: Vec2 = { x: 100, y: 0 };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
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

    let animationId: number;

    const render = () => {
      ctx.fillStyle = '#1a1a24';
      ctx.fillRect(0, 0, width, height);

      // Center point
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Fixed vector (cyan)
      drawArrow(ctx, centerX, centerY, centerX + fixedVec.x, centerY + fixedVec.y, '#00cec9');

      // Mouse vector (pink)
      const mouseVec = Vec.sub(mousePos, { x: centerX, y: centerY });
      const normalizedMouse = Vec.normalize(mouseVec);
      const scaledMouse = Vec.scale(normalizedMouse, 100);
      drawArrow(ctx, centerX, centerY, centerX + scaledMouse.x, centerY + scaledMouse.y, '#fd79a8');

      // Dot product
      const normFixed = Vec.normalize(fixedVec);
      const dotProduct = Vec.dot(normFixed, normalizedMouse);

      // Arc showing angle
      const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
      ctx.strokeStyle = '#fdcb6e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const endAngle = Math.atan2(scaledMouse.y, scaledMouse.x);
      ctx.arc(centerX, centerY, 40, 0, endAngle, scaledMouse.y < 0);
      ctx.stroke();

      // Info display
      ctx.fillStyle = '#fff';
      ctx.font = '16px Inter, sans-serif';

      let interpretation = '';
      let color = '#fff';
      if (dotProduct > 0.5) {
        interpretation = 'Similar direction';
        color = '#00b894';
      } else if (dotProduct > -0.5) {
        interpretation = 'Perpendicular-ish';
        color = '#fdcb6e';
      } else {
        interpretation = 'Opposite direction';
        color = '#e17055';
      }

      ctx.fillText(`Dot Product: ${dotProduct.toFixed(2)}`, 10, 25);
      ctx.fillText(`Angle: ${(angle * 180 / Math.PI).toFixed(0)}°`, 10, 50);
      ctx.fillStyle = color;
      ctx.fillText(interpretation, 10, 75);

      ctx.fillStyle = '#00cec9';
      ctx.fillText('Cyan: Fixed vector', width - 160, 25);
      ctx.fillStyle = '#fd79a8';
      ctx.fillText('Pink: Your vector', width - 160, 50);

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [mousePos, centerX, centerY]);

  return (
    <div ref={containerRef} className="my-8 bg-[#1a1a24] rounded-xl p-4">
      <canvas 
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onTouchMove={(e) => {
          e.preventDefault();
          const touch = e.touches[0];
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            setMousePos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
          }
        }}
        className="block mx-auto rounded-lg cursor-crosshair touch-none"
        style={{ width, height }}
        role="img"
        aria-label="Interactive dot product visualization. Move to change vector angle."
      />
      <p className="text-center text-sm text-[#a0a0b0] mt-3 flex items-center justify-center gap-1">
        <MousePointer className="w-4 h-4 inline" /> Move mouse (or touch) to change the pink vector. Watch the dot product value.
      </p>
    </div>
  );
}
