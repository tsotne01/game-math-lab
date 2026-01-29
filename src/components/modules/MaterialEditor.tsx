import { useState, useRef, useMemo, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Html, useTexture, ContactShadows, Center } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

interface MaterialSettings {
  color: string;
  metalness: number;
  roughness: number;
  normalScale: number;
  aoIntensity: number;
  displacementScale: number;
  emissiveIntensity: number;
  emissiveColor: string;
  envMapIntensity: number;
}

interface TextureSlots {
  diffuse: string | null;
  normal: string | null;
  roughness: string | null;
  metalness: string | null;
  ao: string | null;
  displacement: string | null;
  emissive: string | null;
}

type ObjectType = 'sphere' | 'cube' | 'torus' | 'cylinder' | 'suzanne';
type EnvironmentPreset = 'sunset' | 'dawn' | 'night' | 'warehouse' | 'forest' | 'apartment' | 'studio' | 'city' | 'park' | 'lobby';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SETTINGS: MaterialSettings = {
  color: '#ffffff',
  metalness: 0.5,
  roughness: 0.5,
  normalScale: 1.0,
  aoIntensity: 1.0,
  displacementScale: 0.0,
  emissiveIntensity: 0.0,
  emissiveColor: '#000000',
  envMapIntensity: 1.0,
};

const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  'sunset', 'dawn', 'night', 'warehouse', 'forest', 
  'apartment', 'studio', 'city', 'park', 'lobby'
];

const BUILT_IN_TEXTURES = {
  checker: 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <rect width="32" height="32" fill="#fff"/>
      <rect x="32" width="32" height="32" fill="#000"/>
      <rect y="32" width="32" height="32" fill="#000"/>
      <rect x="32" y="32" width="32" height="32" fill="#fff"/>
    </svg>
  `),
  gradient: 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#000"/>
          <stop offset="100%" style="stop-color:#fff"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill="url(#g)"/>
    </svg>
  `),
};

// ============================================================================
// LOADING COMPONENT
// ============================================================================

function LoadingFallback() {
  return (
    <Html center>
      <div className="text-white text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm text-text-secondary">Loading 3D scene...</p>
      </div>
    </Html>
  );
}

// ============================================================================
// PROCEDURAL TEXTURE GENERATION
// ============================================================================

function generateProceduralNormalMap(width = 256, height = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // Create a noise-based normal map
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Generate simple perlin-like noise for normal map
      const noise1 = Math.sin(x * 0.1) * Math.cos(y * 0.1);
      const noise2 = Math.sin(x * 0.2 + 1) * Math.cos(y * 0.15);
      const nx = ((noise1 + 1) / 2) * 255;
      const ny = ((noise2 + 1) / 2) * 255;
      data[i] = nx;      // R = X
      data[i + 1] = ny;  // G = Y
      data[i + 2] = 255; // B = Z (pointing up)
      data[i + 3] = 255; // A
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

function generateBrickNormalMap(width = 256, height = 256): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // Base color (neutral normal)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, width, height);
  
  // Draw brick pattern grooves
  ctx.strokeStyle = '#6060ff';
  ctx.lineWidth = 4;
  
  const brickHeight = 32;
  const brickWidth = 64;
  
  for (let y = 0; y < height; y += brickHeight) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    
    const offset = (Math.floor(y / brickHeight) % 2) * (brickWidth / 2);
    for (let x = offset; x < width; x += brickWidth) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + brickHeight);
      ctx.stroke();
    }
  }
  
  return canvas.toDataURL();
}

// ============================================================================
// 3D MATERIAL PREVIEW OBJECT
// ============================================================================

interface MaterialPreviewObjectProps {
  objectType: ObjectType;
  settings: MaterialSettings;
  textures: TextureSlots;
  showWireframe?: boolean;
}

function MaterialPreviewObject({ objectType, settings, textures, showWireframe = false }: MaterialPreviewObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Load textures if provided
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  
  const loadedTextures = useMemo(() => {
    const loaded: { [key: string]: THREE.Texture | null } = {
      diffuse: null,
      normal: null,
      roughness: null,
      metalness: null,
      ao: null,
    };
    
    Object.entries(textures).forEach(([key, url]) => {
      if (url) {
        try {
          const texture = textureLoader.load(url);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          loaded[key] = texture;
        } catch (e) {
          console.warn(`Failed to load texture: ${key}`);
        }
      }
    });
    
    return loaded;
  }, [textures, textureLoader]);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.2;
    }
  });

  const geometry = useMemo(() => {
    switch (objectType) {
      case 'sphere':
        return <sphereGeometry args={[1, 64, 64]} />;
      case 'cube':
        return <boxGeometry args={[1.5, 1.5, 1.5]} />;
      case 'torus':
        return <torusGeometry args={[0.8, 0.35, 32, 64]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.8, 0.8, 1.8, 32]} />;
      default:
        return <sphereGeometry args={[1, 64, 64]} />;
    }
  }, [objectType]);

  return (
    <mesh ref={meshRef}>
      {geometry}
      <meshStandardMaterial
        color={settings.color}
        metalness={settings.metalness}
        roughness={settings.roughness}
        map={loadedTextures.diffuse}
        normalMap={loadedTextures.normal}
        normalScale={new THREE.Vector2(settings.normalScale, settings.normalScale)}
        roughnessMap={loadedTextures.roughness}
        metalnessMap={loadedTextures.metalness}
        aoMap={loadedTextures.ao}
        aoMapIntensity={settings.aoIntensity}
        emissive={settings.emissiveColor}
        emissiveIntensity={settings.emissiveIntensity}
        envMapIntensity={settings.envMapIntensity}
        wireframe={showWireframe}
      />
    </mesh>
  );
}

// ============================================================================
// SLIDER COMPONENT
// ============================================================================

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01 }: SliderProps) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="text-accent font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-bg-secondary rounded-lg appearance-none cursor-pointer accent-accent"
      />
    </div>
  );
}

// ============================================================================
// TEXTURE SLOT COMPONENT
// ============================================================================

interface TextureSlotProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  icon: React.ReactNode;
}

function TextureSlot({ label, value, onChange, icon }: TextureSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onChange(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-bg-secondary rounded-lg p-2 text-center">
      <div className="flex items-center justify-center gap-1 text-xs text-text-secondary mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div 
        className={`w-full h-12 rounded border-2 border-dashed cursor-pointer transition-all
          ${value ? 'border-accent bg-cover bg-center' : 'border-border hover:border-accent/50'}`}
        style={value ? { backgroundImage: `url(${value})` } : {}}
        onClick={() => inputRef.current?.click()}
      >
        {!value && (
          <div className="h-full flex items-center justify-center">
            <svg className="w-5 h-5 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {value && (
        <button
          onClick={() => onChange(null)}
          className="text-xs text-red-400 hover:text-red-300 mt-1"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN MATERIAL EDITOR COMPONENT
// ============================================================================

export function MaterialEditor() {
  const [settings, setSettings] = useState<MaterialSettings>(DEFAULT_SETTINGS);
  const [textures, setTextures] = useState<TextureSlots>({
    diffuse: null,
    normal: null,
    roughness: null,
    metalness: null,
    ao: null,
    displacement: null,
    emissive: null,
  });
  const [objectType, setObjectType] = useState<ObjectType>('sphere');
  const [environment, setEnvironment] = useState<EnvironmentPreset>('studio');
  const [showWireframe, setShowWireframe] = useState(false);

  const updateSetting = <K extends keyof MaterialSettings>(key: K, value: MaterialSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateTexture = (key: keyof TextureSlots, value: string | null) => {
    setTextures(prev => ({ ...prev, [key]: value }));
  };

  const exportSettings = () => {
    const exportData = {
      settings,
      textures: Object.fromEntries(
        Object.entries(textures).map(([key, value]) => [key, value ? '[Base64 Data]' : null])
      ),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'material-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadPreset = (preset: 'gold' | 'rubber' | 'glass' | 'plastic' | 'chrome') => {
    const presets: Record<string, Partial<MaterialSettings>> = {
      gold: { color: '#ffd700', metalness: 1, roughness: 0.3 },
      rubber: { color: '#333333', metalness: 0, roughness: 0.9 },
      glass: { color: '#ffffff', metalness: 0, roughness: 0.1 },
      plastic: { color: '#ff4444', metalness: 0, roughness: 0.4 },
      chrome: { color: '#cccccc', metalness: 1, roughness: 0.05 },
    };
    setSettings(prev => ({ ...prev, ...presets[preset] }));
  };

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* 3D Preview */}
        <div className="lg:col-span-2 h-[400px] lg:h-[500px] bg-black/50">
          <Canvas camera={{ position: [3, 2, 3], fov: 45 }}>
            <Suspense fallback={<LoadingFallback />}>
              <Environment preset={environment} />
              <ambientLight intensity={0.3} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <Center>
                <MaterialPreviewObject
                  objectType={objectType}
                  settings={settings}
                  textures={textures}
                  showWireframe={showWireframe}
                />
              </Center>
              <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={5} blur={2} />
              <OrbitControls 
                enablePan={false}
                minDistance={2}
                maxDistance={10}
              />
            </Suspense>
          </Canvas>
        </div>

        {/* Controls Panel */}
        <div className="p-4 bg-bg-secondary/50 overflow-y-auto max-h-[500px]">
          {/* Object Type */}
          <div className="mb-4">
            <label className="text-sm text-text-secondary block mb-2">Object Shape</label>
            <div className="grid grid-cols-4 gap-1">
              {(['sphere', 'cube', 'torus', 'cylinder'] as ObjectType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setObjectType(type)}
                  className={`px-2 py-1 rounded text-xs capitalize transition-all
                    ${objectType === type ? 'bg-accent text-black' : 'bg-bg-secondary text-text-secondary hover:bg-bg-secondary/70'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Environment */}
          <div className="mb-4">
            <label className="text-sm text-text-secondary block mb-2">Environment</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as EnvironmentPreset)}
              className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm"
            >
              {ENVIRONMENT_PRESETS.map(preset => (
                <option key={preset} value={preset}>{preset.charAt(0).toUpperCase() + preset.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Material Presets */}
          <div className="mb-4">
            <label className="text-sm text-text-secondary block mb-2">Quick Presets</label>
            <div className="flex flex-wrap gap-1">
              {(['gold', 'chrome', 'plastic', 'rubber', 'glass'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => loadPreset(preset)}
                  className="px-2 py-1 bg-bg-secondary hover:bg-bg-secondary/70 rounded text-xs capitalize"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Base Color */}
          <div className="mb-4">
            <label className="text-sm text-text-secondary block mb-2">Base Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={settings.color}
                onChange={(e) => updateSetting('color', e.target.value)}
                className="w-12 h-8 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={settings.color}
                onChange={(e) => updateSetting('color', e.target.value)}
                className="flex-1 bg-bg-secondary border border-border rounded px-2 text-sm font-mono"
              />
            </div>
          </div>

          {/* PBR Sliders */}
          <Slider
            label="Metalness"
            value={settings.metalness}
            onChange={(v) => updateSetting('metalness', v)}
          />
          <Slider
            label="Roughness"
            value={settings.roughness}
            onChange={(v) => updateSetting('roughness', v)}
          />
          <Slider
            label="Env Map Intensity"
            value={settings.envMapIntensity}
            onChange={(v) => updateSetting('envMapIntensity', v)}
            max={2}
          />
          <Slider
            label="Normal Scale"
            value={settings.normalScale}
            onChange={(v) => updateSetting('normalScale', v)}
            max={2}
          />

          {/* Emissive */}
          <div className="mb-4">
            <label className="text-sm text-text-secondary block mb-2">Emissive</label>
            <div className="flex gap-2 mb-2">
              <input
                type="color"
                value={settings.emissiveColor}
                onChange={(e) => updateSetting('emissiveColor', e.target.value)}
                className="w-12 h-8 rounded cursor-pointer border-0"
              />
              <span className="text-xs text-text-secondary self-center">Color</span>
            </div>
            <Slider
              label="Emissive Intensity"
              value={settings.emissiveIntensity}
              onChange={(v) => updateSetting('emissiveIntensity', v)}
              max={2}
            />
          </div>

          {/* Wireframe Toggle */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showWireframe}
                onChange={(e) => setShowWireframe(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-text-secondary">Show Wireframe</span>
            </label>
          </div>

          {/* Export Button */}
          <button
            onClick={exportSettings}
            className="w-full bg-accent text-black font-semibold py-2 rounded hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Settings
          </button>
        </div>
      </div>

      {/* Texture Slots */}
      <div className="p-4 border-t border-border">
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          Texture Maps
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <TextureSlot
            label="Diffuse"
            value={textures.diffuse}
            onChange={(v) => updateTexture('diffuse', v)}
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}
          />
          <TextureSlot
            label="Normal"
            value={textures.normal}
            onChange={(v) => updateTexture('normal', v)}
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>}
          />
          <TextureSlot
            label="Roughness"
            value={textures.roughness}
            onChange={(v) => updateTexture('roughness', v)}
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18"/></svg>}
          />
          <TextureSlot
            label="Metalness"
            value={textures.metalness}
            onChange={(v) => updateTexture('metalness', v)}
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}
          />
          <TextureSlot
            label="AO"
            value={textures.ao}
            onChange={(v) => updateTexture('ao', v)}
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// UV MAPPING VISUALIZER
// ============================================================================

export function UVMappingVisualizer() {
  const [paintColor, setPaintColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(20);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [view, setView] = useState<'3d' | '2d'>('3d');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    // Initialize with checker pattern
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#666';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillRect(x * 32, y * 32, 32, 32);
        }
      }
    }
  }, []);

  const paint = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = paintColor;
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    if (textureRef.current) {
      textureRef.current.needsUpdate = true;
    }
  }, [paintColor, brushSize]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPainting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 256;
    const y = ((e.clientY - rect.top) / rect.height) * 256;
    paint(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#666';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillRect(x * 32, y * 32, 32, 32);
        }
      }
    }
    if (textureRef.current) {
      textureRef.current.needsUpdate = true;
    }
  };

  function TexturedSphere() {
    const meshRef = useRef<THREE.Mesh>(null);
    
    useEffect(() => {
      if (canvasRef.current) {
        textureRef.current = new THREE.CanvasTexture(canvasRef.current);
        textureRef.current.needsUpdate = true;
      }
    }, []);

    useFrame((state) => {
      if (meshRef.current) {
        meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
      }
      if (textureRef.current) {
        textureRef.current.needsUpdate = true;
      }
    });

    return (
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.5, 64, 64]} />
        <meshStandardMaterial map={textureRef.current} />
      </mesh>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18"/>
            <path d="M9 21V9"/>
          </svg>
          UV Mapping Visualizer
        </h4>
        <div className="flex gap-2">
          <button
            onClick={() => setView('3d')}
            className={`px-3 py-1 rounded text-sm ${view === '3d' ? 'bg-accent text-black' : 'bg-bg-secondary'}`}
          >
            3D View
          </button>
          <button
            onClick={() => setView('2d')}
            className={`px-3 py-1 rounded text-sm ${view === '2d' ? 'bg-accent text-black' : 'bg-bg-secondary'}`}
          >
            2D UV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 3D Preview or larger canvas */}
        <div className={`h-64 bg-black/30 rounded-lg overflow-hidden ${view === '2d' ? 'hidden md:block' : ''}`}>
          <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} />
              <TexturedSphere />
              <OrbitControls enableZoom={false} />
            </Suspense>
          </Canvas>
        </div>

        {/* 2D Canvas for painting */}
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={paintColor}
              onChange={(e) => setPaintColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border-0"
            />
            <div className="flex-1">
              <label className="text-xs text-text-secondary">Brush Size: {brushSize}px</label>
              <input
                type="range"
                min="5"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
            <button
              onClick={clearCanvas}
              className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30"
            >
              Clear
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            className="w-full aspect-square rounded-lg cursor-crosshair border border-border"
            onMouseDown={() => setIsPainting(true)}
            onMouseUp={() => setIsPainting(false)}
            onMouseLeave={() => setIsPainting(false)}
            onMouseMove={handleCanvasMouseMove}
          />
          <p className="text-xs text-text-secondary text-center">
            Paint on the UV map and see it update on the 3D sphere in real-time!
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NORMAL MAP EFFECT DEMO
// ============================================================================

export function NormalMapDemo() {
  const [normalStrength, setNormalStrength] = useState(1.0);
  const [showNormal, setShowNormal] = useState(true);
  const [pattern, setPattern] = useState<'brick' | 'noise'>('brick');
  const [normalMapUrl, setNormalMapUrl] = useState<string>('');

  useEffect(() => {
    setNormalMapUrl(pattern === 'brick' ? generateBrickNormalMap() : generateProceduralNormalMap());
  }, [pattern]);

  function FlatSurfaceWithNormal() {
    const meshRef = useRef<THREE.Mesh>(null);
    const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
    const normalMap = useMemo(() => {
      if (!normalMapUrl) return null;
      const tex = textureLoader.load(normalMapUrl);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
      return tex;
    }, [normalMapUrl, textureLoader]);

    useFrame((state) => {
      if (meshRef.current) {
        meshRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.5) * 0.3;
        meshRef.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.3) * 0.1;
      }
    });

    return (
      <mesh ref={meshRef}>
        <planeGeometry args={[3, 3]} />
        <meshStandardMaterial
          color="#888888"
          normalMap={showNormal ? normalMap : null}
          normalScale={new THREE.Vector2(normalStrength, normalStrength)}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        Normal Map Effect Demo
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64 bg-black/30 rounded-lg overflow-hidden">
          <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <ambientLight intensity={0.3} />
              <directionalLight position={[3, 3, 3]} intensity={1.5} />
              <directionalLight position={[-2, 2, 1]} intensity={0.5} />
              <FlatSurfaceWithNormal />
              <OrbitControls enableZoom={false} />
            </Suspense>
          </Canvas>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary block mb-2">Pattern</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPattern('brick')}
                className={`px-3 py-1 rounded text-sm ${pattern === 'brick' ? 'bg-accent text-black' : 'bg-bg-secondary'}`}
              >
                Brick
              </button>
              <button
                onClick={() => setPattern('noise')}
                className={`px-3 py-1 rounded text-sm ${pattern === 'noise' ? 'bg-accent text-black' : 'bg-bg-secondary'}`}
              >
                Noise
              </button>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={showNormal}
                onChange={(e) => setShowNormal(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-text-secondary">Enable Normal Map</span>
            </label>
          </div>

          <Slider
            label="Normal Strength"
            value={normalStrength}
            onChange={setNormalStrength}
            min={0}
            max={2}
          />

          {normalMapUrl && (
            <div>
              <label className="text-sm text-text-secondary block mb-2">Normal Map Preview</label>
              <img src={normalMapUrl} alt="Normal map" className="w-24 h-24 rounded border border-border" />
            </div>
          )}

          <div className="p-3 bg-bg-secondary rounded-lg text-xs text-text-secondary">
            <p className="mb-1"><strong className="text-white">How it works:</strong></p>
            <p>Normal maps encode surface direction (normals) as RGB colors. The lighting reacts to these fake normals, creating the illusion of depth on a completely flat surface!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PBR MATERIAL SPHERE (CLASSIC MATERIAL BALL)
// ============================================================================

export function PBRMaterialSphere() {
  const [metalness, setMetalness] = useState(0.5);
  const [roughness, setRoughness] = useState(0.5);
  const [color, setColor] = useState('#b08d57');
  const [environment, setEnvironment] = useState<EnvironmentPreset>('studio');

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
          <path d="M2 12h20"/>
        </svg>
        PBR Material Ball
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64 bg-black/30 rounded-lg overflow-hidden">
          <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <Environment preset={environment} />
              <ambientLight intensity={0.3} />
              <mesh>
                <sphereGeometry args={[1, 64, 64]} />
                <meshStandardMaterial
                  color={color}
                  metalness={metalness}
                  roughness={roughness}
                  envMapIntensity={1.5}
                />
              </mesh>
              <OrbitControls enableZoom={false} />
            </Suspense>
          </Canvas>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary block mb-2">Base Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 rounded cursor-pointer border-0"
            />
          </div>

          <Slider
            label="Metalness"
            value={metalness}
            onChange={setMetalness}
          />

          <Slider
            label="Roughness"
            value={roughness}
            onChange={setRoughness}
          />

          <div>
            <label className="text-sm text-text-secondary block mb-2">Environment</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as EnvironmentPreset)}
              className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm"
            >
              {ENVIRONMENT_PRESETS.map(preset => (
                <option key={preset} value={preset}>{preset.charAt(0).toUpperCase() + preset.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-bg-secondary rounded-lg text-xs text-text-secondary">
            <p><strong className="text-[#ffd43b]">Metalness:</strong> 0 = dielectric (plastic, wood), 1 = metal (gold, silver)</p>
            <p><strong className="text-[#51cf66]">Roughness:</strong> 0 = mirror-like, 1 = completely diffuse</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// METALNESS/ROUGHNESS MATRIX
// ============================================================================

export function MetalnessRoughnessMatrix() {
  const [baseColor, setBaseColor] = useState('#b08d57');
  const gridSize = 5;

  function MaterialSphere({ metalness, roughness, position }: { metalness: number; roughness: number; position: [number, number, number] }) {
    return (
      <mesh position={position}>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshStandardMaterial
          color={baseColor}
          metalness={metalness}
          roughness={roughness}
          envMapIntensity={1.2}
        />
      </mesh>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
        Metalness/Roughness Matrix
      </h4>

      <div className="mb-4">
        <label className="text-sm text-text-secondary block mb-2">Base Color</label>
        <input
          type="color"
          value={baseColor}
          onChange={(e) => setBaseColor(e.target.value)}
          className="w-24 h-8 rounded cursor-pointer border-0"
        />
      </div>

      <div className="h-[350px] bg-black/30 rounded-lg overflow-hidden relative">
        <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
          <Suspense fallback={<LoadingFallback />}>
            <Environment preset="studio" />
            <ambientLight intensity={0.3} />
            <group position={[-2, -2, 0]}>
              {Array.from({ length: gridSize }).map((_, mi) =>
                Array.from({ length: gridSize }).map((_, ri) => (
                  <MaterialSphere
                    key={`${mi}-${ri}`}
                    metalness={mi / (gridSize - 1)}
                    roughness={ri / (gridSize - 1)}
                    position={[mi * 1, ri * 1, 0]}
                  />
                ))
              )}
            </group>
            <OrbitControls enableZoom={false} />
          </Suspense>
        </Canvas>

        {/* Axis Labels */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs text-text-secondary bg-black/50 px-2 py-1 rounded">
          <svg className="w-3 h-3 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          Metalness →
        </div>
        <div className="absolute left-2 top-1/2 transform -translate-y-1/2 -rotate-90 text-xs text-text-secondary bg-black/50 px-2 py-1 rounded">
          <svg className="w-3 h-3 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="m5 12 7-7 7 7"/></svg>
          Roughness →
        </div>
      </div>

      <div className="mt-4 p-3 bg-bg-secondary rounded-lg text-xs text-text-secondary">
        <p>This matrix shows how <strong className="text-white">metalness</strong> (horizontal, 0→1) and <strong className="text-white">roughness</strong> (vertical, 0→1) combine. Notice how metals reflect environment colors while dielectrics retain their base color.</p>
      </div>
    </div>
  );
}

// ============================================================================
// MATERIAL COMPARISON (STANDARD VS PBR)
// ============================================================================

export function MaterialComparison() {
  const [metalness, setMetalness] = useState(0.8);
  const [roughness, setRoughness] = useState(0.2);
  const [color, setColor] = useState('#c0c0c0');

  function ComparisonSphere({ usePBR, position }: { usePBR: boolean; position: [number, number, number] }) {
    const meshRef = useRef<THREE.Mesh>(null);
    
    useFrame((state) => {
      if (meshRef.current) {
        meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
      }
    });

    return (
      <group position={position}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[0.8, 64, 64]} />
          {usePBR ? (
            <meshStandardMaterial
              color={color}
              metalness={metalness}
              roughness={roughness}
              envMapIntensity={1.5}
            />
          ) : (
            <meshPhongMaterial
              color={color}
              shininess={100 * (1 - roughness)}
              specular="#ffffff"
            />
          )}
        </mesh>
        <Html position={[0, -1.2, 0]} center>
          <div className="text-xs text-center px-2 py-1 bg-black/80 rounded whitespace-nowrap">
            {usePBR ? 'PBR (Standard)' : 'Phong (Legacy)'}
          </div>
        </Html>
      </group>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="8" height="18" rx="1"/>
          <rect x="13" y="3" width="8" height="18" rx="1"/>
        </svg>
        Standard vs PBR Comparison
      </h4>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 bg-black/30 rounded-lg overflow-hidden">
          <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <Environment preset="studio" />
              <ambientLight intensity={0.4} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <ComparisonSphere usePBR={false} position={[-1.2, 0, 0]} />
              <ComparisonSphere usePBR={true} position={[1.2, 0, 0]} />
              <OrbitControls enableZoom={false} />
            </Suspense>
          </Canvas>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary block mb-2">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-8 rounded cursor-pointer border-0"
            />
          </div>

          <Slider
            label="Metalness (PBR only)"
            value={metalness}
            onChange={setMetalness}
          />

          <Slider
            label="Roughness"
            value={roughness}
            onChange={setRoughness}
          />

          <div className="p-3 bg-bg-secondary rounded-lg text-xs text-text-secondary">
            <p className="mb-2"><strong className="text-[#ff6b6b]">Phong (left):</strong> Simple specular highlight, no environment reflection</p>
            <p><strong className="text-[#51cf66]">PBR (right):</strong> Physically accurate with environment reflections and energy conservation</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EXPORT ALL COMPONENTS
// ============================================================================

export default MaterialEditor;
