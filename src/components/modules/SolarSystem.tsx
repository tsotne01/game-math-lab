import { useState, useRef, useMemo, useCallback, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Stars, Html, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

interface PlanetData {
  name: string;
  radius: number;
  distance: number;
  orbitalPeriod: number;
  color: string;
  realRadius: number;
  description: string;
}

interface Vector3D {
  x: number;
  y: number;
  z: number;
}

// ============================================================================
// PLANET DATA
// ============================================================================

const PLANETS: PlanetData[] = [
  { name: 'Mercury', radius: 0.15, distance: 3, orbitalPeriod: 0.24, color: '#b0b0b0', realRadius: 0.038, description: 'Smallest planet, closest to Sun' },
  { name: 'Venus', radius: 0.25, distance: 4.5, orbitalPeriod: 0.62, color: '#e6c97a', realRadius: 0.095, description: 'Hottest planet, thick atmosphere' },
  { name: 'Earth', radius: 0.25, distance: 6, orbitalPeriod: 1.0, color: '#6b93d6', realRadius: 0.1, description: 'Our home planet' },
  { name: 'Mars', radius: 0.2, distance: 7.5, orbitalPeriod: 1.88, color: '#c1440e', realRadius: 0.053, description: 'The Red Planet' },
  { name: 'Jupiter', radius: 0.6, distance: 10, orbitalPeriod: 11.86, color: '#d8ca9d', realRadius: 1.0, description: 'Largest planet, Great Red Spot' },
  { name: 'Saturn', radius: 0.5, distance: 13, orbitalPeriod: 29.46, color: '#f4d59e', realRadius: 0.84, description: 'Famous ring system' },
  { name: 'Uranus', radius: 0.35, distance: 16, orbitalPeriod: 84.01, color: '#b5e3e3', realRadius: 0.36, description: 'Ice giant, tilted axis' },
  { name: 'Neptune', radius: 0.35, distance: 19, orbitalPeriod: 164.8, color: '#5b7fde', realRadius: 0.35, description: 'Ice giant, windiest planet' },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function createOrbitPoints(distance: number, segments = 128): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance
    ));
  }
  return points;
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
// 3D COMPONENTS
// ============================================================================

function Sun() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002;
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshBasicMaterial color="#fdb813" />
      </mesh>
      <pointLight color="#fdb813" intensity={3} distance={100} decay={0.5} />
      <mesh>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color="#ff8c00" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

interface PlanetProps {
  data: PlanetData;
  timeScale: number;
  showLabels: boolean;
  realisticSizes: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function Planet({ data, timeScale, showLabels, realisticSizes, isSelected, onClick }: PlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  
  const radius = realisticSizes ? data.realRadius * 2 : data.radius;
  
  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.getElapsedTime() * timeScale;
      const angle = (time / data.orbitalPeriod) * 0.5;
      groupRef.current.position.x = Math.cos(angle) * data.distance;
      groupRef.current.position.z = Math.sin(angle) * data.distance;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh 
        ref={meshRef} 
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial 
          color={data.color} 
          emissive={isSelected || hovered ? data.color : '#000000'}
          emissiveIntensity={isSelected ? 0.5 : hovered ? 0.3 : 0}
        />
      </mesh>
      {data.name === 'Saturn' && (
        <mesh rotation={[Math.PI / 2.5, 0.1, 0]}>
          <ringGeometry args={[radius * 1.4, radius * 2.2, 64]} />
          <meshBasicMaterial color="#d4b896" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}
      {showLabels && (
        <Html position={[0, radius + 0.5, 0]} center distanceFactor={15}>
          <div 
            className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap transition-all ${
              isSelected ? 'bg-accent text-black scale-110' : 'bg-black/80 text-white'
            }`}
            role="button"
            aria-label={`${data.name}: ${data.description}`}
          >
            {data.name}
          </div>
        </Html>
      )}
    </group>
  );
}

interface OrbitPathProps {
  distance: number;
  color: string;
  visible: boolean;
}

function OrbitPath({ distance, color, visible }: OrbitPathProps) {
  const points = useMemo(() => createOrbitPoints(distance), [distance]);
  
  if (!visible) return null;
  
  return (
    <Line
      points={points}
      color={color}
      lineWidth={1}
      transparent
      opacity={0.4}
    />
  );
}

interface CameraControllerProps {
  focusTarget: THREE.Vector3 | null;
}

function CameraController({ focusTarget }: CameraControllerProps) {
  const controlsRef = useRef<any>(null);
  
  useFrame(() => {
    if (focusTarget && controlsRef.current) {
      controlsRef.current.target.lerp(focusTarget, 0.05);
    }
  });
  
  return (
    <OrbitControls 
      ref={controlsRef} 
      enableDamping 
      dampingFactor={0.05}
      minDistance={5}
      maxDistance={60}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
      }}
    />
  );
}

interface SolarSystemSceneProps {
  timeScale: number;
  showOrbits: boolean;
  showLabels: boolean;
  realisticSizes: boolean;
  selectedPlanet: string | null;
  onSelectPlanet: (name: string | null) => void;
}

function SolarSystemScene({ 
  timeScale, 
  showOrbits, 
  showLabels, 
  realisticSizes,
  selectedPlanet,
  onSelectPlanet
}: SolarSystemSceneProps) {
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null);
  
  const handlePlanetClick = useCallback((name: string) => {
    if (selectedPlanet === name) {
      onSelectPlanet(null);
      setFocusTarget(new THREE.Vector3(0, 0, 0));
    } else {
      onSelectPlanet(name);
    }
  }, [selectedPlanet, onSelectPlanet]);

  return (
    <>
      <ambientLight intensity={0.15} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Sun />
      
      {PLANETS.map((planet) => (
        <group key={planet.name}>
          <OrbitPath 
            distance={planet.distance} 
            color={planet.color} 
            visible={showOrbits}
          />
          <Planet 
            data={planet}
            timeScale={timeScale}
            showLabels={showLabels}
            realisticSizes={realisticSizes}
            isSelected={selectedPlanet === planet.name}
            onClick={() => handlePlanetClick(planet.name)}
          />
        </group>
      ))}
      
      <CameraController focusTarget={focusTarget} />
      <PerspectiveCamera makeDefault position={[15, 20, 30]} fov={50} />
    </>
  );
}

// ============================================================================
// MAIN SOLAR SYSTEM COMPONENT
// ============================================================================

export default function SolarSystem() {
  const [timeScale, setTimeScale] = useState(1);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [realisticSizes, setRealisticSizes] = useState(false);
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);

  // Keyboard controls for time scale
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      setTimeScale(prev => Math.min(5, prev + 0.5));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      setTimeScale(prev => Math.max(0, prev - 0.5));
    } else if (e.key === ' ') {
      setTimeScale(prev => prev === 0 ? 1 : 0);
    }
  }, []);

  const selectedPlanetData = selectedPlanet 
    ? PLANETS.find(p => p.name === selectedPlanet) 
    : null;

  return (
    <div className="space-y-4" role="application" aria-label="Interactive 3D Solar System">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 md:gap-4 items-center bg-bg-secondary p-3 md:p-4 rounded-lg">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <label htmlFor="time-scale" className="text-sm text-text-secondary whitespace-nowrap">Time:</label>
          <input
            id="time-scale"
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={timeScale}
            onChange={(e) => setTimeScale(parseFloat(e.target.value))}
            onKeyDown={handleKeyDown}
            className="w-full max-w-24 accent-accent"
            aria-label="Time scale slider"
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={timeScale}
          />
          <span className="text-sm text-accent font-mono w-12">{timeScale.toFixed(1)}x</span>
        </div>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOrbits}
            onChange={(e) => setShowOrbits(e.target.checked)}
            className="accent-accent w-4 h-4"
            aria-label="Show orbit lines"
          />
          <span className="text-sm text-text-secondary">Orbits</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            className="accent-accent w-4 h-4"
            aria-label="Show planet labels"
          />
          <span className="text-sm text-text-secondary">Labels</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={realisticSizes}
            onChange={(e) => setRealisticSizes(e.target.checked)}
            className="accent-accent w-4 h-4"
            aria-label="Toggle realistic planet sizes"
          />
          <span className="text-sm text-text-secondary">Realistic</span>
        </label>

        {selectedPlanetData && (
          <div className="w-full md:w-auto md:ml-auto pt-2 md:pt-0 border-t md:border-t-0 border-border">
            <span className="text-sm text-accent">
              <strong>{selectedPlanetData.name}</strong>
              <span className="text-text-secondary ml-2 hidden sm:inline">{selectedPlanetData.description}</span>
            </span>
          </div>
        )}
      </div>

      {/* 3D Canvas */}
      <div 
        className="h-[350px] sm:h-[400px] md:h-[500px] bg-black rounded-lg overflow-hidden border border-border"
        role="img"
        aria-label="3D visualization of the solar system with 8 planets orbiting the sun"
      >
        <Canvas dpr={[1, 2]} performance={{ min: 0.5 }}>
          <Suspense fallback={<LoadingFallback />}>
            <SolarSystemScene
              timeScale={timeScale}
              showOrbits={showOrbits}
              showLabels={showLabels}
              realisticSizes={realisticSizes}
              selectedPlanet={selectedPlanet}
              onSelectPlanet={setSelectedPlanet}
            />
          </Suspense>
        </Canvas>
      </div>
      
      <p className="text-center text-sm text-text-secondary">
        <span className="hidden sm:inline">Drag to orbit • Scroll to zoom • Click a planet to select</span>
        <span className="sm:hidden">Touch to orbit • Pinch to zoom • Tap planet to select</span>
      </p>
    </div>
  );
}

// ============================================================================
// 3D VECTOR VISUALIZER
// ============================================================================

function VectorArrow({ vector, color, label }: { vector: Vector3D; color: string; label: string }) {
  const direction = new THREE.Vector3(vector.x, vector.y, vector.z).normalize();
  const length = new THREE.Vector3(vector.x, vector.y, vector.z).length();
  
  if (length === 0) return null;
  
  return (
    <group>
      <arrowHelper args={[direction, new THREE.Vector3(0, 0, 0), length, color, length * 0.2, length * 0.1]} />
      <Html position={[vector.x * 0.5, vector.y * 0.5 + 0.3, vector.z * 0.5]}>
        <div className="text-xs font-bold px-1 rounded" style={{ color, background: 'rgba(0,0,0,0.7)' }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

function AxisHelper() {
  return (
    <group>
      {/* X axis - red */}
      <Line points={[[-5, 0, 0], [5, 0, 0]]} color="#ff6b6b" lineWidth={2} />
      <Html position={[5.3, 0, 0]}><span className="text-[#ff6b6b] font-bold text-sm">X</span></Html>
      
      {/* Y axis - green */}
      <Line points={[[0, -5, 0], [0, 5, 0]]} color="#51cf66" lineWidth={2} />
      <Html position={[0, 5.3, 0]}><span className="text-[#51cf66] font-bold text-sm">Y</span></Html>
      
      {/* Z axis - blue */}
      <Line points={[[0, 0, -5], [0, 0, 5]]} color="#339af0" lineWidth={2} />
      <Html position={[0, 0, 5.3]}><span className="text-[#339af0] font-bold text-sm">Z</span></Html>
      
      {/* Grid */}
      <gridHelper args={[10, 10, '#333', '#222']} />
    </group>
  );
}

export function Vector3DVisualizer() {
  const [vector, setVector] = useState<Vector3D>({ x: 2, y: 3, z: 1 });
  
  const magnitude = Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
  const normalized = magnitude > 0 
    ? { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude }
    : { x: 0, y: 0, z: 0 };
  
  return (
    <div className="space-y-4" role="application" aria-label="3D Vector Visualizer">
      <div className="grid grid-cols-3 gap-2 md:gap-4 bg-bg-secondary p-3 md:p-4 rounded-lg">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} className="space-y-1">
            <label 
              htmlFor={`vector-${axis}`}
              className="text-sm text-text-secondary uppercase flex items-center gap-1 md:gap-2"
            >
              <span className={`w-2 h-2 md:w-3 md:h-3 rounded ${axis === 'x' ? 'bg-[#ff6b6b]' : axis === 'y' ? 'bg-[#51cf66]' : 'bg-[#339af0]'}`}></span>
              {axis}
            </label>
            <input
              id={`vector-${axis}`}
              type="range"
              min="-4"
              max="4"
              step="0.5"
              value={vector[axis]}
              onChange={(e) => setVector({ ...vector, [axis]: parseFloat(e.target.value) })}
              className="w-full accent-accent"
              aria-label={`${axis.toUpperCase()} component`}
              aria-valuemin={-4}
              aria-valuemax={4}
              aria-valuenow={vector[axis]}
            />
            <span className="text-xs md:text-sm font-mono text-accent">{vector[axis].toFixed(1)}</span>
          </div>
        ))}
      </div>
      
      <div className="bg-bg-card p-3 rounded-lg border border-border">
        <p className="text-sm text-text-secondary">
          <span className="block sm:inline">Vector: <code className="text-accent">({vector.x.toFixed(1)}, {vector.y.toFixed(1)}, {vector.z.toFixed(1)})</code></span>
          <span className="block sm:inline sm:ml-4 mt-1 sm:mt-0">Magnitude: <code className="text-accent">{magnitude.toFixed(2)}</code></span>
        </p>
      </div>

      <div 
        className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border"
        role="img"
        aria-label={`3D vector visualization showing vector (${vector.x}, ${vector.y}, ${vector.z}) with magnitude ${magnitude.toFixed(2)}`}
      >
        <Canvas camera={{ position: [6, 6, 6], fov: 50 }} dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <ambientLight intensity={0.5} />
            <AxisHelper />
            <VectorArrow vector={vector} color="#ffd43b" label="v" />
            
            {/* Component projections */}
            <Line 
              points={[[0, 0, 0], [vector.x, 0, 0]]} 
              color="#ff6b6b" 
              lineWidth={2} 
              dashed 
              dashSize={0.1} 
              gapSize={0.05} 
            />
            <Line 
              points={[[vector.x, 0, 0], [vector.x, vector.y, 0]]} 
              color="#51cf66" 
              lineWidth={2} 
              dashed 
              dashSize={0.1} 
              gapSize={0.05} 
            />
            <Line 
              points={[[vector.x, vector.y, 0], [vector.x, vector.y, vector.z]]} 
              color="#339af0" 
              lineWidth={2} 
              dashed 
              dashSize={0.1} 
              gapSize={0.05} 
            />
            
            <OrbitControls enableDamping />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

// ============================================================================
// MATRIX TRANSFORMATION DEMO
// ============================================================================

export function MatrixTransformDemo() {
  const [translation, setTranslation] = useState({ x: 0, y: 0, z: 0 });
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [scale, setScale] = useState({ x: 1, y: 1, z: 1 });
  const [showOriginal, setShowOriginal] = useState(true);

  // Compute a simplified transformation matrix for display
  const computeMatrix = () => {
    const rx = (rotation.x * Math.PI) / 180;
    const ry = (rotation.y * Math.PI) / 180;
    const rz = (rotation.z * Math.PI) / 180;
    
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    
    // Combined rotation matrix (ZYX order) with scale
    return [
      [scale.x * cy * cz, -scale.y * cy * sz, scale.z * sy, translation.x],
      [scale.x * (sx * sy * cz + cx * sz), scale.y * (cx * cz - sx * sy * sz), -scale.z * sx * cy, translation.y],
      [scale.x * (sx * sz - cx * sy * cz), scale.y * (cx * sy * sz + sx * cz), scale.z * cx * cy, translation.z],
      [0, 0, 0, 1]
    ];
  };

  const matrix = computeMatrix();

  return (
    <div className="space-y-4" role="application" aria-label="3D Matrix Transformation Demo">
      <div className="grid md:grid-cols-3 gap-3 md:gap-4">
        {/* Translation controls */}
        <div className="bg-bg-secondary p-3 md:p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#51cf66] mb-2 md:mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            Translate
          </h4>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <label htmlFor={`trans-${axis}`} className="text-xs text-text-secondary w-4 uppercase">{axis}</label>
              <input
                id={`trans-${axis}`}
                type="range"
                min="-3"
                max="3"
                step="0.5"
                value={translation[axis]}
                onChange={(e) => setTranslation({ ...translation, [axis]: parseFloat(e.target.value) })}
                className="flex-1 accent-[#51cf66]"
                aria-label={`Translate ${axis.toUpperCase()}`}
              />
              <span className="text-xs font-mono w-8">{translation[axis].toFixed(1)}</span>
            </div>
          ))}
        </div>
        
        {/* Rotation controls */}
        <div className="bg-bg-secondary p-3 md:p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#ffd43b] mb-2 md:mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            Rotate (deg)
          </h4>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <label htmlFor={`rot-${axis}`} className="text-xs text-text-secondary w-4 uppercase">{axis}</label>
              <input
                id={`rot-${axis}`}
                type="range"
                min="-180"
                max="180"
                step="15"
                value={rotation[axis]}
                onChange={(e) => setRotation({ ...rotation, [axis]: parseFloat(e.target.value) })}
                className="flex-1 accent-[#ffd43b]"
                aria-label={`Rotate ${axis.toUpperCase()}`}
              />
              <span className="text-xs font-mono w-10">{rotation[axis]}°</span>
            </div>
          ))}
        </div>
        
        {/* Scale controls */}
        <div className="bg-bg-secondary p-3 md:p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#ff6b6b] mb-2 md:mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"/><path d="M3 16.2V21m0 0h4.8M3 21l6-6"/><path d="M21 7.8V3m0 0h-4.8M21 3l-6 6"/><path d="M3 7.8V3m0 0h4.8M3 3l6 6"/></svg>
            Scale
          </h4>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <label htmlFor={`scale-${axis}`} className="text-xs text-text-secondary w-4 uppercase">{axis}</label>
              <input
                id={`scale-${axis}`}
                type="range"
                min="0.25"
                max="2"
                step="0.25"
                value={scale[axis]}
                onChange={(e) => setScale({ ...scale, [axis]: parseFloat(e.target.value) })}
                className="flex-1 accent-[#ff6b6b]"
                aria-label={`Scale ${axis.toUpperCase()}`}
              />
              <span className="text-xs font-mono w-8">{scale[axis].toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
      
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showOriginal}
          onChange={(e) => setShowOriginal(e.target.checked)}
          className="accent-accent w-4 h-4"
          aria-label="Show original wireframe cube"
        />
        <span className="text-sm text-text-secondary">Show original (wireframe)</span>
      </label>

      <div 
        className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border"
        role="img"
        aria-label="3D cube transformation visualization"
      >
        <Canvas camera={{ position: [5, 5, 5], fov: 50 }} dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <ambientLight intensity={0.3} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <AxisHelper />
            
            {/* Original cube (wireframe) */}
            {showOriginal && (
              <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="#666" wireframe />
              </mesh>
            )}
            
            {/* Transformed cube */}
            <mesh
              position={[translation.x, translation.y, translation.z]}
              rotation={[
                (rotation.x * Math.PI) / 180,
                (rotation.y * Math.PI) / 180,
                (rotation.z * Math.PI) / 180
              ]}
              scale={[scale.x, scale.y, scale.z]}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#6c5ce7" />
            </mesh>
            
            <OrbitControls enableDamping />
          </Suspense>
        </Canvas>
      </div>
      
      <div className="bg-bg-card p-3 md:p-4 rounded-lg border border-border font-mono text-xs overflow-x-auto">
        <p className="text-text-secondary mb-2">4x4 Transformation Matrix:</p>
        <pre className="text-accent" aria-label="Transformation matrix values">
{matrix.map((row, i) => 
  `[ ${row.map(v => v.toFixed(2).padStart(6)).join('  ')} ]`
).join('\n')}
        </pre>
      </div>
    </div>
  );
}

// ============================================================================
// PROJECTION COMPARISON DEMO
// ============================================================================

function ProjectionScene({ type }: { type: 'perspective' | 'orthographic' }) {
  const cubePositions = [
    [-2, 0, 0], [0, 0, -3], [2, 0, -6], [0, 2, -9]
  ] as [number, number, number][];
  const colors = ['#ff6b6b', '#51cf66', '#339af0', '#ffd43b'];
  
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <gridHelper args={[20, 20, '#333', '#222']} />
      
      {cubePositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={colors[i]} />
        </mesh>
      ))}
      
      {type === 'perspective' ? (
        <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={60} />
      ) : (
        <OrthographicCamera makeDefault position={[0, 5, 10]} zoom={30} />
      )}
      
      <OrbitControls enableDamping />
    </>
  );
}

export function ProjectionComparison() {
  const [projectionType, setProjectionType] = useState<'perspective' | 'orthographic'>('perspective');
  
  return (
    <div className="space-y-4" role="application" aria-label="Projection Comparison Demo">
      <div className="flex flex-wrap gap-3 md:gap-4 bg-bg-secondary p-3 md:p-4 rounded-lg items-center">
        <button
          onClick={() => setProjectionType('perspective')}
          className={`px-3 md:px-4 py-2 rounded transition-colors text-sm ${
            projectionType === 'perspective'
              ? 'bg-accent text-black font-bold'
              : 'bg-bg-card text-text-secondary hover:bg-border'
          }`}
          aria-pressed={projectionType === 'perspective'}
        >
          Perspective
        </button>
        <button
          onClick={() => setProjectionType('orthographic')}
          className={`px-3 md:px-4 py-2 rounded transition-colors text-sm ${
            projectionType === 'orthographic'
              ? 'bg-accent text-black font-bold'
              : 'bg-bg-card text-text-secondary hover:bg-border'
          }`}
          aria-pressed={projectionType === 'orthographic'}
        >
          Orthographic
        </button>
        
        <div className="w-full md:w-auto md:ml-auto text-xs md:text-sm text-text-secondary">
          {projectionType === 'perspective' 
            ? 'Objects shrink with distance (realistic)' 
            : 'Objects maintain size (CAD/2D games)'}
        </div>
      </div>

      <div 
        className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border"
        role="img"
        aria-label={`${projectionType} projection showing 4 cubes at different distances`}
      >
        <Canvas key={projectionType} dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <ProjectionScene type={projectionType} />
          </Suspense>
        </Canvas>
      </div>
      
      <div className="grid md:grid-cols-2 gap-3 md:gap-4 text-sm">
        <div className={`p-3 md:p-4 rounded-lg border transition-colors ${projectionType === 'perspective' ? 'border-accent bg-accent/10' : 'border-border bg-bg-card'}`}>
          <h4 className="font-bold text-white mb-2">Perspective Projection</h4>
          <ul className="text-text-secondary space-y-1 text-xs md:text-sm">
            <li>• Objects shrink with distance</li>
            <li>• Parallel lines converge</li>
            <li>• Realistic 3D appearance</li>
            <li>• Used in: FPS, racing games</li>
          </ul>
        </div>
        <div className={`p-3 md:p-4 rounded-lg border transition-colors ${projectionType === 'orthographic' ? 'border-accent bg-accent/10' : 'border-border bg-bg-card'}`}>
          <h4 className="font-bold text-white mb-2">Orthographic Projection</h4>
          <ul className="text-text-secondary space-y-1 text-xs md:text-sm">
            <li>• Objects maintain size</li>
            <li>• Parallel lines stay parallel</li>
            <li>• No depth distortion</li>
            <li>• Used in: isometric games, CAD</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GIMBAL LOCK DEMONSTRATION
// ============================================================================

function GimbalRings({ rotation, showGimbal }: { rotation: { x: number; y: number; z: number }; showGimbal: boolean }) {
  const innerRef = useRef<THREE.Group>(null);
  const middleRef = useRef<THREE.Group>(null);
  const outerRef = useRef<THREE.Group>(null);
  const objectRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (outerRef.current && middleRef.current && innerRef.current && objectRef.current) {
      // Apply Euler rotations in order: Z (yaw) -> X (pitch) -> Y (roll)
      outerRef.current.rotation.z = (rotation.z * Math.PI) / 180;
      middleRef.current.rotation.x = (rotation.x * Math.PI) / 180;
      innerRef.current.rotation.y = (rotation.y * Math.PI) / 180;
      
      // The object follows all three
      objectRef.current.rotation.set(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        'ZXY'
      );
    }
  });

  const ringGeometry = useMemo(() => new THREE.TorusGeometry(2, 0.05, 16, 100), []);

  return (
    <>
      {/* Object being rotated */}
      <mesh ref={objectRef}>
        <coneGeometry args={[0.5, 1.5, 8]} />
        <meshStandardMaterial color="#6c5ce7" />
      </mesh>
      
      {showGimbal && (
        <>
          {/* Outer ring (Z) - blue */}
          <group ref={outerRef}>
            <mesh geometry={ringGeometry}>
              <meshBasicMaterial color="#339af0" />
            </mesh>
            
            {/* Middle ring (X) - red */}
            <group ref={middleRef}>
              <mesh geometry={ringGeometry} rotation={[Math.PI / 2, 0, 0]}>
                <meshBasicMaterial color="#ff6b6b" />
              </mesh>
              
              {/* Inner ring (Y) - green */}
              <group ref={innerRef}>
                <mesh geometry={ringGeometry} rotation={[0, 0, Math.PI / 2]}>
                  <meshBasicMaterial color="#51cf66" />
                </mesh>
              </group>
            </group>
          </group>
        </>
      )}
    </>
  );
}

export function GimbalLockDemo() {
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [showGimbal, setShowGimbal] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  
  // Detect gimbal lock (when pitch is near ±90°)
  useEffect(() => {
    const nearLock = Math.abs(Math.abs(rotation.x) - 90) < 5;
    setIsLocked(nearLock);
  }, [rotation.x]);
  
  const handleRotationChange = (axis: 'x' | 'y' | 'z', value: number) => {
    setRotation(prev => ({ ...prev, [axis]: value }));
  };
  
  const triggerGimbalLock = () => {
    setRotation({ x: 90, y: 0, z: 0 });
  };

  const resetRotation = () => {
    setRotation({ x: 0, y: 0, z: 0 });
  };

  return (
    <div className="space-y-4" role="application" aria-label="Gimbal Lock Demonstration">
      <div className="bg-bg-secondary p-3 md:p-4 rounded-lg space-y-4">
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div>
            <label htmlFor="gimbal-pitch" className="text-xs md:text-sm text-[#ff6b6b] block mb-1">
              Pitch (X): {rotation.x}°
            </label>
            <input
              id="gimbal-pitch"
              type="range"
              min="-90"
              max="90"
              value={rotation.x}
              onChange={(e) => handleRotationChange('x', parseInt(e.target.value))}
              className="w-full accent-[#ff6b6b]"
              aria-label="Pitch rotation"
            />
          </div>
          <div>
            <label htmlFor="gimbal-roll" className="text-xs md:text-sm text-[#51cf66] block mb-1">
              Roll (Y): {rotation.y}°
            </label>
            <input
              id="gimbal-roll"
              type="range"
              min="-180"
              max="180"
              value={rotation.y}
              onChange={(e) => handleRotationChange('y', parseInt(e.target.value))}
              className="w-full accent-[#51cf66]"
              aria-label="Roll rotation"
            />
          </div>
          <div>
            <label htmlFor="gimbal-yaw" className="text-xs md:text-sm text-[#339af0] block mb-1">
              Yaw (Z): {rotation.z}°
            </label>
            <input
              id="gimbal-yaw"
              type="range"
              min="-180"
              max="180"
              value={rotation.z}
              onChange={(e) => handleRotationChange('z', parseInt(e.target.value))}
              className="w-full accent-[#339af0]"
              aria-label="Yaw rotation"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showGimbal}
              onChange={(e) => setShowGimbal(e.target.checked)}
              className="accent-accent w-4 h-4"
              aria-label="Show gimbal rings"
            />
            <span className="text-xs md:text-sm text-text-secondary">Show gimbal rings</span>
          </label>
          
          <div className="flex gap-2">
            <button
              onClick={resetRotation}
              className="px-3 py-1.5 bg-bg-card text-text-secondary rounded hover:bg-border transition-colors text-xs md:text-sm"
            >
              Reset
            </button>
            <button
              onClick={triggerGimbalLock}
              className="px-3 py-1.5 bg-[#e17055] text-white rounded hover:bg-[#d63031] transition-colors text-xs md:text-sm"
            >
              Trigger Gimbal Lock
            </button>
          </div>
        </div>
      </div>
      
      {isLocked && (
        <div 
          className="bg-[#e17055]/20 border border-[#e17055] p-3 md:p-4 rounded-lg flex items-start gap-3"
          role="alert"
          aria-live="polite"
        >
          <svg className="w-5 h-5 text-[#e17055] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          <div>
            <p className="text-[#e17055] font-bold text-sm md:text-base">Gimbal Lock Detected!</p>
            <p className="text-xs md:text-sm text-text-secondary">
              At ±90° pitch, yaw and roll axes align. Try moving them — they produce the same rotation!
            </p>
          </div>
        </div>
      )}

      <div 
        className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border"
        role="img"
        aria-label="Gimbal lock visualization with rotating cone and gimbal rings"
      >
        <Canvas camera={{ position: [4, 4, 4], fov: 50 }} dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <gridHelper args={[10, 10, '#333', '#222']} />
            <GimbalRings rotation={rotation} showGimbal={showGimbal} />
            <OrbitControls enableDamping />
          </Suspense>
        </Canvas>
      </div>
      
      <div className="grid md:grid-cols-2 gap-3 md:gap-4 text-xs md:text-sm">
        <div className="p-3 md:p-4 bg-[#e17055]/10 border border-[#e17055] rounded-lg">
          <h4 className="font-bold text-[#e17055] mb-2">Euler Angles (Problem)</h4>
          <ul className="text-text-secondary space-y-1">
            <li>• Store rotation as 3 angles</li>
            <li>• Intuitive but suffers from gimbal lock</li>
            <li>• Interpolation can be weird</li>
            <li>• Order of rotation matters!</li>
          </ul>
        </div>
        <div className="p-3 md:p-4 bg-[#00b894]/10 border border-[#00b894] rounded-lg">
          <h4 className="font-bold text-[#00b894] mb-2">Quaternions (Solution)</h4>
          <ul className="text-text-secondary space-y-1">
            <li>• Store rotation as 4D number</li>
            <li>• No gimbal lock, smooth SLERP</li>
            <li>• Less intuitive but robust</li>
            <li>• Used in all game engines</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RENDERING PIPELINE VISUALIZATION
// ============================================================================

export function RenderingPipeline() {
  const [activeStage, setActiveStage] = useState(0);
  
  const stages = [
    {
      name: 'Model Space',
      shortName: 'Model',
      color: '#ff6b6b',
      description: 'Object coordinates relative to the object itself. Origin is typically at the center of the object.',
      matrix: 'Model Matrix (M)'
    },
    {
      name: 'World Space',
      shortName: 'World',
      color: '#ffd43b',
      description: 'Object placed in the game world. All objects share the same coordinate system.',
      matrix: 'View Matrix (V)'
    },
    {
      name: 'View Space',
      shortName: 'View',
      color: '#51cf66',
      description: 'Everything relative to the camera. Camera is at origin, looking down -Z.',
      matrix: 'Projection Matrix (P)'
    },
    {
      name: 'Clip Space',
      shortName: 'Clip',
      color: '#339af0',
      description: 'Homogeneous coordinates (-w to w). Vertices outside are clipped.',
      matrix: 'Perspective Divide'
    },
    {
      name: 'NDC Space',
      shortName: 'NDC',
      color: '#6c5ce7',
      description: 'Normalized Device Coordinates (-1 to 1). Ready for viewport transform.',
      matrix: 'Viewport Transform'
    },
    {
      name: 'Screen Space',
      shortName: 'Screen',
      color: '#e17055',
      description: 'Final pixel coordinates on your screen!',
      matrix: ''
    }
  ];

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      setActiveStage(prev => Math.min(stages.length - 1, prev + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      setActiveStage(prev => Math.max(0, prev - 1));
    }
  }, [stages.length]);

  return (
    <div className="space-y-4 md:space-y-6" role="application" aria-label="3D Rendering Pipeline Visualization">
      <div className="relative" onKeyDown={handleKeyDown} tabIndex={0}>
        {/* Pipeline stages */}
        <div className="flex justify-between items-center overflow-x-auto pb-2">
          {stages.map((stage, i) => (
            <div
              key={stage.name}
              className="flex flex-col items-center cursor-pointer group min-w-[50px] md:min-w-[60px]"
              onClick={() => setActiveStage(i)}
              role="button"
              aria-pressed={activeStage === i}
              aria-label={`Stage ${i + 1}: ${stage.name}`}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setActiveStage(i)}
            >
              <div 
                className={`w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center text-black font-bold text-sm md:text-base transition-all ${
                  activeStage === i ? 'ring-2 md:ring-4 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: stage.color }}
              >
                {i + 1}
              </div>
              <p className={`text-[10px] md:text-xs mt-1 md:mt-2 text-center ${
                activeStage === i ? 'text-white font-bold' : 'text-text-secondary'
              }`}>
                <span className="hidden md:inline">{stage.name}</span>
                <span className="md:hidden">{stage.shortName}</span>
              </p>
            </div>
          ))}
        </div>
        
        {/* Connecting lines */}
        <div className="absolute top-4 md:top-6 left-4 right-4 h-0.5 bg-border -z-10" />
      </div>
      
      {/* Active stage details */}
      <div 
        className="p-4 md:p-6 rounded-lg border-2 transition-colors"
        style={{ borderColor: stages[activeStage].color, backgroundColor: `${stages[activeStage].color}15` }}
        role="region"
        aria-live="polite"
      >
        <h4 className="text-lg md:text-xl font-bold mb-2" style={{ color: stages[activeStage].color }}>
          {stages[activeStage].name}
        </h4>
        <p className="text-text-secondary text-sm md:text-base mb-4">{stages[activeStage].description}</p>
        
        {stages[activeStage].matrix && (
          <div className="flex items-center gap-2 text-xs md:text-sm">
            <span className="text-text-secondary">Transform by:</span>
            <span className="font-mono font-bold" style={{ color: stages[activeStage].color }}>
              {stages[activeStage].matrix}
            </span>
            <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        )}
      </div>
      
      {/* MVP matrix formula */}
      <div className="bg-bg-secondary p-3 md:p-4 rounded-lg border border-border">
        <p className="text-xs md:text-sm text-text-secondary mb-2">The MVP Matrix:</p>
        <p className="font-mono text-base md:text-lg text-accent">
          v<sub>clip</sub> = <span className="text-[#6c5ce7]">P</span> × <span className="text-[#51cf66]">V</span> × <span className="text-[#ffd43b]">M</span> × v<sub>local</sub>
        </p>
        <p className="text-xs text-text-secondary mt-2">
          Multiply local vertex by Model, View, then Projection matrix (right to left)
        </p>
      </div>
    </div>
  );
}
