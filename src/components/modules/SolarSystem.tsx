import { useState, useRef, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { OrbitControls, Text, Line, Stars, Html, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
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
  { name: 'Mercury', radius: 0.15, distance: 3, orbitalPeriod: 0.24, color: '#b0b0b0', realRadius: 0.038 },
  { name: 'Venus', radius: 0.25, distance: 4.5, orbitalPeriod: 0.62, color: '#e6c97a', realRadius: 0.095 },
  { name: 'Earth', radius: 0.25, distance: 6, orbitalPeriod: 1.0, color: '#6b93d6', realRadius: 0.1 },
  { name: 'Mars', radius: 0.2, distance: 7.5, orbitalPeriod: 1.88, color: '#c1440e', realRadius: 0.053 },
  { name: 'Jupiter', radius: 0.6, distance: 10, orbitalPeriod: 11.86, color: '#d8ca9d', realRadius: 1.0 },
  { name: 'Saturn', radius: 0.5, distance: 13, orbitalPeriod: 29.46, color: '#f4d59e', realRadius: 0.84 },
  { name: 'Uranus', radius: 0.35, distance: 16, orbitalPeriod: 84.01, color: '#b5e3e3', realRadius: 0.36 },
  { name: 'Neptune', radius: 0.35, distance: 19, orbitalPeriod: 164.8, color: '#5b7fde', realRadius: 0.35 },
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
// 3D COMPONENTS
// ============================================================================

function Sun() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
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
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.4, radius * 2.2, 32]} />
          <meshBasicMaterial color="#d4b896" side={THREE.DoubleSide} transparent opacity={0.7} />
        </mesh>
      )}
      {showLabels && (
        <Html position={[0, radius + 0.5, 0]} center distanceFactor={15}>
          <div className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${
            isSelected ? 'bg-accent text-black' : 'bg-black/70 text-white'
          }`}>
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
      opacity={0.3}
    />
  );
}

interface CameraControllerProps {
  focusTarget: THREE.Vector3 | null;
}

function CameraController({ focusTarget }: CameraControllerProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  
  useFrame(() => {
    if (focusTarget && controlsRef.current) {
      controlsRef.current.target.lerp(focusTarget, 0.05);
    }
  });
  
  return <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} />;
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
      <ambientLight intensity={0.1} />
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
      <PerspectiveCamera makeDefault position={[0, 20, 30]} fov={60} />
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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center bg-bg-secondary p-4 rounded-lg">
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">Time Scale:</label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={timeScale}
            onChange={(e) => setTimeScale(parseFloat(e.target.value))}
            className="w-24 accent-accent"
          />
          <span className="text-sm text-accent font-mono w-12">{timeScale.toFixed(1)}x</span>
        </div>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOrbits}
            onChange={(e) => setShowOrbits(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-text-secondary">Orbits</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-text-secondary">Labels</span>
        </label>
        
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={realisticSizes}
            onChange={(e) => setRealisticSizes(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-sm text-text-secondary">Realistic Sizes</span>
        </label>

        {selectedPlanet && (
          <span className="text-sm text-accent ml-auto">
            Selected: <strong>{selectedPlanet}</strong>
          </span>
        )}
      </div>

      {/* 3D Canvas */}
      <div className="h-[500px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas>
          <Suspense fallback={null}>
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
        Drag to orbit • Scroll to zoom • Click a planet to select
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
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 bg-bg-secondary p-4 rounded-lg">
        {['x', 'y', 'z'].map((axis) => (
          <div key={axis} className="space-y-1">
            <label className="text-sm text-text-secondary uppercase flex items-center gap-2">
              <span className={`w-3 h-3 rounded ${axis === 'x' ? 'bg-[#ff6b6b]' : axis === 'y' ? 'bg-[#51cf66]' : 'bg-[#339af0]'}`}></span>
              {axis}
            </label>
            <input
              type="range"
              min="-4"
              max="4"
              step="0.5"
              value={vector[axis as keyof Vector3D]}
              onChange={(e) => setVector({ ...vector, [axis]: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
            <span className="text-sm font-mono text-accent">{vector[axis as keyof Vector3D].toFixed(1)}</span>
          </div>
        ))}
      </div>
      
      <div className="bg-bg-card p-3 rounded-lg border border-border">
        <p className="text-sm text-text-secondary">
          Vector: <code className="text-accent">({vector.x.toFixed(1)}, {vector.y.toFixed(1)}, {vector.z.toFixed(1)})</code>
          <span className="ml-4">Magnitude: <code className="text-accent">{magnitude.toFixed(2)}</code></span>
        </p>
      </div>

      <div className="h-[400px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas camera={{ position: [6, 6, 6], fov: 50 }}>
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

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        {/* Translation controls */}
        <div className="bg-bg-secondary p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#51cf66] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            Translate
          </h4>
          {['x', 'y', 'z'].map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <span className="text-xs text-text-secondary w-4 uppercase">{axis}</span>
              <input
                type="range"
                min="-3"
                max="3"
                step="0.5"
                value={translation[axis as keyof typeof translation]}
                onChange={(e) => setTranslation({ ...translation, [axis]: parseFloat(e.target.value) })}
                className="flex-1 accent-[#51cf66]"
              />
              <span className="text-xs font-mono w-8">{translation[axis as keyof typeof translation].toFixed(1)}</span>
            </div>
          ))}
        </div>
        
        {/* Rotation controls */}
        <div className="bg-bg-secondary p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#ffd43b] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            Rotate (deg)
          </h4>
          {['x', 'y', 'z'].map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <span className="text-xs text-text-secondary w-4 uppercase">{axis}</span>
              <input
                type="range"
                min="-180"
                max="180"
                step="15"
                value={rotation[axis as keyof typeof rotation]}
                onChange={(e) => setRotation({ ...rotation, [axis]: parseFloat(e.target.value) })}
                className="flex-1 accent-[#ffd43b]"
              />
              <span className="text-xs font-mono w-10">{rotation[axis as keyof typeof rotation]}°</span>
            </div>
          ))}
        </div>
        
        {/* Scale controls */}
        <div className="bg-bg-secondary p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#ff6b6b] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"/><path d="M3 16.2V21m0 0h4.8M3 21l6-6"/><path d="M21 7.8V3m0 0h-4.8M21 3l-6 6"/><path d="M3 7.8V3m0 0h4.8M3 3l6 6"/></svg>
            Scale
          </h4>
          {['x', 'y', 'z'].map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <span className="text-xs text-text-secondary w-4 uppercase">{axis}</span>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.25"
                value={scale[axis as keyof typeof scale]}
                onChange={(e) => setScale({ ...scale, [axis]: parseFloat(e.target.value) })}
                className="flex-1 accent-[#ff6b6b]"
              />
              <span className="text-xs font-mono w-8">{scale[axis as keyof typeof scale].toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
      
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showOriginal}
          onChange={(e) => setShowOriginal(e.target.checked)}
          className="accent-accent"
        />
        <span className="text-sm text-text-secondary">Show original (wireframe)</span>
      </label>

      <div className="h-[400px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
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
        </Canvas>
      </div>
      
      <div className="bg-bg-card p-4 rounded-lg border border-border font-mono text-xs overflow-x-auto">
        <p className="text-text-secondary mb-2">4x4 Transformation Matrix (TRS order):</p>
        <pre className="text-accent">
{`[ ${(scale.x * Math.cos(rotation.y * Math.PI/180) * Math.cos(rotation.z * Math.PI/180)).toFixed(2).padStart(6)}  ${(scale.y * -Math.sin(rotation.z * Math.PI/180)).toFixed(2).padStart(6)}  ${(scale.z * Math.sin(rotation.y * Math.PI/180)).toFixed(2).padStart(6)}  ${translation.x.toFixed(2).padStart(6)} ]
[ ${(scale.x * Math.sin(rotation.z * Math.PI/180)).toFixed(2).padStart(6)}  ${(scale.y * Math.cos(rotation.z * Math.PI/180)).toFixed(2).padStart(6)}  ${(0).toFixed(2).padStart(6)}  ${translation.y.toFixed(2).padStart(6)} ]
[ ${(scale.x * -Math.sin(rotation.y * Math.PI/180)).toFixed(2).padStart(6)}  ${(0).toFixed(2).padStart(6)}  ${(scale.z * Math.cos(rotation.y * Math.PI/180)).toFixed(2).padStart(6)}  ${translation.z.toFixed(2).padStart(6)} ]
[ ${(0).toFixed(2).padStart(6)}  ${(0).toFixed(2).padStart(6)}  ${(0).toFixed(2).padStart(6)}  ${(1).toFixed(2).padStart(6)} ]`}
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
  
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <gridHelper args={[20, 20, '#333', '#222']} />
      
      {cubePositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={['#ff6b6b', '#51cf66', '#339af0', '#ffd43b'][i]} />
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
    <div className="space-y-4">
      <div className="flex gap-4 bg-bg-secondary p-4 rounded-lg">
        <button
          onClick={() => setProjectionType('perspective')}
          className={`px-4 py-2 rounded transition-colors ${
            projectionType === 'perspective'
              ? 'bg-accent text-black font-bold'
              : 'bg-bg-card text-text-secondary hover:bg-border'
          }`}
        >
          Perspective
        </button>
        <button
          onClick={() => setProjectionType('orthographic')}
          className={`px-4 py-2 rounded transition-colors ${
            projectionType === 'orthographic'
              ? 'bg-accent text-black font-bold'
              : 'bg-bg-card text-text-secondary hover:bg-border'
          }`}
        >
          Orthographic
        </button>
        
        <div className="ml-auto text-sm text-text-secondary">
          {projectionType === 'perspective' 
            ? 'Objects appear smaller with distance (realistic)' 
            : 'Objects maintain size regardless of distance (CAD/2D games)'}
        </div>
      </div>

      <div className="h-[400px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas key={projectionType}>
          <Suspense fallback={null}>
            <ProjectionScene type={projectionType} />
          </Suspense>
        </Canvas>
      </div>
      
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className={`p-4 rounded-lg border ${projectionType === 'perspective' ? 'border-accent bg-accent/10' : 'border-border bg-bg-card'}`}>
          <h4 className="font-bold text-white mb-2">Perspective Projection</h4>
          <ul className="text-text-secondary space-y-1">
            <li>• Objects shrink with distance</li>
            <li>• Parallel lines converge (vanishing point)</li>
            <li>• Realistic 3D appearance</li>
            <li>• Used in: FPS, racing, most 3D games</li>
          </ul>
        </div>
        <div className={`p-4 rounded-lg border ${projectionType === 'orthographic' ? 'border-accent bg-accent/10' : 'border-border bg-bg-card'}`}>
          <h4 className="font-bold text-white mb-2">Orthographic Projection</h4>
          <ul className="text-text-secondary space-y-1">
            <li>• Objects maintain size at any distance</li>
            <li>• Parallel lines stay parallel</li>
            <li>• No depth distortion</li>
            <li>• Used in: isometric games, CAD, 2D with 3D art</li>
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
  const checkGimbalLock = useCallback(() => {
    const nearLock = Math.abs(Math.abs(rotation.x) - 90) < 5;
    setIsLocked(nearLock);
  }, [rotation.x]);
  
  const handleRotationChange = (axis: 'x' | 'y' | 'z', value: number) => {
    setRotation(prev => ({ ...prev, [axis]: value }));
    checkGimbalLock();
  };
  
  const triggerGimbalLock = () => {
    setRotation({ x: 90, y: 0, z: 0 });
    setIsLocked(true);
  };

  return (
    <div className="space-y-4">
      <div className="bg-bg-secondary p-4 rounded-lg space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-[#ff6b6b] block mb-1">Pitch (X): {rotation.x}°</label>
            <input
              type="range"
              min="-90"
              max="90"
              value={rotation.x}
              onChange={(e) => handleRotationChange('x', parseInt(e.target.value))}
              className="w-full accent-[#ff6b6b]"
            />
          </div>
          <div>
            <label className="text-sm text-[#51cf66] block mb-1">Roll (Y): {rotation.y}°</label>
            <input
              type="range"
              min="-180"
              max="180"
              value={rotation.y}
              onChange={(e) => handleRotationChange('y', parseInt(e.target.value))}
              className="w-full accent-[#51cf66]"
            />
          </div>
          <div>
            <label className="text-sm text-[#339af0] block mb-1">Yaw (Z): {rotation.z}°</label>
            <input
              type="range"
              min="-180"
              max="180"
              value={rotation.z}
              onChange={(e) => handleRotationChange('z', parseInt(e.target.value))}
              className="w-full accent-[#339af0]"
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showGimbal}
              onChange={(e) => setShowGimbal(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-sm text-text-secondary">Show gimbal rings</span>
          </label>
          
          <button
            onClick={triggerGimbalLock}
            className="px-4 py-2 bg-[#e17055] text-white rounded hover:bg-[#d63031] transition-colors text-sm"
          >
            Trigger Gimbal Lock
          </button>
        </div>
      </div>
      
      {isLocked && (
        <div className="bg-[#e17055]/20 border border-[#e17055] p-4 rounded-lg flex items-center gap-3">
          <svg className="w-5 h-5 text-[#e17055] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          <div>
            <p className="text-[#e17055] font-bold">Gimbal Lock Detected!</p>
            <p className="text-sm text-text-secondary">
              When pitch reaches ±90°, the yaw and roll axes align. Moving either produces the same rotation — you've lost a degree of freedom!
            </p>
          </div>
        </div>
      )}

      <div className="h-[400px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas camera={{ position: [4, 4, 4], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <gridHelper args={[10, 10, '#333', '#222']} />
          <GimbalRings rotation={rotation} showGimbal={showGimbal} />
          <OrbitControls enableDamping />
        </Canvas>
      </div>
      
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div className="p-4 bg-[#e17055]/10 border border-[#e17055] rounded-lg">
          <h4 className="font-bold text-[#e17055] mb-2">Euler Angles (Problem)</h4>
          <ul className="text-text-secondary space-y-1">
            <li>• Store rotation as 3 angles (pitch, yaw, roll)</li>
            <li>• Intuitive but suffers from gimbal lock</li>
            <li>• Interpolation can be weird</li>
            <li>• Order of rotation matters!</li>
          </ul>
        </div>
        <div className="p-4 bg-[#00b894]/10 border border-[#00b894] rounded-lg">
          <h4 className="font-bold text-[#00b894] mb-2">Quaternions (Solution)</h4>
          <ul className="text-text-secondary space-y-1">
            <li>• Store rotation as 4D complex number</li>
            <li>• No gimbal lock, smooth interpolation</li>
            <li>• Less intuitive but more robust</li>
            <li>• Used in all modern game engines</li>
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
      color: '#ff6b6b',
      description: 'Object coordinates relative to the object itself. Origin is typically at the center of the object.',
      matrix: 'Model Matrix (M)'
    },
    {
      name: 'World Space',
      color: '#ffd43b',
      description: 'Object placed in the game world. All objects share the same coordinate system.',
      matrix: 'View Matrix (V)'
    },
    {
      name: 'View Space',
      color: '#51cf66',
      description: 'Everything relative to the camera. Camera is at origin, looking down -Z.',
      matrix: 'Projection Matrix (P)'
    },
    {
      name: 'Clip Space',
      color: '#339af0',
      description: 'Homogeneous coordinates (-w to w). Vertices outside are clipped.',
      matrix: 'Perspective Divide'
    },
    {
      name: 'NDC Space',
      color: '#6c5ce7',
      description: 'Normalized Device Coordinates (-1 to 1). Ready for viewport transform.',
      matrix: 'Viewport Transform'
    },
    {
      name: 'Screen Space',
      color: '#e17055',
      description: 'Final pixel coordinates on your screen!',
      matrix: ''
    }
  ];

  return (
    <div className="space-y-6">
      <div className="relative">
        {/* Pipeline stages */}
        <div className="flex justify-between items-center">
          {stages.map((stage, i) => (
            <div
              key={stage.name}
              className="flex flex-col items-center cursor-pointer group"
              onClick={() => setActiveStage(i)}
            >
              <div 
                className={`w-12 h-12 rounded-full flex items-center justify-center text-black font-bold transition-all ${
                  activeStage === i ? 'ring-4 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: stage.color }}
              >
                {i + 1}
              </div>
              <p className={`text-xs mt-2 text-center max-w-[80px] ${
                activeStage === i ? 'text-white font-bold' : 'text-text-secondary'
              }`}>
                {stage.name}
              </p>
            </div>
          ))}
        </div>
        
        {/* Connecting lines */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-border -z-10" />
      </div>
      
      {/* Active stage details */}
      <div 
        className="p-6 rounded-lg border-2 transition-colors"
        style={{ borderColor: stages[activeStage].color, backgroundColor: `${stages[activeStage].color}15` }}
      >
        <h4 className="text-xl font-bold mb-2" style={{ color: stages[activeStage].color }}>
          {stages[activeStage].name}
        </h4>
        <p className="text-text-secondary mb-4">{stages[activeStage].description}</p>
        
        {stages[activeStage].matrix && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">Transform by:</span>
            <span className="font-mono font-bold" style={{ color: stages[activeStage].color }}>
              {stages[activeStage].matrix}
            </span>
            <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        )}
      </div>
      
      {/* MVP matrix formula */}
      <div className="bg-bg-secondary p-4 rounded-lg border border-border">
        <p className="text-sm text-text-secondary mb-2">The MVP Matrix:</p>
        <p className="font-mono text-lg text-accent">
          v<sub>clip</sub> = <span className="text-[#6c5ce7]">P</span> × <span className="text-[#51cf66]">V</span> × <span className="text-[#ffd43b]">M</span> × v<sub>local</sub>
        </p>
        <p className="text-xs text-text-secondary mt-2">
          Multiply local vertex by Model, View, then Projection matrix (right to left order)
        </p>
      </div>
    </div>
  );
}
