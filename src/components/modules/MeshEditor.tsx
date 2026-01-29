import { useState, useRef, useMemo, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

interface VertexData {
  position: [number, number, number];
  normal?: [number, number, number];
  uv?: [number, number];
}

interface MeshData {
  vertices: VertexData[];
  indices: number[];
  name: string;
}

type PrimitiveType = 'cube' | 'sphere' | 'cylinder' | 'torus' | 'plane' | 'cone';

interface ProceduralParams {
  // Box
  boxWidth: number;
  boxHeight: number;
  boxDepth: number;
  // Sphere
  sphereRadius: number;
  sphereWidthSegments: number;
  sphereHeightSegments: number;
  // Cylinder
  cylinderRadiusTop: number;
  cylinderRadiusBottom: number;
  cylinderHeight: number;
  cylinderSegments: number;
  // Torus
  torusRadius: number;
  torusTube: number;
  torusRadialSegments: number;
  torusTubularSegments: number;
  // Plane
  planeWidth: number;
  planeHeight: number;
  planeWidthSegments: number;
  planeHeightSegments: number;
  // Cone
  coneRadius: number;
  coneHeight: number;
  coneSegments: number;
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
// GEOMETRY GENERATORS
// ============================================================================

function createGeometry(type: PrimitiveType, params: ProceduralParams): THREE.BufferGeometry {
  switch (type) {
    case 'cube':
      return new THREE.BoxGeometry(params.boxWidth, params.boxHeight, params.boxDepth);
    case 'sphere':
      return new THREE.SphereGeometry(params.sphereRadius, params.sphereWidthSegments, params.sphereHeightSegments);
    case 'cylinder':
      return new THREE.CylinderGeometry(params.cylinderRadiusTop, params.cylinderRadiusBottom, params.cylinderHeight, params.cylinderSegments);
    case 'torus':
      return new THREE.TorusGeometry(params.torusRadius, params.torusTube, params.torusRadialSegments, params.torusTubularSegments);
    case 'plane':
      return new THREE.PlaneGeometry(params.planeWidth, params.planeHeight, params.planeWidthSegments, params.planeHeightSegments);
    case 'cone':
      return new THREE.ConeGeometry(params.coneRadius, params.coneHeight, params.coneSegments);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function extractMeshData(geometry: THREE.BufferGeometry, name: string): MeshData {
  const positionAttr = geometry.getAttribute('position');
  const normalAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  const indexAttr = geometry.getIndex();

  const vertices: VertexData[] = [];
  for (let i = 0; i < positionAttr.count; i++) {
    const vertex: VertexData = {
      position: [positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i)]
    };
    if (normalAttr) {
      vertex.normal = [normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)];
    }
    if (uvAttr) {
      vertex.uv = [uvAttr.getX(i), uvAttr.getY(i)];
    }
    vertices.push(vertex);
  }

  const indices: number[] = indexAttr 
    ? Array.from(indexAttr.array) 
    : Array.from({ length: positionAttr.count }, (_, i) => i);

  return { vertices, indices, name };
}

// ============================================================================
// VERTEX POINTS COMPONENT
// ============================================================================

interface VertexPointsProps {
  geometry: THREE.BufferGeometry;
  visible: boolean;
  selectedVertex: number | null;
  onSelectVertex: (index: number | null) => void;
  showIndices?: boolean;
}

function VertexPoints({ geometry, visible, selectedVertex, onSelectVertex, showIndices = true }: VertexPointsProps) {
  const positions = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    return Array.from({ length: posAttr.count }, (_, i) => 
      new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
    );
  }, [geometry]);

  // Limit index labels to avoid clutter on high-poly meshes
  const showIndexLimit = 100;

  if (!visible) return null;

  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh
            onClick={(e) => { e.stopPropagation(); onSelectVertex(selectedVertex === i ? null : i); }}
          >
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial 
              color={selectedVertex === i ? '#ff6b6b' : '#00b894'} 
            />
          </mesh>
          {showIndices && positions.length <= showIndexLimit && (
            <Html position={[0.08, 0.08, 0]} center distanceFactor={10}>
              <span 
                className={`text-[10px] font-mono px-1 rounded select-none pointer-events-none ${
                  selectedVertex === i 
                    ? 'text-[#ff6b6b] bg-black/80' 
                    : 'text-[#ffd43b] bg-black/60'
                }`}
              >
                {i}
              </span>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

// ============================================================================
// NORMALS VISUALIZATION
// ============================================================================

interface NormalsVisualizerProps {
  geometry: THREE.BufferGeometry;
  visible: boolean;
  length: number;
}

function NormalsVisualizer({ geometry, visible, length }: NormalsVisualizerProps) {
  const lines = useMemo(() => {
    if (!visible) return [];
    
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    if (!normalAttr) return [];

    const result: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    
    // Sample every nth vertex to avoid clutter
    const step = Math.max(1, Math.floor(posAttr.count / 100));
    
    for (let i = 0; i < posAttr.count; i += step) {
      const start = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const normal = new THREE.Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
      const end = start.clone().add(normal.multiplyScalar(length));
      result.push({ start, end });
    }
    
    return result;
  }, [geometry, visible, length]);

  if (!visible) return null;

  return (
    <group>
      {lines.map((line, i) => (
        <Line
          key={i}
          points={[line.start, line.end]}
          color="#ff6b6b"
          lineWidth={2}
        />
      ))}
    </group>
  );
}

// ============================================================================
// WIREFRAME COMPONENT
// ============================================================================

interface WireframeOverlayProps {
  geometry: THREE.BufferGeometry;
  visible: boolean;
}

function WireframeOverlay({ geometry, visible }: WireframeOverlayProps) {
  if (!visible) return null;

  return (
    <lineSegments>
      <wireframeGeometry args={[geometry]} />
      <lineBasicMaterial color="#6c5ce7" />
    </lineSegments>
  );
}

// ============================================================================
// FACE HIGHLIGHT COMPONENT
// ============================================================================

interface FaceHighlighterProps {
  geometry: THREE.BufferGeometry;
  hoveredFace: number | null;
}

function FaceHighlighter({ geometry, hoveredFace }: FaceHighlighterProps) {
  const highlightGeom = useMemo(() => {
    if (hoveredFace === null) return null;
    
    const posAttr = geometry.getAttribute('position');
    const indexAttr = geometry.getIndex();
    
    if (!indexAttr) return null;
    
    const i0 = indexAttr.getX(hoveredFace * 3);
    const i1 = indexAttr.getX(hoveredFace * 3 + 1);
    const i2 = indexAttr.getX(hoveredFace * 3 + 2);
    
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([
      posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0),
      posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1),
      posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2),
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    
    return geom;
  }, [geometry, hoveredFace]);

  if (!highlightGeom) return null;

  return (
    <mesh geometry={highlightGeom}>
      <meshBasicMaterial color="#ffd43b" transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ============================================================================
// MAIN MESH COMPONENT
// ============================================================================

interface MeshViewerProps {
  geometry: THREE.BufferGeometry;
  showWireframe: boolean;
  showVertices: boolean;
  showNormals: boolean;
  normalLength: number;
  selectedVertex: number | null;
  onSelectVertex: (index: number | null) => void;
  hoveredFace: number | null;
  onHoverFace: (index: number | null) => void;
  editMode: boolean;
  showVertexIndices?: boolean;
}

function MeshViewer({
  geometry,
  showWireframe,
  showVertices,
  showNormals,
  normalLength,
  selectedVertex,
  onSelectVertex,
  hoveredFace,
  onHoverFace,
  editMode,
  showVertexIndices = true
}: MeshViewerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  useFrame(() => {
    if (meshRef.current && autoRotate && !editMode) {
      meshRef.current.rotation.y += 0.005;
    }
  });

  const handlePointerMove = useCallback((e: THREE.Event) => {
    if (!editMode) return;
    const intersection = (e as any).intersections?.[0];
    if (intersection?.faceIndex !== undefined) {
      onHoverFace(intersection.faceIndex);
    }
  }, [editMode, onHoverFace]);

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onPointerMove={handlePointerMove}
        onPointerOut={() => onHoverFace(null)}
        onClick={() => { if (!editMode) setAutoRotate(!autoRotate); }}
      >
        <meshStandardMaterial 
          color="#6c5ce7" 
          flatShading={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <WireframeOverlay geometry={geometry} visible={showWireframe} />
      <VertexPoints 
        geometry={geometry} 
        visible={showVertices} 
        selectedVertex={selectedVertex}
        onSelectVertex={onSelectVertex}
        showIndices={showVertexIndices}
      />
      <NormalsVisualizer geometry={geometry} visible={showNormals} length={normalLength} />
      <FaceHighlighter geometry={geometry} hoveredFace={hoveredFace} />
    </group>
  );
}

// ============================================================================
// UV VISUALIZER (2D)
// ============================================================================

interface UVVisualizerProps {
  geometry: THREE.BufferGeometry;
}

function UVVisualizer({ geometry }: UVVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      const y = (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Get UV coordinates
    const uvAttr = geometry.getAttribute('uv');
    const indexAttr = geometry.getIndex();
    
    if (!uvAttr) {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '14px monospace';
      ctx.fillText('No UV coordinates', 10, 30);
      return;
    }
    
    // Draw UV triangles
    ctx.strokeStyle = '#00b894';
    ctx.lineWidth = 1;
    
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        const i0 = indexAttr.getX(i);
        const i1 = indexAttr.getX(i + 1);
        const i2 = indexAttr.getX(i + 2);
        
        const u0 = uvAttr.getX(i0) * width;
        const v0 = (1 - uvAttr.getY(i0)) * height;
        const u1 = uvAttr.getX(i1) * width;
        const v1 = (1 - uvAttr.getY(i1)) * height;
        const u2 = uvAttr.getX(i2) * width;
        const v2 = (1 - uvAttr.getY(i2)) * height;
        
        ctx.beginPath();
        ctx.moveTo(u0, v0);
        ctx.lineTo(u1, v1);
        ctx.lineTo(u2, v2);
        ctx.closePath();
        ctx.stroke();
      }
    }
    
    // Draw UV points
    ctx.fillStyle = '#ffd43b';
    for (let i = 0; i < uvAttr.count; i++) {
      const u = uvAttr.getX(i) * width;
      const v = (1 - uvAttr.getY(i)) * height;
      ctx.beginPath();
      ctx.arc(u, v, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [geometry]);

  return (
    <div className="bg-bg-secondary rounded-lg p-4 border border-border">
      <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
        UV Unwrap View
      </h4>
      <canvas 
        ref={canvasRef} 
        width={200} 
        height={200}
        className="w-full aspect-square rounded"
      />
      <p className="text-xs text-text-secondary mt-2">
        Shows how 2D texture coordinates map to the 3D mesh
      </p>
    </div>
  );
}

// ============================================================================
// MESH INFO PANEL
// ============================================================================

interface MeshInfoProps {
  geometry: THREE.BufferGeometry;
  meshData: MeshData;
}

function MeshInfo({ geometry, meshData }: MeshInfoProps) {
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  
  const vertexCount = posAttr.count;
  const triangleCount = indexAttr ? indexAttr.count / 3 : vertexCount / 3;
  const hasNormals = !!geometry.getAttribute('normal');
  const hasUVs = !!geometry.getAttribute('uv');

  return (
    <div className="bg-bg-secondary rounded-lg p-4 border border-border">
      <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        Mesh Statistics
      </h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">Vertices:</span>
          <span className="text-accent font-mono">{vertexCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Triangles:</span>
          <span className="text-accent font-mono">{Math.floor(triangleCount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Indices:</span>
          <span className="text-accent font-mono">{indexAttr ? indexAttr.count : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Has Normals:</span>
          <span className={hasNormals ? 'text-[#00b894]' : 'text-[#ff6b6b]'}>
            {hasNormals ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Has UVs:</span>
          <span className={hasUVs ? 'text-[#00b894]' : 'text-[#ff6b6b]'}>
            {hasUVs ? 'Yes' : 'No'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SCENE SETUP
// ============================================================================

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} />
      <gridHelper args={[10, 10, '#333', '#222']} />
      <axesHelper args={[3]} />
      {children}
      <OrbitControls 
        enableDamping 
        dampingFactor={0.05}
        // Touch controls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        }}
        // Performance
        maxPolarAngle={Math.PI}
        minDistance={1}
        maxDistance={20}
      />
    </>
  );
}

// ============================================================================
// MAIN MESH EDITOR COMPONENT
// ============================================================================

export default function MeshEditor() {
  const [primitive, setPrimitive] = useState<PrimitiveType>('cube');
  const [showWireframe, setShowWireframe] = useState(false);
  const [showVertices, setShowVertices] = useState(false);
  const [showNormals, setShowNormals] = useState(false);
  const [showUVs, setShowUVs] = useState(false);
  const [normalLength, setNormalLength] = useState(0.3);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [hoveredFace, setHoveredFace] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [params, setParams] = useState<ProceduralParams>({
    boxWidth: 1, boxHeight: 1, boxDepth: 1,
    sphereRadius: 0.7, sphereWidthSegments: 16, sphereHeightSegments: 12,
    cylinderRadiusTop: 0.5, cylinderRadiusBottom: 0.5, cylinderHeight: 1.5, cylinderSegments: 16,
    torusRadius: 0.5, torusTube: 0.2, torusRadialSegments: 12, torusTubularSegments: 24,
    planeWidth: 2, planeHeight: 2, planeWidthSegments: 4, planeHeightSegments: 4,
    coneRadius: 0.6, coneHeight: 1.2, coneSegments: 16
  });

  const geometry = useMemo(() => createGeometry(primitive, params), [primitive, params]);
  const meshData = useMemo(() => extractMeshData(geometry, primitive), [geometry, primitive]);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(meshData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${primitive}-mesh.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [meshData, primitive]);

  const primitiveButtons: { type: PrimitiveType; label: string; icon: JSX.Element }[] = [
    { 
      type: 'cube', 
      label: 'Cube',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.29 7 8.71 5 8.71-5"/><path d="M12 22V12"/></svg>
    },
    { 
      type: 'sphere', 
      label: 'Sphere',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
    },
    { 
      type: 'cylinder', 
      label: 'Cylinder',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/></svg>
    },
    { 
      type: 'torus', 
      label: 'Torus',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
    },
    { 
      type: 'plane', 
      label: 'Plane',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
    },
    { 
      type: 'cone', 
      label: 'Cone',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 L3 20 h18 Z"/></svg>
    }
  ];

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden" role="application" aria-label="3D Mesh Editor">
      {/* Toolbar */}
      <div className="p-4 border-b border-border bg-bg-secondary">
        <div className="flex flex-wrap items-center gap-4" role="toolbar" aria-label="Primitive shape selection">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Shape primitives">
            {primitiveButtons.map(({ type, label, icon }) => (
              <button
                key={type}
                onClick={() => setPrimitive(type)}
                aria-label={`Select ${label} primitive`}
                aria-pressed={primitive === type}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  primitive === type
                    ? 'bg-accent text-black'
                    : 'bg-bg-card text-text-secondary hover:text-white border border-border'
                }`}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* 3D Viewport */}
        <div className="flex-1 h-[350px] sm:h-[400px] lg:h-[500px] bg-[#0a0a0f] touch-none">
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <Scene>
                <MeshViewer
                  geometry={geometry}
                  showWireframe={showWireframe}
                  showVertices={showVertices}
                  showNormals={showNormals}
                  normalLength={normalLength}
                  selectedVertex={selectedVertex}
                  onSelectVertex={setSelectedVertex}
                  hoveredFace={hoveredFace}
                  onHoverFace={setHoveredFace}
                  editMode={editMode}
                />
              </Scene>
            </Suspense>
          </Canvas>
        </div>

        {/* Side Panel */}
        <div className="w-full lg:w-80 p-4 border-t lg:border-t-0 lg:border-l border-border space-y-4 overflow-y-auto max-h-[500px]" role="region" aria-label="Mesh controls and information">
          {/* Display Options */}
          <fieldset className="bg-bg-secondary rounded-lg p-4 border border-border">
            <legend className="sr-only">Display options</legend>
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2" aria-hidden="true">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              Display Options
            </h4>
            <div className="space-y-2" role="group">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showWireframe}
                  onChange={(e) => setShowWireframe(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-bg-card accent-accent"
                  aria-describedby="wireframe-desc"
                />
                <span className="text-sm text-text-secondary">Wireframe</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showVertices}
                  onChange={(e) => setShowVertices(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-bg-card accent-accent"
                  aria-describedby="vertices-desc"
                />
                <span className="text-sm text-text-secondary">Show Vertices</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNormals}
                  onChange={(e) => setShowNormals(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-bg-card accent-accent"
                  aria-describedby="normals-desc"
                />
                <span className="text-sm text-text-secondary">Show Normals</span>
              </label>
              {showNormals && (
                <div className="ml-7">
                  <label htmlFor="normal-length" className="text-xs text-text-secondary block mb-1">
                    Normal Length: {normalLength.toFixed(1)}
                  </label>
                  <input
                    id="normal-length"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={normalLength}
                    onChange={(e) => setNormalLength(parseFloat(e.target.value))}
                    className="w-full accent-accent"
                    aria-valuemin={0.1}
                    aria-valuemax={1}
                    aria-valuenow={normalLength}
                  />
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUVs}
                  onChange={(e) => setShowUVs(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-bg-card accent-accent"
                  aria-describedby="uv-desc"
                />
                <span className="text-sm text-text-secondary">Show UV Map</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editMode}
                  onChange={(e) => setEditMode(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-bg-card accent-accent"
                  aria-describedby="edit-desc"
                />
                <span className="text-sm text-text-secondary">Edit Mode (hover faces)</span>
              </label>
            </div>
          </fieldset>

          {/* UV Visualization */}
          {showUVs && <UVVisualizer geometry={geometry} />}

          {/* Selected Vertex Info */}
          {selectedVertex !== null && showVertices && (
            <div className="bg-bg-secondary rounded-lg p-4 border border-[#ff6b6b]" role="region" aria-live="polite" aria-label="Selected vertex information">
              <h4 className="text-sm font-bold text-[#ff6b6b] mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></svg>
                Vertex {selectedVertex}
              </h4>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Position:</span>
                  <span className="text-white text-xs">
                    [{meshData.vertices[selectedVertex]?.position.map(v => v.toFixed(2)).join(', ')}]
                  </span>
                </div>
                {meshData.vertices[selectedVertex]?.normal && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Normal:</span>
                    <span className="text-white text-xs">
                      [{meshData.vertices[selectedVertex].normal!.map(v => v.toFixed(2)).join(', ')}]
                    </span>
                  </div>
                )}
                {meshData.vertices[selectedVertex]?.uv && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">UV:</span>
                    <span className="text-white text-xs">
                      [{meshData.vertices[selectedVertex].uv!.map(v => v.toFixed(2)).join(', ')}]
                    </span>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setSelectedVertex(null)} 
                className="mt-3 text-xs text-text-secondary hover:text-white transition-colors"
                aria-label="Deselect vertex"
              >
                Click to deselect
              </button>
            </div>
          )}

          {/* Mesh Info */}
          <MeshInfo geometry={geometry} meshData={meshData} />

          {/* Export */}
          <button
            onClick={handleExport}
            aria-label={`Export ${primitive} mesh as JSON file`}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-black rounded-lg font-medium hover:bg-accent/90 transition-colors"
          >
            <svg className="w-4 h-4" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Export as JSON
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VERTEX VISUALIZER DEMO
// ============================================================================

export function VertexVisualizer() {
  const [segments, setSegments] = useState(2);
  const [showIndices, setShowIndices] = useState(true);
  
  const geometry = useMemo(() => {
    return new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  }, [segments]);

  const vertexPositions = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < posAttr.count; i++) {
      positions.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }
    return positions;
  }, [geometry]);

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden" role="application" aria-label="Vertex visualizer demo">
      <div className="p-4 border-b border-border bg-bg-secondary">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm text-text-secondary flex items-center gap-2">
            <span>Subdivisions:</span>
            <input
              type="range"
              min="1"
              max="4"
              value={segments}
              onChange={(e) => setSegments(parseInt(e.target.value))}
              className="accent-accent"
              aria-label={`Subdivisions: ${segments}`}
              aria-valuemin={1}
              aria-valuemax={4}
              aria-valuenow={segments}
            />
            <span className="text-accent font-mono w-4">{segments}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showIndices}
              onChange={(e) => setShowIndices(e.target.checked)}
              className="w-4 h-4 accent-accent"
              aria-label="Show vertex indices"
            />
            <span className="text-sm text-text-secondary">Show Indices</span>
          </label>
          <span className="text-sm text-text-secondary ml-auto" aria-live="polite">
            Vertices: <span className="text-accent font-mono">{vertexPositions.length}</span>
          </span>
        </div>
      </div>
      <div className="h-[300px] sm:h-[400px] bg-[#0a0a0f] touch-none">
        <Canvas camera={{ position: [4, 4, 4], fov: 50 }}>
          <Suspense fallback={<LoadingFallback />}>
            <Scene>
              <mesh geometry={geometry}>
                <meshStandardMaterial color="#6c5ce7" transparent opacity={0.3} />
              </mesh>
              <lineSegments>
                <wireframeGeometry args={[geometry]} />
                <lineBasicMaterial color="#6c5ce7" />
              </lineSegments>
              {vertexPositions.map((pos, i) => (
                <group key={i} position={pos}>
                  <mesh>
                    <sphereGeometry args={[0.08, 8, 8]} />
                    <meshBasicMaterial color="#00b894" />
                  </mesh>
                  {showIndices && (
                    <Html position={[0.15, 0.15, 0]} center>
                      <span className="text-xs text-[#ffd43b] font-mono bg-black/70 px-1 rounded">
                        {i}
                      </span>
                    </Html>
                  )}
                </group>
              ))}
            </Scene>
          </Suspense>
        </Canvas>
      </div>
      <div className="p-4 bg-bg-secondary text-sm text-text-secondary">
        <p>
          Each green sphere represents a vertex. As subdivisions increase, more vertices are needed 
          to define the shape. Notice how a simple cube needs <strong className="text-white">24 vertices</strong> 
          (not 8!) because each face needs unique normals and UVs.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// NORMAL VISUALIZER DEMO
// ============================================================================

export function NormalVisualizer() {
  const [normalType, setNormalType] = useState<'flat' | 'smooth'>('flat');
  const [showFaceNormals, setShowFaceNormals] = useState(true);
  
  const geometry = useMemo(() => {
    const geom = new THREE.IcosahedronGeometry(1.5, 1);
    if (normalType === 'flat') {
      geom.computeVertexNormals(); // Ensure normals exist
      // For flat shading, we'd need to duplicate vertices - Three.js handles this via flatShading material
    }
    return geom;
  }, [normalType]);

  const faceNormals = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    const normals: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    
    for (let i = 0; i < posAttr.count; i += 3) {
      const v0 = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      const v1 = new THREE.Vector3(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
      const v2 = new THREE.Vector3(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2));
      
      const center = new THREE.Vector3().addVectors(v0, v1).add(v2).divideScalar(3);
      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v2, v0);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
      
      normals.push({ center, normal });
    }
    
    return normals;
  }, [geometry]);

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden" role="application" aria-label="Normal visualizer demo">
      <div className="p-4 border-b border-border bg-bg-secondary">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2" role="group" aria-label="Shading type selection">
            <button
              onClick={() => setNormalType('flat')}
              aria-pressed={normalType === 'flat'}
              className={`px-3 py-1.5 rounded text-sm ${normalType === 'flat' ? 'bg-accent text-black' : 'bg-bg-card text-text-secondary border border-border'}`}
            >
              Flat Shading
            </button>
            <button
              onClick={() => setNormalType('smooth')}
              aria-pressed={normalType === 'smooth'}
              className={`px-3 py-1.5 rounded text-sm ${normalType === 'smooth' ? 'bg-accent text-black' : 'bg-bg-card text-text-secondary border border-border'}`}
            >
              Smooth Shading
            </button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showFaceNormals}
              onChange={(e) => setShowFaceNormals(e.target.checked)}
              className="w-4 h-4 accent-accent"
              aria-label="Show normal arrows"
            />
            <span className="text-sm text-text-secondary">Show Normals</span>
          </label>
        </div>
      </div>
      <div className="h-[300px] sm:h-[400px] bg-[#0a0a0f] touch-none">
        <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
          <Suspense fallback={<LoadingFallback />}>
            <ambientLight intensity={0.3} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <mesh geometry={geometry}>
              <meshStandardMaterial 
                color="#6c5ce7" 
                flatShading={normalType === 'flat'}
              />
            </mesh>
            {showFaceNormals && faceNormals.map((fn, i) => (
              <Line
                key={i}
                points={[fn.center, fn.center.clone().add(fn.normal.clone().multiplyScalar(0.4))]}
                color="#ff6b6b"
                lineWidth={2}
              />
            ))}
            <gridHelper args={[10, 10, '#333', '#222']} />
            <OrbitControls 
              enableDamping 
              dampingFactor={0.05}
              touches={{
                ONE: THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN
              }}
            />
          </Suspense>
        </Canvas>
      </div>
      <div className="p-4 bg-bg-secondary text-sm text-text-secondary">
        <p>
          <strong className="text-white">Flat shading:</strong> Each face has one normal, creating hard edges. 
          <strong className="text-white ml-2">Smooth shading:</strong> Normals are averaged at vertices, creating smooth transitions.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// UV MAPPING DEMO
// ============================================================================

export function UVMappingDemo() {
  const [primitive, setPrimitive] = useState<'cube' | 'sphere' | 'cylinder'>('cube');
  const [showTexture, setShowTexture] = useState(true);
  
  const geometry = useMemo(() => {
    switch (primitive) {
      case 'cube': return new THREE.BoxGeometry(2, 2, 2);
      case 'sphere': return new THREE.SphereGeometry(1.2, 32, 24);
      case 'cylinder': return new THREE.CylinderGeometry(1, 1, 2, 32);
      default: return new THREE.BoxGeometry(2, 2, 2);
    }
  }, [primitive]);

  // Create a checkerboard texture - only on client
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    const size = 32;
    for (let y = 0; y < canvas.height; y += size) {
      for (let x = 0; x < canvas.width; x += size) {
        const isEven = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = isEven ? '#6c5ce7' : '#00b894';
        ctx.fillRect(x, y, size, size);
      }
    }
    
    // Add grid lines
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const pos = (i / 8) * 256;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, 256);
      ctx.moveTo(0, pos);
      ctx.lineTo(256, pos);
      ctx.stroke();
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    setTexture(tex);
  }, []);

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden" role="application" aria-label="UV mapping demo">
      <div className="p-4 border-b border-border bg-bg-secondary">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2" role="group" aria-label="Shape selection">
            {(['cube', 'sphere', 'cylinder'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPrimitive(p)}
                aria-pressed={primitive === p}
                className={`px-3 py-1.5 rounded text-sm capitalize ${primitive === p ? 'bg-accent text-black' : 'bg-bg-card text-text-secondary border border-border'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showTexture}
              onChange={(e) => setShowTexture(e.target.checked)}
              className="w-4 h-4 accent-accent"
              aria-label="Show checkerboard texture"
            />
            <span className="text-sm text-text-secondary">Show Texture</span>
          </label>
        </div>
      </div>
      <div className="flex flex-col md:flex-row">
        <div className="flex-1 h-[300px] sm:h-[400px] bg-[#0a0a0f] touch-none">
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <mesh geometry={geometry}>
                {showTexture && texture ? (
                  <meshStandardMaterial map={texture} />
                ) : (
                  <meshStandardMaterial color="#6c5ce7" />
                )}
              </mesh>
              <gridHelper args={[10, 10, '#333', '#222']} />
              <OrbitControls 
                enableDamping 
                dampingFactor={0.05}
                touches={{
                  ONE: THREE.TOUCH.ROTATE,
                  TWO: THREE.TOUCH.DOLLY_PAN
                }}
              />
            </Suspense>
          </Canvas>
        </div>
        <div className="w-full md:w-64 p-4 border-t md:border-t-0 md:border-l border-border">
          <h4 className="text-sm font-bold text-white mb-2">UV Coordinates</h4>
          <UVVisualizer geometry={geometry} />
          <p className="text-xs text-text-secondary mt-2">
            UV coordinates (0-1) map 2D texture pixels to 3D surface points.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PROCEDURAL SHAPE BUILDER
// ============================================================================

export function ProceduralShapeBuilder() {
  const [shapeType, setShapeType] = useState<'box' | 'sphere' | 'torus'>('box');
  
  const [boxParams, setBoxParams] = useState({ width: 1, height: 1, depth: 1, widthSeg: 1, heightSeg: 1, depthSeg: 1 });
  const [sphereParams, setSphereParams] = useState({ radius: 1, widthSeg: 16, heightSeg: 12 });
  const [torusParams, setTorusParams] = useState({ radius: 0.7, tube: 0.3, radialSeg: 12, tubularSeg: 24 });
  
  const geometry = useMemo(() => {
    switch (shapeType) {
      case 'box':
        return new THREE.BoxGeometry(
          boxParams.width, boxParams.height, boxParams.depth,
          boxParams.widthSeg, boxParams.heightSeg, boxParams.depthSeg
        );
      case 'sphere':
        return new THREE.SphereGeometry(sphereParams.radius, sphereParams.widthSeg, sphereParams.heightSeg);
      case 'torus':
        return new THREE.TorusGeometry(torusParams.radius, torusParams.tube, torusParams.radialSeg, torusParams.tubularSeg);
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }, [shapeType, boxParams, sphereParams, torusParams]);

  const vertexCount = geometry.getAttribute('position').count;
  const triangleCount = geometry.getIndex() ? geometry.getIndex()!.count / 3 : vertexCount / 3;

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden" role="application" aria-label="Procedural shape builder">
      <div className="p-4 border-b border-border bg-bg-secondary">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2" role="group" aria-label="Shape type selection">
            {(['box', 'sphere', 'torus'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setShapeType(s)}
                aria-pressed={shapeType === s}
                className={`px-3 py-1.5 rounded text-sm capitalize ${shapeType === s ? 'bg-accent text-black' : 'bg-bg-card text-text-secondary border border-border'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ml-auto text-sm text-text-secondary" aria-live="polite">
            <span className="text-accent font-mono">{vertexCount}</span> vertices, 
            <span className="text-accent font-mono ml-1">{Math.floor(triangleCount)}</span> triangles
          </div>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 h-[300px] sm:h-[400px] bg-[#0a0a0f] touch-none">
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <ambientLight intensity={0.4} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <mesh geometry={geometry}>
                <meshStandardMaterial color="#6c5ce7" wireframe={false} />
              </mesh>
              <lineSegments>
                <wireframeGeometry args={[geometry]} />
                <lineBasicMaterial color="#00b894" transparent opacity={0.5} />
              </lineSegments>
              <gridHelper args={[10, 10, '#333', '#222']} />
              <OrbitControls 
                enableDamping 
                dampingFactor={0.05}
                touches={{
                  ONE: THREE.TOUCH.ROTATE,
                  TWO: THREE.TOUCH.DOLLY_PAN
                }}
              />
            </Suspense>
          </Canvas>
        </div>
        <div className="w-full lg:w-72 p-4 border-t lg:border-t-0 lg:border-l border-border">
          <h4 className="text-sm font-bold text-white mb-4">Parameters</h4>
          
          {shapeType === 'box' && (
            <div className="space-y-3">
              {(['width', 'height', 'depth'] as const).map((dim) => (
                <div key={dim}>
                  <label className="text-xs text-text-secondary capitalize">{dim}: {boxParams[dim].toFixed(1)}</label>
                  <input type="range" min="0.5" max="3" step="0.1" value={boxParams[dim]}
                    onChange={(e) => setBoxParams({ ...boxParams, [dim]: parseFloat(e.target.value) })}
                    className="w-full accent-accent"
                  />
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <label className="text-xs text-text-secondary">Segments: {boxParams.widthSeg}</label>
                <input type="range" min="1" max="10" step="1" value={boxParams.widthSeg}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setBoxParams({ ...boxParams, widthSeg: v, heightSeg: v, depthSeg: v });
                  }}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}
          
          {shapeType === 'sphere' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary">Radius: {sphereParams.radius.toFixed(1)}</label>
                <input type="range" min="0.5" max="2" step="0.1" value={sphereParams.radius}
                  onChange={(e) => setSphereParams({ ...sphereParams, radius: parseFloat(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary">Width Segments: {sphereParams.widthSeg}</label>
                <input type="range" min="3" max="64" step="1" value={sphereParams.widthSeg}
                  onChange={(e) => setSphereParams({ ...sphereParams, widthSeg: parseInt(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary">Height Segments: {sphereParams.heightSeg}</label>
                <input type="range" min="2" max="32" step="1" value={sphereParams.heightSeg}
                  onChange={(e) => setSphereParams({ ...sphereParams, heightSeg: parseInt(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}
          
          {shapeType === 'torus' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary">Radius: {torusParams.radius.toFixed(1)}</label>
                <input type="range" min="0.3" max="1.5" step="0.1" value={torusParams.radius}
                  onChange={(e) => setTorusParams({ ...torusParams, radius: parseFloat(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary">Tube: {torusParams.tube.toFixed(2)}</label>
                <input type="range" min="0.1" max="0.6" step="0.05" value={torusParams.tube}
                  onChange={(e) => setTorusParams({ ...torusParams, tube: parseFloat(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary">Radial Segments: {torusParams.radialSeg}</label>
                <input type="range" min="3" max="32" step="1" value={torusParams.radialSeg}
                  onChange={(e) => setTorusParams({ ...torusParams, radialSeg: parseInt(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary">Tubular Segments: {torusParams.tubularSeg}</label>
                <input type="range" min="3" max="64" step="1" value={torusParams.tubularSeg}
                  onChange={(e) => setTorusParams({ ...torusParams, tubularSeg: parseInt(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MESH DEFORMATION DEMO
// ============================================================================

export function MeshDeformationDemo() {
  const [deformType, setDeformType] = useState<'wave' | 'twist' | 'bulge'>('wave');
  const [intensity, setIntensity] = useState(0.3);
  const [animate, setAnimate] = useState(true);

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden" role="application" aria-label="Mesh deformation demo">
      <div className="p-4 border-b border-border bg-bg-secondary">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2" role="group" aria-label="Deformation type selection">
            {(['wave', 'twist', 'bulge'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDeformType(d)}
                aria-pressed={deformType === d}
                className={`px-3 py-1.5 rounded text-sm capitalize ${deformType === d ? 'bg-accent text-black' : 'bg-bg-card text-text-secondary border border-border'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <label className="text-sm text-text-secondary flex items-center gap-2">
            <span>Intensity:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="accent-accent"
              aria-label={`Deformation intensity: ${intensity.toFixed(1)}`}
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={intensity}
            />
            <span className="text-accent font-mono w-6">{intensity.toFixed(1)}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={animate}
              onChange={(e) => setAnimate(e.target.checked)}
              className="w-4 h-4 accent-accent"
              aria-label="Toggle animation"
            />
            <span className="text-sm text-text-secondary">Animate</span>
          </label>
        </div>
      </div>
      <div className="h-[300px] sm:h-[400px] bg-[#0a0a0f] touch-none">
        <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
          <Suspense fallback={<LoadingFallback />}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <DeformableMesh deformType={deformType} intensity={intensity} animate={animate} />
            <gridHelper args={[10, 10, '#333', '#222']} />
            <OrbitControls 
              enableDamping 
              dampingFactor={0.05}
              touches={{
                ONE: THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN
              }}
            />
          </Suspense>
        </Canvas>
      </div>
      <div className="p-4 bg-bg-secondary text-sm text-text-secondary">
        <p>
          <strong className="text-white">Vertex animation:</strong> Each vertex position is modified per frame based on a mathematical function.
          This is how water ripples, cloth simulation, and organic movement work!
        </p>
      </div>
    </div>
  );
}

interface DeformableMeshProps {
  deformType: 'wave' | 'twist' | 'bulge';
  intensity: number;
  animate: boolean;
}

function DeformableMesh({ deformType, intensity, animate }: DeformableMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const originalPositions = useRef<Float32Array | null>(null);
  
  const geometry = useMemo(() => {
    const geom = new THREE.SphereGeometry(1.2, 32, 24);
    originalPositions.current = new Float32Array(geom.getAttribute('position').array);
    return geom;
  }, []);

  useFrame((state) => {
    if (!meshRef.current || !originalPositions.current) return;
    
    const time = animate ? state.clock.getElapsedTime() : 0;
    const posAttr = meshRef.current.geometry.getAttribute('position');
    const original = originalPositions.current;
    
    for (let i = 0; i < posAttr.count; i++) {
      const ox = original[i * 3];
      const oy = original[i * 3 + 1];
      const oz = original[i * 3 + 2];
      
      let dx = 0, dy = 0, dz = 0;
      
      switch (deformType) {
        case 'wave':
          dy = Math.sin(ox * 3 + time * 2) * intensity * 0.5;
          dy += Math.sin(oz * 3 + time * 2.5) * intensity * 0.3;
          break;
        case 'twist':
          const angle = oy * intensity * 2 + time;
          dx = ox * Math.cos(angle) - oz * Math.sin(angle) - ox;
          dz = ox * Math.sin(angle) + oz * Math.cos(angle) - oz;
          break;
        case 'bulge':
          const dist = Math.sqrt(ox * ox + oz * oz);
          const bulge = Math.sin(dist * 3 - time * 2) * intensity * 0.5;
          const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
          if (len > 0) {
            dx = (ox / len) * bulge;
            dy = (oy / len) * bulge;
            dz = (oz / len) * bulge;
          }
          break;
      }
      
      posAttr.setXYZ(i, ox + dx, oy + dy, oz + dz);
    }
    
    posAttr.needsUpdate = true;
    meshRef.current.geometry.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial color="#6c5ce7" />
    </mesh>
  );
}
