import { useState, useRef, useMemo, useCallback, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useHelper } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

interface LightConfig {
  id: string;
  type: 'ambient' | 'directional' | 'point' | 'spot';
  color: string;
  intensity: number;
  position: [number, number, number];
  target?: [number, number, number];
  angle?: number;
  penumbra?: number;
  castShadow: boolean;
  enabled: boolean;
}

interface MaterialConfig {
  color: string;
  shininess: number;
  roughness: number;
  metalness: number;
}

type ViewMode = 'combined' | 'ambient' | 'diffuse' | 'specular';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
// 3D SCENE COMPONENTS
// ============================================================================

interface SceneObjectProps {
  type: 'sphere' | 'cube' | 'torus';
  position: [number, number, number];
  material: MaterialConfig;
  viewMode: ViewMode;
  receiveShadow: boolean;
  castShadow: boolean;
}

function SceneObject({ type, position, material, viewMode, receiveShadow, castShadow }: SceneObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  const geometry = useMemo(() => {
    switch (type) {
      case 'sphere':
        return <sphereGeometry args={[1, 64, 64]} />;
      case 'cube':
        return <boxGeometry args={[1.5, 1.5, 1.5]} />;
      case 'torus':
        return <torusKnotGeometry args={[0.8, 0.3, 128, 32]} />;
      default:
        return <sphereGeometry args={[1, 64, 64]} />;
    }
  }, [type]);

  // Create different materials based on view mode
  const materialElement = useMemo(() => {
    if (viewMode === 'ambient') {
      return (
        <meshBasicMaterial 
          color={material.color} 
          opacity={0.3}
          transparent
        />
      );
    } else if (viewMode === 'diffuse') {
      return (
        <meshLambertMaterial 
          color={material.color}
        />
      );
    } else if (viewMode === 'specular') {
      return (
        <meshPhongMaterial 
          color="#000000"
          specular={material.color}
          shininess={material.shininess}
          emissive="#000000"
        />
      );
    }
    return (
      <meshStandardMaterial 
        color={material.color}
        roughness={material.roughness}
        metalness={material.metalness}
      />
    );
  }, [material, viewMode]);

  return (
    <mesh 
      ref={meshRef} 
      position={position} 
      castShadow={castShadow} 
      receiveShadow={receiveShadow}
    >
      {geometry}
      {materialElement}
    </mesh>
  );
}

interface GroundPlaneProps {
  receiveShadow: boolean;
}

function GroundPlane({ receiveShadow }: GroundPlaneProps) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow={receiveShadow}>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#2a2a3a" roughness={0.8} metalness={0.1} />
    </mesh>
  );
}

interface SceneLightProps {
  config: LightConfig;
  showHelpers: boolean;
}

function SceneLight({ config, showHelpers }: SceneLightProps) {
  const lightRef = useRef<THREE.Light>(null);
  const directionalRef = useRef<THREE.DirectionalLight>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const pointRef = useRef<THREE.PointLight>(null);

  // Helper visualization
  useHelper(showHelpers && directionalRef.current ? directionalRef : { current: null }, THREE.DirectionalLightHelper, 1, config.color);
  useHelper(showHelpers && spotRef.current ? spotRef : { current: null }, THREE.SpotLightHelper, config.color);
  useHelper(showHelpers && pointRef.current ? pointRef : { current: null }, THREE.PointLightHelper, 0.5, config.color);

  if (!config.enabled) return null;

  const color = new THREE.Color(config.color);

  switch (config.type) {
    case 'ambient':
      return <ambientLight color={color} intensity={config.intensity} />;
    
    case 'directional':
      return (
        <directionalLight
          ref={directionalRef}
          color={color}
          intensity={config.intensity}
          position={config.position}
          castShadow={config.castShadow}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
      );
    
    case 'point':
      return (
        <pointLight
          ref={pointRef}
          color={color}
          intensity={config.intensity}
          position={config.position}
          distance={20}
          decay={2}
          castShadow={config.castShadow}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      );
    
    case 'spot':
      return (
        <spotLight
          ref={spotRef}
          color={color}
          intensity={config.intensity}
          position={config.position}
          angle={config.angle || Math.PI / 6}
          penumbra={config.penumbra || 0.5}
          distance={30}
          decay={2}
          castShadow={config.castShadow}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      );
    
    default:
      return null;
  }
}

interface MainSceneProps {
  lights: LightConfig[];
  material: MaterialConfig;
  viewMode: ViewMode;
  shadowsEnabled: boolean;
  showLightHelpers: boolean;
  selectedObject: 'sphere' | 'cube' | 'torus';
}

function MainScene({ lights, material, viewMode, shadowsEnabled, showLightHelpers, selectedObject }: MainSceneProps) {
  return (
    <>
      <color attach="background" args={['#0a0a0f']} />
      
      {/* Lights */}
      {lights.map((light) => (
        <SceneLight key={light.id} config={light} showHelpers={showLightHelpers} />
      ))}
      
      {/* Objects */}
      <SceneObject
        type={selectedObject}
        position={[0, 0, 0]}
        material={material}
        viewMode={viewMode}
        castShadow={shadowsEnabled}
        receiveShadow={shadowsEnabled}
      />
      
      {/* Ground */}
      <GroundPlane receiveShadow={shadowsEnabled} />
      
      {/* Camera controls */}
      <OrbitControls 
        makeDefault
        minDistance={3}
        maxDistance={20}
        enablePan={true}
        enableZoom={true}
      />
    </>
  );
}

// ============================================================================
// FORMULA DISPLAY COMPONENT
// ============================================================================

interface FormulaDisplayProps {
  lights: LightConfig[];
  material: MaterialConfig;
  viewMode: ViewMode;
}

function FormulaDisplay({ lights, material, viewMode }: FormulaDisplayProps) {
  const enabledLights = lights.filter(l => l.enabled);
  const ambientLights = enabledLights.filter(l => l.type === 'ambient');
  const directionalLights = enabledLights.filter(l => l.type === 'directional' || l.type === 'point' || l.type === 'spot');

  const totalAmbient = ambientLights.reduce((sum, l) => sum + l.intensity, 0);
  
  return (
    <div className="bg-[#1e1e2e] rounded-lg p-4 border border-[#2a2a3a] font-mono text-sm">
      <div className="text-[#6a9955] mb-2">// Phong Lighting Model</div>
      
      <div className="text-white mb-3">
        <span className="text-[#c586c0]">I</span>
        <span className="text-[#9cdcfe]">_total</span>
        <span className="text-white"> = </span>
        {viewMode === 'ambient' || viewMode === 'combined' ? (
          <span className="text-[#4ec9b0]">I_ambient</span>
        ) : null}
        {(viewMode === 'diffuse' || viewMode === 'combined') && (viewMode === 'ambient' || viewMode === 'combined') ? (
          <span className="text-white"> + </span>
        ) : null}
        {viewMode === 'diffuse' || viewMode === 'combined' ? (
          <span className="text-[#dcdcaa]">I_diffuse</span>
        ) : null}
        {(viewMode === 'specular' || viewMode === 'combined') && (viewMode === 'diffuse' || viewMode === 'combined' || viewMode === 'ambient') ? (
          <span className="text-white"> + </span>
        ) : null}
        {viewMode === 'specular' || viewMode === 'combined' ? (
          <span className="text-[#ce9178]">I_specular</span>
        ) : null}
      </div>
      
      <div className="space-y-2 text-xs">
        {(viewMode === 'ambient' || viewMode === 'combined') && (
          <div className="text-[#4ec9b0]">
            I_ambient = k_a × L_a = {totalAmbient.toFixed(2)}
          </div>
        )}
        
        {(viewMode === 'diffuse' || viewMode === 'combined') && directionalLights.length > 0 && (
          <div className="text-[#dcdcaa]">
            I_diffuse = k_d × (N · L) × L_d
            <br />
            <span className="text-[#6a9955]">// {directionalLights.length} light source{directionalLights.length > 1 ? 's' : ''}</span>
          </div>
        )}
        
        {(viewMode === 'specular' || viewMode === 'combined') && directionalLights.length > 0 && (
          <div className="text-[#ce9178]">
            I_specular = k_s × (R · V)^n × L_s
            <br />
            <span className="text-[#6a9955]">// shininess n = {material.shininess}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CONTROL PANEL COMPONENTS
// ============================================================================

interface LightControlProps {
  light: LightConfig;
  onUpdate: (id: string, updates: Partial<LightConfig>) => void;
  onRemove: (id: string) => void;
}

function LightControl({ light, onUpdate, onRemove }: LightControlProps) {
  const typeColors = {
    ambient: 'bg-[#4ec9b0]',
    directional: 'bg-[#dcdcaa]',
    point: 'bg-[#ce9178]',
    spot: 'bg-[#c586c0]'
  };

  return (
    <div className={`bg-[#1e1e2e] rounded-lg p-3 border border-[#2a2a3a] ${!light.enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${typeColors[light.type]}`} />
          <span className="text-white font-medium capitalize text-sm">{light.type}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate(light.id, { enabled: !light.enabled })}
            className={`p-1 rounded transition-colors ${light.enabled ? 'text-[#00b894]' : 'text-[#6a6a7a]'}`}
            title={light.enabled ? 'Disable' : 'Enable'}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {light.enabled ? (
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
              ) : (
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24 M1 1l22 22" />
              )}
            </svg>
          </button>
          <button
            onClick={() => onRemove(light.id)}
            className="p-1 text-[#e17055] hover:text-[#ff6b6b] transition-colors"
            title="Remove light"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Color picker */}
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-text-secondary w-16">Color</label>
        <input
          type="color"
          value={light.color}
          onChange={(e) => onUpdate(light.id, { color: e.target.value })}
          className="w-8 h-6 rounded cursor-pointer bg-transparent border-0"
        />
        <span className="text-xs font-mono text-[#6a6a7a]">{light.color}</span>
      </div>
      
      {/* Intensity slider */}
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-text-secondary w-16">Intensity</label>
        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value={light.intensity}
          onChange={(e) => onUpdate(light.id, { intensity: parseFloat(e.target.value) })}
          className="flex-1 h-1 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
        />
        <span className="text-xs font-mono text-[#6a6a7a] w-8">{light.intensity.toFixed(1)}</span>
      </div>
      
      {/* Position controls for non-ambient lights */}
      {light.type !== 'ambient' && (
        <div className="space-y-1">
          {['x', 'y', 'z'].map((axis, i) => (
            <div key={axis} className="flex items-center gap-2">
              <label className="text-xs text-text-secondary w-16 uppercase">{axis}</label>
              <input
                type="range"
                min="-10"
                max="10"
                step="0.5"
                value={light.position[i]}
                onChange={(e) => {
                  const newPos = [...light.position] as [number, number, number];
                  newPos[i] = parseFloat(e.target.value);
                  onUpdate(light.id, { position: newPos });
                }}
                className="flex-1 h-1 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <span className="text-xs font-mono text-[#6a6a7a] w-8">{light.position[i].toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Spotlight-specific controls */}
      {light.type === 'spot' && (
        <div className="mt-2 pt-2 border-t border-[#2a2a3a] space-y-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary w-16">Angle</label>
            <input
              type="range"
              min="0.1"
              max="1.5"
              step="0.05"
              value={light.angle || Math.PI / 6}
              onChange={(e) => onUpdate(light.id, { angle: parseFloat(e.target.value) })}
              className="flex-1 h-1 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <span className="text-xs font-mono text-[#6a6a7a] w-8">{((light.angle || Math.PI / 6) * 180 / Math.PI).toFixed(0)}°</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary w-16">Penumbra</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={light.penumbra || 0.5}
              onChange={(e) => onUpdate(light.id, { penumbra: parseFloat(e.target.value) })}
              className="flex-1 h-1 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <span className="text-xs font-mono text-[#6a6a7a] w-8">{(light.penumbra || 0.5).toFixed(2)}</span>
          </div>
        </div>
      )}
      
      {/* Shadow toggle for non-ambient lights */}
      {light.type !== 'ambient' && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#2a2a3a]">
          <input
            type="checkbox"
            id={`shadow-${light.id}`}
            checked={light.castShadow}
            onChange={(e) => onUpdate(light.id, { castShadow: e.target.checked })}
            className="rounded bg-[#2a2a3a] border-[#4a4a5a] text-accent focus:ring-accent"
          />
          <label htmlFor={`shadow-${light.id}`} className="text-xs text-text-secondary">Cast Shadows</label>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PHONG COMPONENTS VISUALIZER
// ============================================================================

function PhongVisualizer() {
  const [shininess, setShininess] = useState(32);
  const [lightAngle, setLightAngle] = useState(45);
  const [viewAngle, setViewAngle] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 80;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Draw sphere with Phong shading
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const dist = Math.sqrt(x * x + y * y);
        if (dist > radius) continue;

        // Surface normal
        const z = Math.sqrt(radius * radius - x * x - y * y);
        const nx = x / radius;
        const ny = -y / radius;
        const nz = z / radius;

        // Light direction
        const lightRad = (lightAngle * Math.PI) / 180;
        const lx = Math.sin(lightRad);
        const ly = 0;
        const lz = Math.cos(lightRad);

        // View direction
        const viewRad = (viewAngle * Math.PI) / 180;
        const vx = Math.sin(viewRad);
        const vy = 0;
        const vz = Math.cos(viewRad);

        // Ambient
        const ambient = 0.1;

        // Diffuse (Lambert)
        const NdotL = Math.max(0, nx * lx + ny * ly + nz * lz);
        const diffuse = NdotL * 0.6;

        // Specular (Phong)
        const rx = 2 * NdotL * nx - lx;
        const ry = 2 * NdotL * ny - ly;
        const rz = 2 * NdotL * nz - lz;
        const RdotV = Math.max(0, rx * vx + ry * vy + rz * vz);
        const specular = Math.pow(RdotV, shininess) * 0.5;

        const intensity = clamp(ambient + diffuse + specular, 0, 1);
        const color = Math.floor(intensity * 255);
        
        ctx.fillStyle = `rgb(${Math.floor(color * 0.4)}, ${Math.floor(color * 0.7)}, ${color})`;
        ctx.fillRect(centerX + x, centerY + y, 1, 1);
      }
    }

    // Draw vectors
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    // Normal vector (green)
    ctx.strokeStyle = '#51cf66';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX, centerY - 50);
    ctx.stroke();
    ctx.fillStyle = '#51cf66';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 55);
    ctx.lineTo(centerX - 5, centerY - 45);
    ctx.lineTo(centerX + 5, centerY - 45);
    ctx.fill();

    // Light direction (yellow)
    const lightRad = (lightAngle * Math.PI) / 180;
    ctx.strokeStyle = '#ffd43b';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.sin(lightRad) * 50, centerY - Math.cos(lightRad) * 50);
    ctx.stroke();

    // View direction (cyan)
    const viewRad = (viewAngle * Math.PI) / 180;
    ctx.strokeStyle = '#339af0';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.sin(viewRad) * 50, centerY - Math.cos(viewRad) * 50);
    ctx.stroke();

  }, [shininess, lightAngle, viewAngle]);

  return (
    <div className="bg-[#1e1e2e] rounded-xl border border-[#2a2a3a] p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-shrink-0">
          <canvas
            ref={canvasRef}
            width={200}
            height={200}
            className="rounded-lg border border-[#2a2a3a]"
          />
        </div>
        
        <div className="flex-1 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-text-secondary">Light Angle</label>
              <span className="text-xs font-mono text-[#ffd43b]">{lightAngle}°</span>
            </div>
            <input
              type="range"
              min="-90"
              max="90"
              value={lightAngle}
              onChange={(e) => setLightAngle(parseInt(e.target.value))}
              className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-[#ffd43b]"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-text-secondary">View Angle</label>
              <span className="text-xs font-mono text-[#339af0]">{viewAngle}°</span>
            </div>
            <input
              type="range"
              min="-60"
              max="60"
              value={viewAngle}
              onChange={(e) => setViewAngle(parseInt(e.target.value))}
              className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-[#339af0]"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-text-secondary">Shininess (n)</label>
              <span className="text-xs font-mono text-accent">{shininess}</span>
            </div>
            <input
              type="range"
              min="1"
              max="128"
              value={shininess}
              onChange={(e) => setShininess(parseInt(e.target.value))}
              className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>
          
          <div className="flex flex-wrap gap-3 pt-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-[#51cf66]" />
              <span className="text-text-secondary">Normal (N)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-[#ffd43b]" />
              <span className="text-text-secondary">Light (L)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-[#339af0]" />
              <span className="text-text-secondary">View (V)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// N·L DOT PRODUCT VISUALIZER
// ============================================================================

function DotProductVisualizer() {
  const [surfaceAngle, setSurfaceAngle] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dotProduct = useMemo(() => {
    const lightDir = { x: 0, y: -1 }; // Light from above
    const normalRad = (surfaceAngle * Math.PI) / 180;
    const normal = { x: Math.sin(normalRad), y: -Math.cos(normalRad) };
    return Math.max(0, -(lightDir.x * normal.x + lightDir.y * normal.y));
  }, [surfaceAngle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2 + 20;
    const surfaceLength = 100;
    const normalRad = (surfaceAngle * Math.PI) / 180;

    // Draw surface
    ctx.strokeStyle = '#4a4a5a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const surfaceEndX1 = centerX - Math.cos(normalRad) * surfaceLength;
    const surfaceEndY1 = centerY - Math.sin(normalRad) * surfaceLength;
    const surfaceEndX2 = centerX + Math.cos(normalRad) * surfaceLength;
    const surfaceEndY2 = centerY + Math.sin(normalRad) * surfaceLength;
    ctx.moveTo(surfaceEndX1, surfaceEndY1);
    ctx.lineTo(surfaceEndX2, surfaceEndY2);
    ctx.stroke();

    // Draw normal
    const normalLength = 60;
    ctx.strokeStyle = '#51cf66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    const normalEndX = centerX + Math.sin(normalRad) * normalLength;
    const normalEndY = centerY - Math.cos(normalRad) * normalLength;
    ctx.lineTo(normalEndX, normalEndY);
    ctx.stroke();

    // Normal arrow
    ctx.fillStyle = '#51cf66';
    ctx.beginPath();
    const arrowSize = 8;
    const arrowAngle = -normalRad + Math.PI / 2;
    ctx.moveTo(normalEndX, normalEndY);
    ctx.lineTo(
      normalEndX - arrowSize * Math.cos(arrowAngle - 0.5),
      normalEndY - arrowSize * Math.sin(arrowAngle - 0.5)
    );
    ctx.lineTo(
      normalEndX - arrowSize * Math.cos(arrowAngle + 0.5),
      normalEndY - arrowSize * Math.sin(arrowAngle + 0.5)
    );
    ctx.fill();

    // Draw light rays
    ctx.strokeStyle = `rgba(255, 212, 59, ${0.3 + dotProduct * 0.7})`;
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(centerX + i * 20, 20);
      ctx.lineTo(centerX + i * 20, centerY - 10);
      ctx.stroke();
    }

    // Light direction label
    ctx.fillStyle = '#ffd43b';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Light (L)', centerX, 15);

    // Normal label
    ctx.fillStyle = '#51cf66';
    ctx.fillText('N', normalEndX + 15, normalEndY);

    // Draw intensity indicator
    const barWidth = 150;
    const barHeight = 15;
    const barX = (width - barWidth) / 2;
    const barY = height - 35;

    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    gradient.addColorStop(0, '#1a1a2a');
    gradient.addColorStop(1, '#ffd43b');
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, barWidth * dotProduct, barHeight);

    ctx.strokeStyle = '#4a4a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`N·L = ${dotProduct.toFixed(2)}`, centerX, height - 5);

  }, [surfaceAngle, dotProduct]);

  return (
    <div className="bg-[#1e1e2e] rounded-xl border border-[#2a2a3a] p-4">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6 M9 9l6 6" />
        </svg>
        Diffuse: N·L Dot Product
      </h3>
      
      <div className="flex flex-col items-center gap-4">
        <canvas
          ref={canvasRef}
          width={300}
          height={200}
          className="rounded-lg border border-[#2a2a3a]"
        />
        
        <div className="w-full max-w-xs">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-text-secondary">Surface Rotation</label>
            <span className="text-xs font-mono text-accent">{surfaceAngle}°</span>
          </div>
          <input
            type="range"
            min="-80"
            max="80"
            value={surfaceAngle}
            onChange={(e) => setSurfaceAngle(parseInt(e.target.value))}
            className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
          />
        </div>
        
        <p className="text-xs text-text-secondary text-center">
          Rotate the surface to see how the angle between Normal and Light affects brightness.
          <br />
          Maximum intensity when N and L are aligned (N·L = 1).
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// SPECULAR HIGHLIGHT DEMO
// ============================================================================

function SpecularDemo() {
  const [shininess, setShininess] = useState(32);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = 60;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Draw specular falloff curve
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    for (let x = 0; x < width; x++) {
      const RdotV = x / width; // 0 to 1
      const specular = Math.pow(RdotV, shininess);
      const y = height - (specular * (height - 10));
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(width, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(108, 92, 231, 0.1)');
    gradient.addColorStop(1, 'rgba(108, 92, 231, 0.8)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x < width; x++) {
      const RdotV = x / width;
      const specular = Math.pow(RdotV, shininess);
      const y = height - (specular * (height - 10));
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#6a6a7a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0', 5, height - 5);
    ctx.textAlign = 'right';
    ctx.fillText('1', width - 5, height - 5);
    ctx.textAlign = 'center';
    ctx.fillText('R·V', width / 2, height - 5);

  }, [shininess]);

  return (
    <div className="bg-[#1e1e2e] rounded-xl border border-[#2a2a3a] p-4">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-[#6c5ce7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
        </svg>
        Specular: (R·V)^n Falloff
      </h3>
      
      <canvas
        ref={canvasRef}
        width={300}
        height={60}
        className="rounded-lg border border-[#2a2a3a] w-full mb-3"
      />
      
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-text-secondary">Shininess (n)</label>
          <span className="text-xs font-mono text-[#6c5ce7]">{shininess}</span>
        </div>
        <input
          type="range"
          min="1"
          max="256"
          value={shininess}
          onChange={(e) => setShininess(parseInt(e.target.value))}
          className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-[#6c5ce7]"
        />
      </div>
      
      <p className="text-xs text-text-secondary mt-2">
        Higher shininess = tighter, more focused highlight. Low values = broad, matte reflection.
      </p>
    </div>
  );
}

// ============================================================================
// SHADOW MAPPING VISUALIZER
// ============================================================================

function ShadowMappingViz() {
  const [lightPos, setLightPos] = useState(50);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    // Light source position
    const lightX = lightPos * 2;
    const lightY = 30;

    // Draw light
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath();
    ctx.arc(lightX, lightY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Draw rays from light
    ctx.strokeStyle = 'rgba(255, 212, 59, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(lightX, lightY);
      const angle = (i / 20) * Math.PI - Math.PI / 2;
      ctx.lineTo(lightX + Math.cos(angle) * 200, lightY + Math.sin(angle) * 200);
      ctx.stroke();
    }

    // Occluder (blocking object)
    const occluderX = 100;
    const occluderY = 80;
    const occluderSize = 30;

    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(occluderX - occluderSize / 2, occluderY - occluderSize / 2, occluderSize, occluderSize);

    // Calculate shadow
    const groundY = 150;
    const shadowStartX = occluderX - occluderSize / 2;
    const shadowEndX = occluderX + occluderSize / 2;

    // Project shadow onto ground
    const shadowLeft = lightX + (shadowStartX - lightX) * (groundY - lightY) / (occluderY - occluderSize / 2 - lightY);
    const shadowRight = lightX + (shadowEndX - lightX) * (groundY - lightY) / (occluderY - occluderSize / 2 - lightY);

    // Draw shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.moveTo(shadowLeft, groundY);
    ctx.lineTo(shadowRight, groundY);
    ctx.lineTo(shadowRight, groundY + 20);
    ctx.lineTo(shadowLeft, groundY + 20);
    ctx.fill();

    // Draw ground
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, groundY, width, height - groundY);

    // Draw shadow rays
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(lightX, lightY);
    ctx.lineTo(shadowLeft, groundY);
    ctx.moveTo(lightX, lightY);
    ctx.lineTo(shadowRight, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = '#ffd43b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Light', lightX, lightY - 15);

    ctx.fillStyle = '#4a4a5a';
    ctx.fillText('Occluder', occluderX, occluderY + occluderSize / 2 + 15);

    ctx.fillStyle = '#6a6a7a';
    ctx.fillText('Shadow', (shadowLeft + shadowRight) / 2, groundY + 35);

  }, [lightPos]);

  return (
    <div className="bg-[#1e1e2e] rounded-xl border border-[#2a2a3a] p-4">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-[#ffd43b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        Shadow Mapping Concept
      </h3>
      
      <canvas
        ref={canvasRef}
        width={200}
        height={180}
        className="rounded-lg border border-[#2a2a3a] w-full mb-3"
      />
      
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-text-secondary">Light Position</label>
        </div>
        <input
          type="range"
          min="20"
          max="80"
          value={lightPos}
          onChange={(e) => setLightPos(parseInt(e.target.value))}
          className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-[#ffd43b]"
        />
      </div>
      
      <p className="text-xs text-text-secondary mt-2">
        Shadow maps store depth from light's POV. If a pixel is further than the stored depth, it's in shadow.
      </p>
    </div>
  );
}

// ============================================================================
// MAIN LIGHTING PLAYGROUND COMPONENT
// ============================================================================

const DEFAULT_LIGHTS: LightConfig[] = [
  {
    id: 'ambient-1',
    type: 'ambient',
    color: '#404060',
    intensity: 0.3,
    position: [0, 0, 0],
    castShadow: false,
    enabled: true
  },
  {
    id: 'directional-1',
    type: 'directional',
    color: '#ffffff',
    intensity: 1.0,
    position: [5, 8, 5],
    castShadow: true,
    enabled: true
  }
];

const DEFAULT_MATERIAL: MaterialConfig = {
  color: '#6c5ce7',
  shininess: 32,
  roughness: 0.4,
  metalness: 0.1
};

export default function LightingPlayground() {
  const [lights, setLights] = useState<LightConfig[]>(DEFAULT_LIGHTS);
  const [material, setMaterial] = useState<MaterialConfig>(DEFAULT_MATERIAL);
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [shadowsEnabled, setShadowsEnabled] = useState(true);
  const [showLightHelpers, setShowLightHelpers] = useState(true);
  const [selectedObject, setSelectedObject] = useState<'sphere' | 'cube' | 'torus'>('sphere');

  const addLight = useCallback((type: LightConfig['type']) => {
    const newLight: LightConfig = {
      id: generateId(),
      type,
      color: type === 'ambient' ? '#404060' : '#ffffff',
      intensity: type === 'ambient' ? 0.3 : 1.0,
      position: type === 'ambient' ? [0, 0, 0] : [
        (Math.random() - 0.5) * 10,
        Math.random() * 5 + 3,
        (Math.random() - 0.5) * 10
      ],
      angle: type === 'spot' ? Math.PI / 6 : undefined,
      penumbra: type === 'spot' ? 0.5 : undefined,
      castShadow: type !== 'ambient',
      enabled: true
    };
    setLights(prev => [...prev, newLight]);
  }, []);

  const updateLight = useCallback((id: string, updates: Partial<LightConfig>) => {
    setLights(prev => prev.map(light => 
      light.id === id ? { ...light, ...updates } : light
    ));
  }, []);

  const removeLight = useCallback((id: string) => {
    setLights(prev => prev.filter(light => light.id !== id));
  }, []);

  const resetScene = useCallback(() => {
    setLights(DEFAULT_LIGHTS);
    setMaterial(DEFAULT_MATERIAL);
    setViewMode('combined');
    setShadowsEnabled(true);
    setShowLightHelpers(true);
    setSelectedObject('sphere');
  }, []);

  return (
    <div className="space-y-6">
      {/* Main 3D Viewport */}
      <div className="bg-[#1e1e2e] rounded-xl border border-[#2a2a3a] overflow-hidden">
        <div className="h-[400px] md:h-[500px]">
          <Canvas
            shadows={shadowsEnabled}
            camera={{ position: [5, 5, 8], fov: 50 }}
            gl={{ antialias: true }}
          >
            <Suspense fallback={<LoadingFallback />}>
              <MainScene
                lights={lights}
                material={material}
                viewMode={viewMode}
                shadowsEnabled={shadowsEnabled}
                showLightHelpers={showLightHelpers}
                selectedObject={selectedObject}
              />
            </Suspense>
          </Canvas>
        </div>
        
        {/* View mode selector */}
        <div className="p-3 border-t border-[#2a2a3a] flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {(['combined', 'ambient', 'diffuse', 'specular'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-accent text-black'
                    : 'bg-[#2a2a3a] text-text-secondary hover:text-white'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shadowsEnabled}
                onChange={(e) => setShadowsEnabled(e.target.checked)}
                className="rounded bg-[#2a2a3a] border-[#4a4a5a] text-accent focus:ring-accent"
              />
              Shadows
            </label>
            <label className="text-sm text-text-secondary flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLightHelpers}
                onChange={(e) => setShowLightHelpers(e.target.checked)}
                className="rounded bg-[#2a2a3a] border-[#4a4a5a] text-accent focus:ring-accent"
              />
              Helpers
            </label>
          </div>
        </div>
      </div>

      {/* Control Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Light Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              Light Sources ({lights.length})
            </h3>
            <button
              onClick={resetScene}
              className="text-xs text-[#e17055] hover:text-[#ff6b6b] transition-colors"
            >
              Reset Scene
            </button>
          </div>
          
          {/* Add light buttons */}
          <div className="flex flex-wrap gap-2">
            {(['ambient', 'directional', 'point', 'spot'] as const).map((type) => (
              <button
                key={type}
                onClick={() => addLight(type)}
                className="px-3 py-1.5 bg-[#2a2a3a] hover:bg-[#3a3a4a] text-sm rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          
          {/* Light list */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {lights.map((light) => (
              <LightControl
                key={light.id}
                light={light}
                onUpdate={updateLight}
                onRemove={removeLight}
              />
            ))}
            {lights.length === 0 && (
              <p className="text-center text-text-secondary py-4">
                No lights in scene. Add one above!
              </p>
            )}
          </div>
        </div>

        {/* Material & Object Controls */}
        <div className="space-y-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <path d="M17 10c.7 0 1.4.1 2 .4v8.4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h3" />
            </svg>
            Material Properties
          </h3>
          
          <div className="bg-[#1e1e2e] rounded-lg p-4 border border-[#2a2a3a] space-y-3">
            {/* Object selector */}
            <div>
              <label className="text-sm text-text-secondary block mb-2">Object</label>
              <div className="flex gap-2">
                {(['sphere', 'cube', 'torus'] as const).map((obj) => (
                  <button
                    key={obj}
                    onClick={() => setSelectedObject(obj)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedObject === obj
                        ? 'bg-accent text-black'
                        : 'bg-[#2a2a3a] text-text-secondary hover:text-white'
                    }`}
                  >
                    {obj.charAt(0).toUpperCase() + obj.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Color picker */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-text-secondary w-20">Color</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => setMaterial(prev => ({ ...prev, color: e.target.value }))}
                className="w-10 h-8 rounded cursor-pointer bg-transparent border-0"
              />
              <span className="text-xs font-mono text-[#6a6a7a]">{material.color}</span>
            </div>
            
            {/* Shininess */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-text-secondary">Shininess</label>
                <span className="text-xs font-mono text-accent">{material.shininess}</span>
              </div>
              <input
                type="range"
                min="1"
                max="256"
                value={material.shininess}
                onChange={(e) => setMaterial(prev => ({ ...prev, shininess: parseInt(e.target.value) }))}
                className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
              />
            </div>
            
            {/* Roughness */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-text-secondary">Roughness</label>
                <span className="text-xs font-mono text-accent">{material.roughness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.roughness}
                onChange={(e) => setMaterial(prev => ({ ...prev, roughness: parseFloat(e.target.value) }))}
                className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
              />
            </div>
            
            {/* Metalness */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-text-secondary">Metalness</label>
                <span className="text-xs font-mono text-accent">{material.metalness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={material.metalness}
                onChange={(e) => setMaterial(prev => ({ ...prev, metalness: parseFloat(e.target.value) }))}
                className="w-full h-2 bg-[#2a2a3a] rounded-lg appearance-none cursor-pointer accent-accent"
              />
            </div>
          </div>
          
          {/* Formula Display */}
          <FormulaDisplay lights={lights} material={material} viewMode={viewMode} />
        </div>
      </div>

      {/* Interactive Demos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PhongVisualizer />
        <DotProductVisualizer />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SpecularDemo />
        <ShadowMappingViz />
      </div>
    </div>
  );
}

// Export sub-components for individual use
export { PhongVisualizer, DotProductVisualizer, SpecularDemo, ShadowMappingViz };
