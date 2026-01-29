import { useRef, useEffect, type ReactNode } from 'react';

interface CanvasDemoProps {
  width?: number;
  height?: number;
  onDraw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => (() => void) | void;
  caption?: ReactNode;
  className?: string;
}

export default function CanvasDemo({ 
  width = 600, 
  height = 300, 
  onDraw,
  caption,
  className = ''
}: CanvasDemoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Run the drawing function and get cleanup if provided
    const cleanup = onDraw(ctx, canvas);

    return () => {
      if (cleanup) cleanup();
    };
  }, [width, height, onDraw]);

  return (
    <div className={`my-8 bg-[#1a1a24] rounded-xl p-4 ${className}`}>
      <canvas 
        ref={canvasRef}
        className="block mx-auto rounded-lg cursor-crosshair"
        style={{ width, height }}
      />
      {caption && (
        <p className="text-center text-sm text-[#a0a0b0] mt-3">
          {caption}
        </p>
      )}
    </div>
  );
}
