import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, TransformControls, Stats, Line, PerspectiveCamera, Box, Sphere, Cone, Torus, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import {
  ChevronRight,
  ChevronDown,
  Box as BoxIcon,
  Circle,
  Triangle,
  Trash2,
  Plus,
  Move,
  RotateCw,
  Maximize,
  Eye,
  EyeOff,
  Layers,
  Activity,
  Zap,
  Target,
  Settings,
  Play,
  Pause,
  RefreshCw,
  Copy
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface SceneNode {
  id: string;
  name: string;
  type: 'box' | 'sphere' | 'cone' | 'torus' | 'cylinder' | 'group';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  visible: boolean;
  children: SceneNode[];
  parent?: string;
  expanded?: boolean;
}

interface TransformMode {
  mode: 'translate' | 'rotate' | 'scale';
}

interface StatsData {
  fps: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
  programs: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getWorldMatrix(node: SceneNode, nodes: Map<string, SceneNode>): THREE.Matrix4 {
  const localMatrix = new THREE.Matrix4();
  localMatrix.compose(
    new THREE.Vector3(...node.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...node.rotation)),
    new THREE.Vector3(...node.scale)
  );

  if (node.parent) {
    const parentNode = nodes.get(node.parent);
    if (parentNode) {
      const parentWorld = getWorldMatrix(parentNode, nodes);
      return parentWorld.multiply(localMatrix);
    }
  }
  return localMatrix;
}

function getWorldPosition(node: SceneNode, nodes: Map<string, SceneNode>): THREE.Vector3 {
  const worldMatrix = getWorldMatrix(node, nodes);
  const position = new THREE.Vector3();
  worldMatrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
  return position;
}

// ============================================================================
// DEFAULT SCENE
// ============================================================================

const createDefaultScene = (): SceneNode[] => [
  {
    id: 'robot',
    name: 'Robot',
    type: 'group',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#6c5ce7',
    visible: true,
    expanded: true,
    children: [
      {
        id: 'body',
        name: 'Body',
        type: 'box',
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1.5, 0.5],
        color: '#6c5ce7',
        visible: true,
        parent: 'robot',
        children: [
          {
            id: 'head',
            name: 'Head',
            type: 'sphere',
            position: [0, 1.2, 0],
            rotation: [0, 0, 0],
            scale: [0.5, 0.5, 0.5],
            color: '#00b894',
            visible: true,
            parent: 'body',
            children: []
          },
          {
            id: 'left-arm',
            name: 'Left Arm',
            type: 'cylinder',
            position: [-0.8, 0.2, 0],
            rotation: [0, 0, Math.PI / 6],
            scale: [0.15, 0.6, 0.15],
            color: '#fd79a8',
            visible: true,
            parent: 'body',
            children: []
          },
          {
            id: 'right-arm',
            name: 'Right Arm',
            type: 'cylinder',
            position: [0.8, 0.2, 0],
            rotation: [0, 0, -Math.PI / 6],
            scale: [0.15, 0.6, 0.15],
            color: '#fd79a8',
            visible: true,
            parent: 'body',
            children: []
          }
        ]
      },
      {
        id: 'left-leg',
        name: 'Left Leg',
        type: 'cylinder',
        position: [-0.3, -0.2, 0],
        rotation: [0, 0, 0],
        scale: [0.2, 0.7, 0.2],
        color: '#fdcb6e',
        visible: true,
        parent: 'robot',
        children: []
      },
      {
        id: 'right-leg',
        name: 'Right Leg',
        type: 'cylinder',
        position: [0.3, -0.2, 0],
        rotation: [0, 0, 0],
        scale: [0.2, 0.7, 0.2],
        color: '#fdcb6e',
        visible: true,
        parent: 'robot',
        children: []
      }
    ]
  }
];

// ============================================================================
// SCENE OBJECT COMPONENT
// ============================================================================

interface SceneObjectProps {
  node: SceneNode;
  isSelected: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}

function SceneObject({ node, isSelected, onSelect, children }: SceneObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  if (!node.visible) return <group ref={groupRef}>{children}</group>;

  const geometry = useMemo(() => {
    switch (node.type) {
      case 'box': return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere': return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'cone': return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus': return <torusGeometry args={[0.4, 0.15, 16, 48]} />;
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'group': return null;
      default: return <boxGeometry args={[1, 1, 1]} />;
    }
  }, [node.type]);

  if (node.type === 'group') {
    return (
      <group 
        ref={groupRef}
        position={node.position}
        rotation={node.rotation}
        scale={node.scale}
      >
        {children}
      </group>
    );
  }

  return (
    <group
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
    >
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        {geometry}
        <meshStandardMaterial
          color={node.color}
          emissive={isSelected ? node.color : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>
      {children}
    </group>
  );
}

// ============================================================================
// SCENE TREE COMPONENT
// ============================================================================

interface SceneTreeProps {
  nodes: SceneNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  depth?: number;
}

function SceneTree({ nodes, selectedId, onSelect, onToggleExpand, onToggleVisibility, depth = 0 }: SceneTreeProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'box': return <BoxIcon size={14} />;
      case 'sphere': return <Circle size={14} />;
      case 'cone': return <Triangle size={14} />;
      case 'group': return <Layers size={14} />;
      default: return <BoxIcon size={14} />;
    }
  };

  return (
    <ul 
      className="text-sm" 
      role="tree" 
      aria-label={depth === 0 ? "Scene hierarchy" : undefined}
    >
      {nodes.map((node) => (
        <li 
          key={node.id} 
          role="treeitem" 
          aria-expanded={node.children.length > 0 ? node.expanded : undefined}
          aria-selected={selectedId === node.id}
        >
          <div
            className={`flex items-center gap-1 py-1 px-2 cursor-pointer rounded transition-colors ${
              selectedId === node.id 
                ? 'bg-accent/30 text-accent' 
                : 'hover:bg-white/5'
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => onSelect(node.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(node.id);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Select ${node.name}`}
          >
            {node.children.length > 0 ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
                className="p-0.5 hover:bg-white/10 rounded"
                aria-label={node.expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
              >
                {node.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : (
              <span className="w-4" aria-hidden="true" />
            )}
            <span className="text-text-secondary" aria-hidden="true">{getIcon(node.type)}</span>
            <span className="flex-1 truncate">{node.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.id); }}
              className="p-0.5 hover:bg-white/10 rounded text-text-secondary"
              aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}
              aria-pressed={node.visible}
            >
              {node.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </div>
          {node.expanded && node.children.length > 0 && (
            <SceneTree
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onToggleVisibility={onToggleVisibility}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// PROPERTY INSPECTOR
// ============================================================================

interface PropertyInspectorProps {
  node: SceneNode | null;
  onUpdate: (id: string, updates: Partial<SceneNode>) => void;
}

function PropertyInspector({ node, onUpdate }: PropertyInspectorProps) {
  if (!node) {
    return (
      <div className="text-text-secondary text-sm text-center py-8">
        Select an object to inspect
      </div>
    );
  }

  const updatePosition = (axis: 0 | 1 | 2, value: number) => {
    const newPos: [number, number, number] = [...node.position];
    newPos[axis] = value;
    onUpdate(node.id, { position: newPos });
  };

  const updateRotation = (axis: 0 | 1 | 2, value: number) => {
    const newRot: [number, number, number] = [...node.rotation];
    newRot[axis] = value * (Math.PI / 180);
    onUpdate(node.id, { rotation: newRot });
  };

  const updateScale = (axis: 0 | 1 | 2, value: number) => {
    const newScale: [number, number, number] = [...node.scale];
    newScale[axis] = value;
    onUpdate(node.id, { scale: newScale });
  };

  return (
    <div className="space-y-4 text-sm" role="form" aria-label="Object properties">
      <div>
        <label htmlFor={`name-${node.id}`} className="text-text-secondary text-xs uppercase tracking-wider">Name</label>
        <input
          id={`name-${node.id}`}
          type="text"
          value={node.name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          className="w-full bg-black/30 border border-border rounded px-2 py-1 mt-1"
          aria-label="Object name"
        />
      </div>

      <fieldset>
        <legend className="text-text-secondary text-xs uppercase tracking-wider flex items-center gap-1">
          <Move size={12} aria-hidden="true" /> Position
        </legend>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <div key={axis}>
              <label htmlFor={`pos-${axis}-${node.id}`} className="text-xs text-text-secondary">{axis}</label>
              <input
                id={`pos-${axis}-${node.id}`}
                type="number"
                step="0.1"
                value={node.position[i].toFixed(2)}
                onChange={(e) => updatePosition(i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                className="w-full bg-black/30 border border-border rounded px-2 py-1"
                aria-label={`Position ${axis}`}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-text-secondary text-xs uppercase tracking-wider flex items-center gap-1">
          <RotateCw size={12} aria-hidden="true" /> Rotation (degrees)
        </legend>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <div key={axis}>
              <label htmlFor={`rot-${axis}-${node.id}`} className="text-xs text-text-secondary">{axis}</label>
              <input
                id={`rot-${axis}-${node.id}`}
                type="number"
                step="5"
                value={(node.rotation[i] * (180 / Math.PI)).toFixed(1)}
                onChange={(e) => updateRotation(i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                className="w-full bg-black/30 border border-border rounded px-2 py-1"
                aria-label={`Rotation ${axis}`}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-text-secondary text-xs uppercase tracking-wider flex items-center gap-1">
          <Maximize size={12} aria-hidden="true" /> Scale
        </legend>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <div key={axis}>
              <label htmlFor={`scale-${axis}-${node.id}`} className="text-xs text-text-secondary">{axis}</label>
              <input
                id={`scale-${axis}-${node.id}`}
                type="number"
                step="0.1"
                min="0.1"
                value={node.scale[i].toFixed(2)}
                onChange={(e) => updateScale(i as 0 | 1 | 2, parseFloat(e.target.value) || 0.1)}
                aria-label={`Scale ${axis}`}
                className="w-full bg-black/30 border border-border rounded px-2 py-1"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`color-${node.id}`} className="text-text-secondary text-xs uppercase tracking-wider">Color</label>
        <input
          id={`color-${node.id}`}
          type="color"
          value={node.color}
          onChange={(e) => onUpdate(node.id, { color: e.target.value })}
          className="w-full h-8 bg-black/30 border border-border rounded mt-1 cursor-pointer"
          aria-label="Object color"
        />
      </div>
    </div>
  );
}

// ============================================================================
// STATS DISPLAY COMPONENT
// ============================================================================

interface StatsDisplayProps {
  stats: StatsData;
}

function StatsDisplay({ stats }: StatsDisplayProps) {
  return (
    <div 
      className="absolute top-2 left-2 bg-black/80 border border-border rounded p-2 text-xs font-mono"
      role="status"
      aria-label="Render statistics"
      aria-live="polite"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-text-secondary">FPS:</span>
        <span 
          className={stats.fps >= 50 ? 'text-green-400' : stats.fps >= 30 ? 'text-yellow-400' : 'text-red-400'}
          aria-label={`Frames per second: ${stats.fps}`}
        >
          {stats.fps}
        </span>
        <span className="text-text-secondary">Draw Calls:</span>
        <span className="text-accent" aria-label={`Draw calls: ${stats.drawCalls}`}>{stats.drawCalls}</span>
        <span className="text-text-secondary">Triangles:</span>
        <span className="text-accent" aria-label={`Triangles: ${stats.triangles.toLocaleString()}`}>{stats.triangles.toLocaleString()}</span>
        <span className="text-text-secondary">Geometries:</span>
        <span className="text-accent" aria-label={`Geometries: ${stats.geometries}`}>{stats.geometries}</span>
      </div>
    </div>
  );
}

// ============================================================================
// RENDERER STATS TRACKER
// ============================================================================

function RendererStats({ onStats }: { onStats: (stats: StatsData) => void }) {
  const { gl } = useThree();
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    
    if (now - lastTime.current >= 1000) {
      const info = gl.info;
      onStats({
        fps: frameCount.current,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        programs: info.programs?.length || 0
      });
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return null;
}

// ============================================================================
// RECURSIVE SCENE RENDERER
// ============================================================================

interface RecursiveSceneProps {
  nodes: SceneNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function RecursiveScene({ nodes, selectedId, onSelect }: RecursiveSceneProps) {
  return (
    <>
      {nodes.map((node) => (
        <SceneObject
          key={node.id}
          node={node}
          isSelected={selectedId === node.id}
          onSelect={() => onSelect(node.id)}
        >
          {node.children.length > 0 && (
            <RecursiveScene
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )}
        </SceneObject>
      ))}
    </>
  );
}

// ============================================================================
// MAIN SCENE EDITOR COMPONENT
// ============================================================================

export default function SceneEditor() {
  const [scene, setScene] = useState<SceneNode[]>(createDefaultScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [stats, setStats] = useState<StatsData>({ fps: 0, drawCalls: 0, triangles: 0, textures: 0, geometries: 0, programs: 0 });

  // Build a map for quick lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, SceneNode>();
    const traverse = (nodes: SceneNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        traverse(node.children);
      }
    };
    traverse(scene);
    return map;
  }, [scene]);

  const selectedNode = selectedId ? nodeMap.get(selectedId) || null : null;

  // Update node in tree
  const updateNode = useCallback((id: string, updates: Partial<SceneNode>) => {
    setScene((prevScene) => {
      const updateInTree = (nodes: SceneNode[]): SceneNode[] => {
        return nodes.map((node) => {
          if (node.id === id) {
            return { ...node, ...updates };
          }
          if (node.children.length > 0) {
            return { ...node, children: updateInTree(node.children) };
          }
          return node;
        });
      };
      return updateInTree(prevScene);
    });
  }, []);

  // Toggle expand
  const toggleExpand = useCallback((id: string) => {
    updateNode(id, { expanded: !nodeMap.get(id)?.expanded });
  }, [updateNode, nodeMap]);

  // Toggle visibility
  const toggleVisibility = useCallback((id: string) => {
    updateNode(id, { visible: !nodeMap.get(id)?.visible });
  }, [updateNode, nodeMap]);

  // Add new object
  const addObject = useCallback((type: SceneNode['type']) => {
    const colors = ['#6c5ce7', '#00b894', '#fd79a8', '#fdcb6e', '#e17055', '#74b9ff'];
    const newNode: SceneNode = {
      id: generateId(),
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type,
      position: [Math.random() * 4 - 2, Math.random() * 2, Math.random() * 4 - 2],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: colors[Math.floor(Math.random() * colors.length)],
      visible: true,
      children: [],
      expanded: true
    };

    if (selectedId && selectedNode?.type === 'group') {
      // Add as child of selected group
      updateNode(selectedId, {
        children: [...selectedNode.children, { ...newNode, parent: selectedId }]
      });
    } else {
      // Add to root
      setScene((prev) => [...prev, newNode]);
    }
    setSelectedId(newNode.id);
  }, [selectedId, selectedNode, updateNode]);

  // Delete selected
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    
    const removeFromTree = (nodes: SceneNode[]): SceneNode[] => {
      return nodes.filter((node) => {
        if (node.id === selectedId) return false;
        if (node.children.length > 0) {
          node.children = removeFromTree(node.children);
        }
        return true;
      });
    };
    
    setScene(removeFromTree);
    setSelectedId(null);
  }, [selectedId]);

  // Reset scene
  const resetScene = useCallback(() => {
    setScene(createDefaultScene());
    setSelectedId(null);
  }, []);

  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="flex flex-col lg:flex-row h-auto lg:h-[600px]">
        {/* Left Panel: Scene Hierarchy */}
        <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-border flex flex-col max-h-[250px] lg:max-h-none">
          <div className="p-3 border-b border-border bg-black/20">
            <div className="flex items-center justify-between mb-2">
              <h3 id="hierarchy-heading" className="font-semibold text-sm flex items-center gap-2">
                <Layers size={16} className="text-accent" aria-hidden="true" />
                Scene Hierarchy
              </h3>
              <button
                onClick={resetScene}
                className="p-1 hover:bg-white/10 rounded text-text-secondary"
                title="Reset Scene"
                aria-label="Reset scene to default"
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="flex gap-1" role="group" aria-label="Add objects">
              <button
                onClick={() => addObject('box')}
                className="flex-1 text-xs bg-accent/20 hover:bg-accent/30 text-accent px-2 py-1 rounded flex items-center justify-center gap-1"
                aria-label="Add box to scene"
              >
                <Plus size={12} aria-hidden="true" /> Box
              </button>
              <button
                onClick={() => addObject('sphere')}
                className="flex-1 text-xs bg-accent/20 hover:bg-accent/30 text-accent px-2 py-1 rounded flex items-center justify-center gap-1"
                aria-label="Add sphere to scene"
              >
                <Plus size={12} aria-hidden="true" /> Sphere
              </button>
              <button
                onClick={() => addObject('group')}
                className="flex-1 text-xs bg-accent/20 hover:bg-accent/30 text-accent px-2 py-1 rounded flex items-center justify-center gap-1"
                aria-label="Add group to scene"
              >
                <Plus size={12} aria-hidden="true" /> Group
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <SceneTree
              nodes={scene}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleExpand={toggleExpand}
              onToggleVisibility={toggleVisibility}
            />
          </div>
        </div>

        {/* Center: 3D Viewport */}
        {/* Center: 3D Viewport */}
        <div className="flex-1 relative min-h-[300px] lg:min-h-0">
          <Canvas shadows>
            <color attach="background" args={['#0d1117']} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
            <pointLight position={[-5, 5, -5]} intensity={0.5} color="#6c5ce7" />
            
            <RecursiveScene
              nodes={scene}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            
            {/* Grid */}
            <gridHelper args={[20, 20, '#333', '#222']} />
            
            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
            <RendererStats onStats={setStats} />
          </Canvas>
          
          <StatsDisplay stats={stats} />
          
          {/* Transform Mode Buttons */}
          <div 
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/80 border border-border rounded-lg p-1"
            role="toolbar"
            aria-label="Transform tools"
          >
            <button
              onClick={() => setTransformMode('translate')}
              className={`p-2 rounded ${transformMode === 'translate' ? 'bg-accent text-black' : 'hover:bg-white/10'}`}
              title="Translate (W)"
              aria-label="Translate mode"
              aria-pressed={transformMode === 'translate'}
            >
              <Move size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => setTransformMode('rotate')}
              className={`p-2 rounded ${transformMode === 'rotate' ? 'bg-accent text-black' : 'hover:bg-white/10'}`}
              title="Rotate (E)"
              aria-label="Rotate mode"
              aria-pressed={transformMode === 'rotate'}
            >
              <RotateCw size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => setTransformMode('scale')}
              className={`p-2 rounded ${transformMode === 'scale' ? 'bg-accent text-black' : 'hover:bg-white/10'}`}
              title="Scale (R)"
              aria-label="Scale mode"
              aria-pressed={transformMode === 'scale'}
            >
              <Maximize size={16} aria-hidden="true" />
            </button>
            <div className="w-px bg-border mx-1" role="separator" aria-orientation="vertical" />
            <button
              onClick={deleteSelected}
              disabled={!selectedId}
              className={`p-2 rounded ${selectedId ? 'hover:bg-red-500/30 text-red-400' : 'opacity-30 cursor-not-allowed'}`}
              title="Delete (Del)"
              aria-label="Delete selected object"
              aria-disabled={!selectedId}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Right Panel: Inspector */}
        <div className="w-full lg:w-64 border-t lg:border-t-0 lg:border-l border-border flex flex-col max-h-[250px] lg:max-h-none">
          <div className="p-3 border-b border-border bg-black/20">
            <h3 id="inspector-heading" className="font-semibold text-sm flex items-center gap-2">
              <Settings size={16} className="text-accent" aria-hidden="true" />
              Inspector
            </h3>
          </div>
          <div className="flex-1 overflow-auto p-3" aria-labelledby="inspector-heading">
            <PropertyInspector node={selectedNode} onUpdate={updateNode} />
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="p-4 border-t border-border bg-black/20" role="note" aria-label="Usage tips">
        <div className="flex flex-wrap items-center gap-2 lg:gap-4 text-sm text-text-secondary">
          <span className="flex items-center gap-1">
            <Activity size={14} className="text-accent" aria-hidden="true" />
            Move the parent Robot group to see children follow!
          </span>
          <span className="flex items-center gap-1">
            <Eye size={14} aria-hidden="true" />
            Click eye icon to toggle visibility
          </span>
          <span className="flex items-center gap-1">
            <Layers size={14} aria-hidden="true" />
            Add objects to groups to create hierarchies
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HIERARCHY TRANSFORM DEMO
// ============================================================================

export function HierarchyTransformDemo() {
  const [parentRotation, setParentRotation] = useState(0);
  const [parentPosition, setParentPosition] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isAnimating) {
      const animate = () => {
        setParentRotation((prev) => prev + 0.02);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isAnimating]);

  function ParentGroup() {
    const groupRef = useRef<THREE.Group>(null);

    useFrame(() => {
      if (groupRef.current) {
        groupRef.current.rotation.y = parentRotation;
        groupRef.current.position.x = parentPosition.x;
        groupRef.current.position.z = parentPosition.y;
      }
    });

    return (
      <group ref={groupRef}>
        {/* Parent - larger center cube */}
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#6c5ce7" />
        </mesh>
        
        {/* Child 1 - orbiting sphere */}
        <mesh position={[2, 0, 0]}>
          <sphereGeometry args={[0.3, 32, 32]} />
          <meshStandardMaterial color="#00b894" />
          
          {/* Grandchild - tiny cube */}
          <mesh position={[0.8, 0, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color="#fd79a8" />
          </mesh>
        </mesh>
        
        {/* Child 2 - another orbiting shape */}
        <mesh position={[-2, 0, 0]}>
          <coneGeometry args={[0.3, 0.6, 32]} />
          <meshStandardMaterial color="#fdcb6e" />
        </mesh>
        
        {/* Child 3 - top */}
        <mesh position={[0, 1.5, 0]}>
          <torusGeometry args={[0.3, 0.1, 16, 48]} />
          <meshStandardMaterial color="#e17055" />
        </mesh>

        {/* Connection lines */}
        <Line points={[[0, 0, 0], [2, 0, 0]]} color="#00b894" lineWidth={2} dashed dashScale={10} />
        <Line points={[[0, 0, 0], [-2, 0, 0]]} color="#fdcb6e" lineWidth={2} dashed dashScale={10} />
        <Line points={[[0, 0, 0], [0, 1.5, 0]]} color="#e17055" lineWidth={2} dashed dashScale={10} />
        <Line points={[[2, 0, 0], [2.8, 0, 0]]} color="#fd79a8" lineWidth={2} dashed dashScale={10} />
      </group>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="h-[400px] relative">
        <Canvas>
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} />
          <pointLight position={[-5, 5, -5]} intensity={0.5} color="#6c5ce7" />
          
          <ParentGroup />
          
          <gridHelper args={[10, 10, '#333', '#222']} />
          <OrbitControls enablePan={false} />
          <PerspectiveCamera makeDefault position={[4, 3, 4]} fov={50} />
        </Canvas>
        
        {/* Legend */}
        <div className="absolute top-3 left-3 bg-black/80 border border-border rounded p-2 text-xs" role="legend" aria-label="Color legend">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded bg-[#6c5ce7]" aria-hidden="true"></span>
            <span>Parent</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded bg-[#00b894]" aria-hidden="true"></span>
            <span>Child</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-[#fd79a8]" aria-hidden="true"></span>
            <span>Grandchild</span>
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={() => setIsAnimating(!isAnimating)}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              isAnimating ? 'bg-red-500/20 text-red-400' : 'bg-accent/20 text-accent'
            }`}
            aria-label={isAnimating ? 'Stop animation' : 'Start parent animation'}
            aria-pressed={isAnimating}
          >
            {isAnimating ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {isAnimating ? 'Stop' : 'Animate Parent'}
          </button>
          
          <div className="flex items-center gap-2">
            <label htmlFor="parent-x" className="text-sm text-text-secondary">Parent X:</label>
            <input
              id="parent-x"
              type="range"
              min="-3"
              max="3"
              step="0.1"
              value={parentPosition.x}
              onChange={(e) => setParentPosition((p) => ({ ...p, x: parseFloat(e.target.value) }))}
              className="w-24"
              aria-label="Parent X position"
            />
            <span className="text-sm w-12" aria-live="polite">{parentPosition.x.toFixed(1)}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label htmlFor="parent-z" className="text-sm text-text-secondary">Parent Z:</label>
            <input
              id="parent-z"
              type="range"
              min="-3"
              max="3"
              step="0.1"
              value={parentPosition.y}
              onChange={(e) => setParentPosition((p) => ({ ...p, y: parseFloat(e.target.value) }))}
              className="w-24"
              aria-label="Parent Z position"
            />
            <span className="text-sm w-12" aria-live="polite">{parentPosition.y.toFixed(1)}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label htmlFor="parent-rotation" className="text-sm text-text-secondary">Rotation:</label>
            <input
              id="parent-rotation"
              type="range"
              min="0"
              max={Math.PI * 2}
              step="0.1"
              value={parentRotation % (Math.PI * 2)}
              onChange={(e) => setParentRotation(parseFloat(e.target.value))}
              aria-label="Parent rotation"
              className="w-24"
            />
          </div>
        </div>
        
        <p className="text-sm text-text-secondary mt-3">
          <strong className="text-white">Key insight:</strong> When you move or rotate the parent, 
          ALL children move with it. The children's positions are relative to their parent, not the world.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// FRUSTUM CULLING DEMO
// ============================================================================

export function FrustumCullingDemo() {
  const [showFrustum, setShowFrustum] = useState(true);
  const [cameraFov, setCameraFov] = useState(60);
  const [cameraRotation, setCameraRotation] = useState(0);
  const [culledCount, setCulledCount] = useState(0);
  const [totalCount] = useState(100);

  function CullingScene() {
    const frustumRef = useRef<THREE.CameraHelper | null>(null);
    const { camera: mainCamera } = useThree();
    const secondaryCamera = useRef<THREE.PerspectiveCamera>(null);
    const objectsRef = useRef<THREE.Mesh[]>([]);
    
    const objects = useMemo(() => {
      const objs: { position: [number, number, number]; color: string }[] = [];
      for (let i = 0; i < totalCount; i++) {
        objs.push({
          position: [
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 30
          ],
          color: `hsl(${Math.random() * 360}, 70%, 50%)`
        });
      }
      return objs;
    }, []);

    useFrame(() => {
      if (!secondaryCamera.current) return;
      
      // Update secondary camera
      secondaryCamera.current.rotation.y = cameraRotation;
      secondaryCamera.current.fov = cameraFov;
      secondaryCamera.current.updateProjectionMatrix();
      
      // Check frustum culling
      const frustum = new THREE.Frustum();
      const matrix = new THREE.Matrix4().multiplyMatrices(
        secondaryCamera.current.projectionMatrix,
        secondaryCamera.current.matrixWorldInverse
      );
      frustum.setFromProjectionMatrix(matrix);
      
      let culled = 0;
      objectsRef.current.forEach((mesh, i) => {
        if (!mesh) return;
        const sphere = new THREE.Sphere(mesh.position, 0.3);
        const inFrustum = frustum.intersectsSphere(sphere);
        
        // Visual feedback
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (inFrustum) {
          material.emissive.setHex(0x000000);
          material.opacity = 1;
        } else {
          material.emissive.setHex(0xff0000);
          material.opacity = 0.3;
          culled++;
        }
      });
      
      setCulledCount(culled);
    });

    return (
      <>
        {/* Secondary camera we're testing with */}
        <perspectiveCamera
          ref={secondaryCamera}
          position={[0, 2, 0]}
          fov={cameraFov}
          near={0.1}
          far={20}
        />
        
        {/* Camera helper visualization */}
        {showFrustum && secondaryCamera.current && (
          <cameraHelper args={[secondaryCamera.current]} />
        )}
        
        {/* Objects */}
        {objects.map((obj, i) => (
          <mesh
            key={i}
            position={obj.position}
            ref={(el) => { if (el) objectsRef.current[i] = el; }}
          >
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color={obj.color} transparent />
          </mesh>
        ))}
        
        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#1a1a2e" />
        </mesh>
      </>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="h-[400px] relative">
        <Canvas>
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 20, 10]} intensity={0.8} />
          
          <CullingScene />
          
          <gridHelper args={[40, 40, '#222', '#1a1a1a']} position={[0, -5, 0]} />
          <OrbitControls />
          <PerspectiveCamera makeDefault position={[15, 15, 15]} fov={50} />
        </Canvas>
        
        {/* Stats overlay */}
        <div className="absolute top-3 left-3 bg-black/80 border border-border rounded p-3">
          <div className="text-sm font-mono">
            <div className="flex items-center gap-2 mb-1">
              <Eye size={14} className="text-green-400" />
              <span>Visible: <span className="text-green-400">{totalCount - culledCount}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <EyeOff size={14} className="text-red-400" />
              <span>Culled: <span className="text-red-400">{culledCount}</span></span>
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="absolute top-3 right-3 bg-black/80 border border-border rounded p-2 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded bg-white/80"></span>
            <span>In frustum (rendered)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-red-500/50"></span>
            <span>Outside (culled)</span>
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showFrustum}
              onChange={(e) => setShowFrustum(e.target.checked)}
              className="rounded"
              aria-describedby="frustum-description"
            />
            <span className="text-sm">Show Frustum</span>
          </label>
          
          <div className="flex items-center gap-2">
            <label htmlFor="fov-slider" className="text-sm text-text-secondary">FOV:</label>
            <input
              id="fov-slider"
              type="range"
              min="30"
              max="120"
              value={cameraFov}
              onChange={(e) => setCameraFov(parseInt(e.target.value))}
              className="w-24"
              aria-label="Field of view"
            />
            <span className="text-sm w-10" aria-live="polite">{cameraFov}°</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label htmlFor="camera-rotation" className="text-sm text-text-secondary">Camera Rotation:</label>
            <input
              id="camera-rotation"
              type="range"
              min={-Math.PI}
              max={Math.PI}
              step="0.1"
              value={cameraRotation}
              onChange={(e) => setCameraRotation(parseFloat(e.target.value))}
              className="w-32"
              aria-label="Camera rotation angle"
            />
          </div>
        </div>
        
        <p id="frustum-description" className="text-sm text-text-secondary mt-3">
          <strong className="text-white">Frustum culling</strong> skips rendering objects outside the camera's view. 
          The GPU never processes these objects, saving significant performance!
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// LOD (LEVEL OF DETAIL) DEMO
// ============================================================================

export function LODDemo() {
  const [cameraDistance, setCameraDistance] = useState(10);
  const [autoAnimate, setAutoAnimate] = useState(false);
  const [currentLOD, setCurrentLOD] = useState(0);

  const lodLevels = [
    { distance: 0, triangles: 2048, color: '#00b894', label: 'High (2K tris)' },
    { distance: 10, triangles: 512, color: '#fdcb6e', label: 'Medium (512 tris)' },
    { distance: 20, triangles: 128, color: '#e17055', label: 'Low (128 tris)' },
    { distance: 30, triangles: 32, color: '#d63031', label: 'Potato (32 tris)' }
  ];

  function LODObject() {
    const groupRef = useRef<THREE.Group>(null);
    
    useFrame((state) => {
      if (groupRef.current) {
        groupRef.current.rotation.y += 0.01;
        
        // Determine LOD level
        let level = 0;
        for (let i = lodLevels.length - 1; i >= 0; i--) {
          if (cameraDistance >= lodLevels[i].distance) {
            level = i;
            break;
          }
        }
        setCurrentLOD(level);
      }
    });

    // Get geometry detail based on LOD
    const detail = lodLevels[currentLOD];
    const segments = Math.sqrt(detail.triangles / 2);

    return (
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[2, Math.max(4, segments), Math.max(4, segments)]} />
          <meshStandardMaterial color={detail.color} wireframe={false} flatShading />
        </mesh>
        {/* Wireframe overlay to show triangles */}
        <mesh>
          <sphereGeometry args={[2.01, Math.max(4, segments), Math.max(4, segments)]} />
          <meshBasicMaterial color="#fff" wireframe opacity={0.2} transparent />
        </mesh>
      </group>
    );
  }

  useEffect(() => {
    if (!autoAnimate) return;
    
    let direction = 1;
    const interval = setInterval(() => {
      setCameraDistance((prev) => {
        const next = prev + direction * 0.5;
        if (next >= 35) direction = -1;
        if (next <= 5) direction = 1;
        return next;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [autoAnimate]);

  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="h-[400px] relative">
        <Canvas>
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} />
          
          <LODObject />
          
          <gridHelper args={[20, 20, '#333', '#222']} />
          <PerspectiveCamera makeDefault position={[0, 3, cameraDistance]} fov={50} />
        </Canvas>
        
        {/* LOD indicator */}
        <div className="absolute top-3 left-3 bg-black/80 border border-border rounded p-3">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Layers size={14} className="text-accent" />
            LOD Levels
          </div>
          {lodLevels.map((level, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs py-1 ${
                currentLOD === i ? 'text-white' : 'text-text-secondary'
              }`}
            >
              <span
                className="w-3 h-3 rounded"
                style={{ backgroundColor: level.color }}
              />
              <span>{level.label}</span>
              <span className="text-text-secondary">({level.distance}+ units)</span>
            </div>
          ))}
        </div>
        
        {/* Current stats */}
        <div className="absolute top-3 right-3 bg-black/80 border border-border rounded p-3">
          <div className="text-xs font-mono">
            <div>Distance: <span className="text-accent">{cameraDistance.toFixed(1)}</span></div>
            <div>Triangles: <span className="text-accent">{lodLevels[currentLOD].triangles}</span></div>
            <div>LOD Level: <span style={{ color: lodLevels[currentLOD].color }}>{currentLOD}</span></div>
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={() => setAutoAnimate(!autoAnimate)}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              autoAnimate ? 'bg-red-500/20 text-red-400' : 'bg-accent/20 text-accent'
            }`}
            aria-label={autoAnimate ? 'Stop auto-animation' : 'Start auto-animation'}
            aria-pressed={autoAnimate}
          >
            {autoAnimate ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {autoAnimate ? 'Stop' : 'Auto-Animate'}
          </button>
          
          <div className="flex items-center gap-2 flex-1">
            <label htmlFor="lod-distance" className="text-sm text-text-secondary">Distance:</label>
            <input
              id="lod-distance"
              type="range"
              min="5"
              max="35"
              step="0.5"
              value={cameraDistance}
              onChange={(e) => setCameraDistance(parseFloat(e.target.value))}
              className="flex-1 max-w-xs"
              aria-label="Camera distance from object"
            />
            <span className="text-sm w-12" aria-live="polite">{cameraDistance.toFixed(1)}</span>
          </div>
        </div>
        
        <p className="text-sm text-text-secondary mt-3">
          <strong className="text-white">Level of Detail (LOD)</strong> swaps high-poly models for low-poly 
          versions at distance. Players can't see the detail anyway, so why render it?
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// INSTANCING DEMO
// ============================================================================

export function InstancingDemo() {
  const [instanceCount, setInstanceCount] = useState(1000);
  const [useInstancing, setUseInstancing] = useState(true);
  const [stats, setStats] = useState({ drawCalls: 0, fps: 0 });

  function InstancedMeshes() {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { gl } = useThree();
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colors = useMemo(() => {
      const arr = new Float32Array(instanceCount * 3);
      for (let i = 0; i < instanceCount; i++) {
        const color = new THREE.Color(`hsl(${(i / instanceCount) * 360}, 70%, 50%)`);
        arr[i * 3] = color.r;
        arr[i * 3 + 1] = color.g;
        arr[i * 3 + 2] = color.b;
      }
      return arr;
    }, [instanceCount]);
    
    useEffect(() => {
      if (!meshRef.current) return;
      
      // Set up instance positions
      const mesh = meshRef.current;
      const gridSize = Math.ceil(Math.cbrt(instanceCount));
      const spacing = 1.2;
      const offset = (gridSize * spacing) / 2;
      
      let i = 0;
      for (let x = 0; x < gridSize && i < instanceCount; x++) {
        for (let y = 0; y < gridSize && i < instanceCount; y++) {
          for (let z = 0; z < gridSize && i < instanceCount; z++) {
            dummy.position.set(
              x * spacing - offset,
              y * spacing - offset,
              z * spacing - offset
            );
            dummy.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
            );
            dummy.scale.setScalar(0.3 + Math.random() * 0.2);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            i++;
          }
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }, [instanceCount, dummy]);
    
    useFrame(() => {
      if (meshRef.current) {
        meshRef.current.rotation.y += 0.002;
      }
      
      // Track stats
      frameCount.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setStats({
          drawCalls: gl.info.render.calls,
          fps: frameCount.current
        });
        frameCount.current = 0;
        lastTime.current = now;
      }
    });

    return (
      <instancedMesh ref={meshRef} args={[undefined, undefined, instanceCount]}>
        <boxGeometry args={[0.4, 0.4, 0.4]}>
          <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
        </boxGeometry>
        <meshStandardMaterial vertexColors />
      </instancedMesh>
    );
  }

  function RegularMeshes() {
    const groupRef = useRef<THREE.Group>(null);
    const { gl } = useThree();
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    
    const meshes = useMemo(() => {
      const arr: { position: [number, number, number]; color: string; rotation: [number, number, number] }[] = [];
      const gridSize = Math.ceil(Math.cbrt(instanceCount));
      const spacing = 1.2;
      const offset = (gridSize * spacing) / 2;
      
      let i = 0;
      for (let x = 0; x < gridSize && i < instanceCount; x++) {
        for (let y = 0; y < gridSize && i < instanceCount; y++) {
          for (let z = 0; z < gridSize && i < instanceCount; z++) {
            arr.push({
              position: [x * spacing - offset, y * spacing - offset, z * spacing - offset],
              color: `hsl(${(i / instanceCount) * 360}, 70%, 50%)`,
              rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI]
            });
            i++;
          }
        }
      }
      return arr;
    }, [instanceCount]);
    
    useFrame(() => {
      if (groupRef.current) {
        groupRef.current.rotation.y += 0.002;
      }
      
      // Track stats
      frameCount.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setStats({
          drawCalls: gl.info.render.calls,
          fps: frameCount.current
        });
        frameCount.current = 0;
        lastTime.current = now;
      }
    });

    return (
      <group ref={groupRef}>
        {meshes.slice(0, Math.min(500, instanceCount)).map((mesh, i) => (
          <mesh key={i} position={mesh.position} rotation={mesh.rotation} scale={0.4}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={mesh.color} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="h-[400px] relative">
        <Canvas>
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 20, 10]} intensity={0.8} />
          
          {useInstancing ? <InstancedMeshes /> : <RegularMeshes />}
          
          <OrbitControls enablePan={false} />
          <PerspectiveCamera makeDefault position={[15, 15, 15]} fov={50} />
        </Canvas>
        
        {/* Stats */}
        <div className="absolute top-3 left-3 bg-black/80 border border-border rounded p-3">
          <div className="text-sm font-mono space-y-1">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-accent" />
              <span>Objects: <span className="text-accent">{useInstancing ? instanceCount : Math.min(500, instanceCount)}</span></span>
            </div>
            <div className={stats.fps >= 50 ? 'text-green-400' : stats.fps >= 30 ? 'text-yellow-400' : 'text-red-400'}>
              FPS: {stats.fps}
            </div>
            <div>Draw Calls: <span className={useInstancing ? 'text-green-400' : 'text-red-400'}>{stats.drawCalls}</span></div>
          </div>
        </div>
        
        {/* Mode indicator */}
        <div className="absolute top-3 right-3 bg-black/80 border border-border rounded p-3">
          <div className={`text-sm font-bold ${useInstancing ? 'text-green-400' : 'text-red-400'}`}>
            {useInstancing ? 'INSTANCED' : 'INDIVIDUAL'}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {useInstancing ? '1 draw call!' : `${Math.min(500, instanceCount)} draw calls`}
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={() => setUseInstancing(!useInstancing)}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              useInstancing ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            <Zap size={16} />
            {useInstancing ? 'Instancing ON' : 'Instancing OFF'}
          </button>
          
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-text-secondary">Count:</span>
            <input
              type="range"
              min="100"
              max="10000"
              step="100"
              value={instanceCount}
              onChange={(e) => setInstanceCount(parseInt(e.target.value))}
              className="flex-1 max-w-xs"
            />
            <span className="text-sm w-16">{instanceCount.toLocaleString()}</span>
          </div>
        </div>
        
        <p className="text-sm text-text-secondary mt-3">
          <strong className="text-white">Instancing</strong> renders thousands of identical objects in a single draw call. 
          Without instancing, each object needs its own draw call — devastating for performance!
          {!useInstancing && <span className="text-yellow-400"> (Limited to 500 for demo stability)</span>}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// DRAW CALL ANALYZER
// ============================================================================

export function DrawCallAnalyzer() {
  const [batching, setBatching] = useState(true);
  const [objectCount, setObjectCount] = useState(20);
  const [stats, setStats] = useState({ drawCalls: 0, materials: 0, geometries: 0 });

  function BatchedScene() {
    const groupRef = useRef<THREE.Group>(null);
    const { gl } = useThree();
    
    // When batching is ON: share materials and geometries
    // When batching is OFF: unique materials per object
    const sharedGeometry = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, 0.5), []);
    const sharedMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6c5ce7' }), []);
    
    const objects = useMemo(() => {
      const arr: { position: [number, number, number]; color: string }[] = [];
      const gridSize = Math.ceil(Math.sqrt(objectCount));
      for (let i = 0; i < objectCount; i++) {
        arr.push({
          position: [
            (i % gridSize) * 1.2 - (gridSize * 1.2) / 2,
            0,
            Math.floor(i / gridSize) * 1.2 - (gridSize * 1.2) / 2
          ],
          color: `hsl(${(i / objectCount) * 360}, 70%, 50%)`
        });
      }
      return arr;
    }, [objectCount]);
    
    useFrame(() => {
      if (groupRef.current) {
        groupRef.current.rotation.y += 0.005;
      }
      
      setStats({
        drawCalls: gl.info.render.calls,
        materials: gl.info.memory.textures,
        geometries: gl.info.memory.geometries
      });
    });

    return (
      <group ref={groupRef}>
        {objects.map((obj, i) => (
          <mesh
            key={i}
            position={obj.position}
            geometry={batching ? sharedGeometry : undefined}
            material={batching ? sharedMaterial : undefined}
          >
            {!batching && <boxGeometry args={[0.5, 0.5, 0.5]} />}
            {!batching && <meshStandardMaterial color={obj.color} />}
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="h-[400px] relative">
        <Canvas>
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} />
          
          <BatchedScene />
          
          <gridHelper args={[20, 20, '#333', '#222']} />
          <OrbitControls enablePan={false} />
          <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={50} />
        </Canvas>
        
        {/* Stats comparison */}
        <div className="absolute top-3 left-3 bg-black/80 border border-border rounded p-3">
          <div className="text-sm font-semibold mb-2">Render Stats</div>
          <div className="text-xs font-mono space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-text-secondary">Draw Calls:</span>
              <span className={batching ? 'text-green-400' : 'text-red-400'}>{stats.drawCalls}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-secondary">Geometries:</span>
              <span className={batching ? 'text-green-400' : 'text-red-400'}>{stats.geometries}</span>
            </div>
          </div>
        </div>
        
        {/* Mode comparison */}
        <div className="absolute top-3 right-3 bg-black/80 border border-border rounded p-3">
          <div className={`text-sm font-bold ${batching ? 'text-green-400' : 'text-red-400'}`}>
            {batching ? 'BATCHED' : 'UNBATCHED'}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {batching ? 'Shared materials & geometry' : 'Unique per object'}
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-border">
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={() => setBatching(!batching)}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              batching ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            <Copy size={16} />
            {batching ? 'Batching ON' : 'Batching OFF'}
          </button>
          
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-text-secondary">Objects:</span>
            <input
              type="range"
              min="5"
              max="50"
              value={objectCount}
              onChange={(e) => setObjectCount(parseInt(e.target.value))}
              className="flex-1 max-w-xs"
            />
            <span className="text-sm w-8">{objectCount}</span>
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
            <div className="font-semibold text-green-400 mb-1">With Batching</div>
            <ul className="text-xs text-text-secondary space-y-1">
              <li>• Shared geometry = 1 GPU buffer</li>
              <li>• Shared material = 1 shader switch</li>
              <li>• Fewer draw calls = faster!</li>
            </ul>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
            <div className="font-semibold text-red-400 mb-1">Without Batching</div>
            <ul className="text-xs text-text-secondary space-y-1">
              <li>• Unique geometry per object</li>
              <li>• Unique material per object</li>
              <li>• GPU state changes = slow!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// OPTIMIZATION COMPARISON
// ============================================================================

export function OptimizationComparison() {
  const [optimized, setOptimized] = useState(false);
  const [stats, setStats] = useState({ fps: 0, drawCalls: 0, triangles: 0 });

  function UnoptimizedScene() {
    const { gl } = useThree();
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    
    // Create 100 individual spheres with unique materials
    const objects = useMemo(() => {
      const arr: { position: [number, number, number]; color: string }[] = [];
      for (let i = 0; i < 100; i++) {
        arr.push({
          position: [
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 15
          ],
          color: `hsl(${Math.random() * 360}, 70%, 50%)`
        });
      }
      return arr;
    }, []);
    
    useFrame(() => {
      frameCount.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setStats({
          fps: frameCount.current,
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles
        });
        frameCount.current = 0;
        lastTime.current = now;
      }
    });

    return (
      <>
        {objects.map((obj, i) => (
          <mesh key={i} position={obj.position}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial color={obj.color} />
          </mesh>
        ))}
      </>
    );
  }

  function OptimizedScene() {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { gl } = useThree();
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const positions = useMemo(() => {
      const arr: [number, number, number][] = [];
      for (let i = 0; i < 1000; i++) { // 10x more objects!
        arr.push([
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 15
        ]);
      }
      return arr;
    }, []);
    
    useEffect(() => {
      if (!meshRef.current) return;
      
      positions.forEach((pos, i) => {
        dummy.position.set(...pos);
        dummy.scale.setScalar(0.3);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }, [positions, dummy]);
    
    useFrame(() => {
      frameCount.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setStats({
          fps: frameCount.current,
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles
        });
        frameCount.current = 0;
        lastTime.current = now;
      }
    });

    return (
      <instancedMesh ref={meshRef} args={[undefined, undefined, 1000]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#6c5ce7" />
      </instancedMesh>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
      <div className="h-[400px] relative">
        <Canvas>
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} />
          
          {optimized ? <OptimizedScene /> : <UnoptimizedScene />}
          
          <gridHelper args={[20, 20, '#333', '#222']} />
          <OrbitControls />
          <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} />
        </Canvas>
        
        {/* Comparison stats */}
        <div className="absolute top-3 left-3 bg-black/80 border border-border rounded p-3">
          <div className={`text-lg font-bold mb-2 ${optimized ? 'text-green-400' : 'text-red-400'}`}>
            {optimized ? 'OPTIMIZED' : 'UNOPTIMIZED'}
          </div>
          <div className="text-xs font-mono space-y-1">
            <div>Objects: <span className="text-accent">{optimized ? '1,000' : '100'}</span></div>
            <div className={stats.fps >= 50 ? 'text-green-400' : stats.fps >= 30 ? 'text-yellow-400' : 'text-red-400'}>
              FPS: {stats.fps}
            </div>
            <div>Draw Calls: <span className={optimized ? 'text-green-400' : 'text-red-400'}>{stats.drawCalls}</span></div>
            <div>Triangles: {stats.triangles.toLocaleString()}</div>
          </div>
        </div>
        
        {/* Techniques used */}
        <div className="absolute top-3 right-3 bg-black/80 border border-border rounded p-3 max-w-[200px]">
          <div className="text-xs">
            {optimized ? (
              <ul className="space-y-1 text-green-400">
                <li className="flex items-center gap-1"><Zap size={12} /> Instancing (1000 objects)</li>
                <li className="flex items-center gap-1"><Layers size={12} /> LOD (8 segments)</li>
                <li className="flex items-center gap-1"><Copy size={12} /> Shared material</li>
              </ul>
            ) : (
              <ul className="space-y-1 text-red-400">
                <li>Individual meshes</li>
                <li>High poly (32 segments)</li>
                <li>Unique materials</li>
              </ul>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-border">
        <button
          onClick={() => setOptimized(!optimized)}
          className={`w-full py-3 rounded font-semibold flex items-center justify-center gap-2 transition-colors ${
            optimized 
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          }`}
        >
          <RefreshCw size={18} />
          Switch to {optimized ? 'UNOPTIMIZED' : 'OPTIMIZED'}
        </button>
        
        <p className="text-sm text-text-secondary mt-3 text-center">
          The optimized version renders <strong className="text-white">10x more objects</strong> with 
          <strong className="text-white"> better performance</strong>!
        </p>
      </div>
    </div>
  );
}
