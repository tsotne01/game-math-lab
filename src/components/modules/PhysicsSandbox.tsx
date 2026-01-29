import { useState, useRef, useCallback, Suspense, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line, Text } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider, useRapier, RapierRigidBody, useRevoluteJoint, useSphericalJoint, usePrismaticJoint } from '@react-three/rapier';
import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

type BodyType = 'dynamic' | 'fixed' | 'kinematicPosition';
type ShapeType = 'box' | 'sphere' | 'capsule' | 'cylinder' | 'cone';
type JointType = 'revolute' | 'spherical' | 'prismatic' | 'fixed';

interface PhysicsObject {
  id: string;
  type: BodyType;
  shape: ShapeType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  mass: number;
  restitution: number;
  friction: number;
  velocity?: [number, number, number];
}

interface ForceArrow {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  label: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  dynamic: '#6c5ce7',
  static: '#636e72',
  kinematic: '#00b894',
  accent: '#00b894',
  ground: '#2d3436',
  selected: '#ffd43b',
};

const SHAPE_COLORS = ['#6c5ce7', '#e17055', '#00b894', '#0984e3', '#fdcb6e', '#a29bfe', '#74b9ff', '#ff7675'];

// ============================================================================
// LOADING COMPONENT
// ============================================================================

function LoadingFallback() {
  return (
    <Html center>
      <div className="text-white text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm text-text-secondary">Loading physics...</p>
      </div>
    </Html>
  );
}

// ============================================================================
// PHYSICS OBJECTS
// ============================================================================

interface PhysicsBoxProps {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  type: BodyType;
  restitution: number;
  friction: number;
  onSelect?: () => void;
  selected?: boolean;
  showCollider?: boolean;
  rigidBodyRef?: React.RefObject<RapierRigidBody>;
}

function PhysicsBox({ position, scale, color, type, restitution, friction, onSelect, selected, showCollider, rigidBodyRef }: PhysicsBoxProps) {
  const internalRef = useRef<RapierRigidBody>(null);
  const ref = rigidBodyRef || internalRef;
  
  return (
    <RigidBody
      ref={ref}
      type={type}
      position={position}
      restitution={restitution}
      friction={friction}
      colliders="cuboid"
    >
      <mesh onClick={onSelect} castShadow receiveShadow>
        <boxGeometry args={scale} />
        <meshStandardMaterial color={selected ? COLORS.selected : color} />
      </mesh>
      {showCollider && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...scale)]} />
          <lineBasicMaterial color="#00ff00" />
        </lineSegments>
      )}
    </RigidBody>
  );
}

interface PhysicsSphereProps {
  position: [number, number, number];
  radius: number;
  color: string;
  type: BodyType;
  restitution: number;
  friction: number;
  onSelect?: () => void;
  selected?: boolean;
  showCollider?: boolean;
  rigidBodyRef?: React.RefObject<RapierRigidBody>;
}

function PhysicsSphere({ position, radius, color, type, restitution, friction, onSelect, selected, showCollider, rigidBodyRef }: PhysicsSphereProps) {
  const internalRef = useRef<RapierRigidBody>(null);
  const ref = rigidBodyRef || internalRef;
  
  return (
    <RigidBody
      ref={ref}
      type={type}
      position={position}
      restitution={restitution}
      friction={friction}
      colliders="ball"
    >
      <mesh onClick={onSelect} castShadow receiveShadow>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial color={selected ? COLORS.selected : color} />
      </mesh>
      {showCollider && (
        <mesh>
          <sphereGeometry args={[radius, 16, 16]} />
          <meshBasicMaterial color="#00ff00" wireframe />
        </mesh>
      )}
    </RigidBody>
  );
}

interface PhysicsCapsuleProps {
  position: [number, number, number];
  radius: number;
  height: number;
  color: string;
  type: BodyType;
  restitution: number;
  friction: number;
  onSelect?: () => void;
  selected?: boolean;
  showCollider?: boolean;
}

function PhysicsCapsule({ position, radius, height, color, type, restitution, friction, onSelect, selected, showCollider }: PhysicsCapsuleProps) {
  return (
    <RigidBody
      type={type}
      position={position}
      restitution={restitution}
      friction={friction}
      colliders={false}
    >
      <CapsuleCollider args={[height / 2, radius]} />
      <mesh onClick={onSelect} castShadow receiveShadow>
        <capsuleGeometry args={[radius, height, 16, 32]} />
        <meshStandardMaterial color={selected ? COLORS.selected : color} />
      </mesh>
      {showCollider && (
        <mesh>
          <capsuleGeometry args={[radius, height, 8, 16]} />
          <meshBasicMaterial color="#00ff00" wireframe />
        </mesh>
      )}
    </RigidBody>
  );
}

interface PhysicsCylinderProps {
  position: [number, number, number];
  radius: number;
  height: number;
  color: string;
  type: BodyType;
  restitution: number;
  friction: number;
  onSelect?: () => void;
  selected?: boolean;
  showCollider?: boolean;
}

function PhysicsCylinder({ position, radius, height, color, type, restitution, friction, onSelect, selected, showCollider }: PhysicsCylinderProps) {
  return (
    <RigidBody
      type={type}
      position={position}
      restitution={restitution}
      friction={friction}
      colliders="hull"
    >
      <mesh onClick={onSelect} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 32]} />
        <meshStandardMaterial color={selected ? COLORS.selected : color} />
      </mesh>
      {showCollider && (
        <mesh>
          <cylinderGeometry args={[radius, radius, height, 16]} />
          <meshBasicMaterial color="#00ff00" wireframe />
        </mesh>
      )}
    </RigidBody>
  );
}

// ============================================================================
// GROUND PLANE
// ============================================================================

function Ground({ size = 30 }: { size?: number }) {
  return (
    <RigidBody type="fixed" friction={0.8} restitution={0.3}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={COLORS.ground} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[size, size, size, size]} />
        <meshBasicMaterial color="#3d4448" wireframe />
      </mesh>
    </RigidBody>
  );
}

// ============================================================================
// WALLS
// ============================================================================

function Walls({ size = 15 }: { size?: number }) {
  const wallHeight = 3;
  const wallThickness = 0.5;
  
  return (
    <>
      {/* Back wall */}
      <RigidBody type="fixed" position={[0, wallHeight / 2, -size / 2]}>
        <mesh receiveShadow>
          <boxGeometry args={[size, wallHeight, wallThickness]} />
          <meshStandardMaterial color="#3d4448" transparent opacity={0.3} />
        </mesh>
      </RigidBody>
      {/* Left wall */}
      <RigidBody type="fixed" position={[-size / 2, wallHeight / 2, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[wallThickness, wallHeight, size]} />
          <meshStandardMaterial color="#3d4448" transparent opacity={0.3} />
        </mesh>
      </RigidBody>
      {/* Right wall */}
      <RigidBody type="fixed" position={[size / 2, wallHeight / 2, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[wallThickness, wallHeight, size]} />
          <meshStandardMaterial color="#3d4448" transparent opacity={0.3} />
        </mesh>
      </RigidBody>
    </>
  );
}

// ============================================================================
// FORCE ARROW
// ============================================================================

function ForceArrowComponent({ start, end, color, label }: { start: THREE.Vector3; end: THREE.Vector3; color: string; label: string }) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length < 0.1) return null;
  
  const arrowHelper = useMemo(() => {
    const dir = direction.clone().normalize();
    return { direction: dir, length };
  }, [direction, length]);
  
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  
  return (
    <group>
      <Line
        points={[start, end]}
        color={color}
        lineWidth={3}
      />
      <mesh position={end}>
        <coneGeometry args={[0.1, 0.3, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={mid} center>
        <div className="bg-black/80 px-1 py-0.5 rounded text-[10px] text-white whitespace-nowrap">
          {label}
        </div>
      </Html>
    </group>
  );
}

// ============================================================================
// SPAWNER (for shooting objects)
// ============================================================================

interface SpawnedObject {
  id: string;
  shape: ShapeType;
  position: [number, number, number];
  velocity: [number, number, number];
  color: string;
  restitution: number;
  friction: number;
}

function SpawnedBall({ id, position, velocity, color, restitution, friction }: SpawnedObject) {
  const ref = useRef<RapierRigidBody>(null);
  const initialized = useRef(false);
  
  useEffect(() => {
    if (ref.current && !initialized.current) {
      ref.current.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true);
      initialized.current = true;
    }
  }, [velocity]);
  
  return (
    <RigidBody ref={ref} position={position} restitution={restitution} friction={friction} colliders="ball">
      <mesh castShadow>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}

function SpawnedBox({ id, position, velocity, color, restitution, friction }: SpawnedObject) {
  const ref = useRef<RapierRigidBody>(null);
  const initialized = useRef(false);
  
  useEffect(() => {
    if (ref.current && !initialized.current) {
      ref.current.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true);
      initialized.current = true;
    }
  }, [velocity]);
  
  return (
    <RigidBody ref={ref} position={position} restitution={restitution} friction={friction} colliders="cuboid">
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}

// ============================================================================
// DOMINO CHAIN
// ============================================================================

function DominoChain({ count = 15, startX = -7 }: { count?: number; startX?: number }) {
  const dominoes = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: `domino-${i}`,
      position: [startX + i * 0.6, 1, 0] as [number, number, number],
    }));
  }, [count, startX]);
  
  return (
    <>
      {dominoes.map((domino) => (
        <RigidBody key={domino.id} position={domino.position} restitution={0.1} friction={0.7}>
          <mesh castShadow>
            <boxGeometry args={[0.1, 1, 0.5]} />
            <meshStandardMaterial color="#e17055" />
          </mesh>
        </RigidBody>
      ))}
      {/* Trigger ball */}
      <RigidBody position={[startX - 2, 1, 0]} restitution={0.3} friction={0.5} colliders="ball">
        <mesh castShadow>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial color="#fdcb6e" />
        </mesh>
      </RigidBody>
    </>
  );
}

// ============================================================================
// STACKING TOWER
// ============================================================================

function StackingTower({ layers = 6, position = [0, 0, 0] as [number, number, number] }: { layers?: number; position?: [number, number, number] }) {
  const blocks = useMemo(() => {
    const result: Array<{ id: string; position: [number, number, number]; rotation: [number, number, number] }> = [];
    
    for (let layer = 0; layer < layers; layer++) {
      const rotate = layer % 2 === 0;
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 0.7;
        result.push({
          id: `block-${layer}-${i}`,
          position: [
            position[0] + (rotate ? 0 : offset),
            position[1] + 0.25 + layer * 0.5,
            position[2] + (rotate ? offset : 0),
          ],
          rotation: [0, rotate ? Math.PI / 2 : 0, 0],
        });
      }
    }
    return result;
  }, [layers, position]);
  
  return (
    <>
      {blocks.map((block) => (
        <RigidBody key={block.id} position={block.position} rotation={block.rotation} restitution={0.1} friction={0.6}>
          <mesh castShadow>
            <boxGeometry args={[0.6, 0.5, 2]} />
            <meshStandardMaterial color="#74b9ff" />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

// ============================================================================
// RAGDOLL (Simplified)
// ============================================================================

interface RagdollProps {
  position: [number, number, number];
}

function Ragdoll({ position }: RagdollProps) {
  const torsoRef = useRef<RapierRigidBody>(null!);
  const headRef = useRef<RapierRigidBody>(null!);
  const leftArmRef = useRef<RapierRigidBody>(null!);
  const rightArmRef = useRef<RapierRigidBody>(null!);
  const leftLegRef = useRef<RapierRigidBody>(null!);
  const rightLegRef = useRef<RapierRigidBody>(null!);
  
  // Joints
  useSphericalJoint(torsoRef, headRef, [
    [0, 0.6, 0],
    [0, -0.2, 0],
  ]);
  
  useSphericalJoint(torsoRef, leftArmRef, [
    [-0.4, 0.4, 0],
    [0.3, 0, 0],
  ]);
  
  useSphericalJoint(torsoRef, rightArmRef, [
    [0.4, 0.4, 0],
    [-0.3, 0, 0],
  ]);
  
  useSphericalJoint(torsoRef, leftLegRef, [
    [-0.15, -0.5, 0],
    [0, 0.4, 0],
  ]);
  
  useSphericalJoint(torsoRef, rightLegRef, [
    [0.15, -0.5, 0],
    [0, 0.4, 0],
  ]);
  
  return (
    <group>
      {/* Torso */}
      <RigidBody ref={torsoRef} position={[position[0], position[1], position[2]]} restitution={0.3} friction={0.5}>
        <mesh castShadow>
          <capsuleGeometry args={[0.25, 0.6, 8, 16]} />
          <meshStandardMaterial color="#e17055" />
        </mesh>
      </RigidBody>
      
      {/* Head */}
      <RigidBody ref={headRef} position={[position[0], position[1] + 0.8, position[2]]} restitution={0.3} friction={0.5} colliders="ball">
        <mesh castShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#ffeaa7" />
        </mesh>
      </RigidBody>
      
      {/* Left Arm */}
      <RigidBody ref={leftArmRef} position={[position[0] - 0.6, position[1] + 0.4, position[2]]} restitution={0.3} friction={0.5}>
        <mesh castShadow>
          <capsuleGeometry args={[0.08, 0.5, 8, 16]} />
          <meshStandardMaterial color="#ffeaa7" />
        </mesh>
      </RigidBody>
      
      {/* Right Arm */}
      <RigidBody ref={rightArmRef} position={[position[0] + 0.6, position[1] + 0.4, position[2]]} restitution={0.3} friction={0.5}>
        <mesh castShadow>
          <capsuleGeometry args={[0.08, 0.5, 8, 16]} />
          <meshStandardMaterial color="#ffeaa7" />
        </mesh>
      </RigidBody>
      
      {/* Left Leg */}
      <RigidBody ref={leftLegRef} position={[position[0] - 0.15, position[1] - 0.9, position[2]]} restitution={0.3} friction={0.5}>
        <mesh castShadow>
          <capsuleGeometry args={[0.1, 0.7, 8, 16]} />
          <meshStandardMaterial color="#0984e3" />
        </mesh>
      </RigidBody>
      
      {/* Right Leg */}
      <RigidBody ref={rightLegRef} position={[position[0] + 0.15, position[1] - 0.9, position[2]]} restitution={0.3} friction={0.5}>
        <mesh castShadow>
          <capsuleGeometry args={[0.1, 0.7, 8, 16]} />
          <meshStandardMaterial color="#0984e3" />
        </mesh>
      </RigidBody>
    </group>
  );
}

// ============================================================================
// COLLISION SHAPE COMPARISON
// ============================================================================

interface ShapeComparisonProps {
  position: [number, number, number];
}

function CollisionShapeComparison({ position }: ShapeComparisonProps) {
  // Same visual mesh (torus-like shape made of boxes), different colliders
  const VisualMesh = ({ color }: { color: string }) => (
    <mesh castShadow>
      <torusGeometry args={[0.5, 0.2, 16, 32]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
  
  return (
    <group position={position}>
      {/* Box collider */}
      <RigidBody position={[-2, 3, 0]} restitution={0.5} friction={0.5} colliders="cuboid">
        <VisualMesh color="#e17055" />
        <Html position={[0, 1, 0]} center>
          <div className="bg-black/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">Box Collider</div>
        </Html>
      </RigidBody>
      
      {/* Ball collider */}
      <RigidBody position={[0, 3, 0]} restitution={0.5} friction={0.5} colliders="ball">
        <VisualMesh color="#00b894" />
        <Html position={[0, 1, 0]} center>
          <div className="bg-black/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">Ball Collider</div>
        </Html>
      </RigidBody>
      
      {/* Hull collider */}
      <RigidBody position={[2, 3, 0]} restitution={0.5} friction={0.5} colliders="hull">
        <VisualMesh color="#6c5ce7" />
        <Html position={[0, 1, 0]} center>
          <div className="bg-black/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">Hull Collider</div>
        </Html>
      </RigidBody>
    </group>
  );
}

// ============================================================================
// JOINT PLAYGROUND
// ============================================================================

function RevoluteJointDemo({ position }: { position: [number, number, number] }) {
  const anchorRef = useRef<RapierRigidBody>(null!);
  const pendulumRef = useRef<RapierRigidBody>(null!);
  
  useRevoluteJoint(anchorRef, pendulumRef, [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  
  return (
    <group position={position}>
      <RigidBody ref={anchorRef} type="fixed" position={[0, 3, 0]}>
        <mesh>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color="#636e72" />
        </mesh>
      </RigidBody>
      <RigidBody ref={pendulumRef} position={[0, 2, 0]} restitution={0.3} friction={0.5}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 2, 0.3]} />
          <meshStandardMaterial color="#e17055" />
        </mesh>
      </RigidBody>
      <Html position={[0, 4, 0]} center>
        <div className="bg-black/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">Revolute (Hinge)</div>
      </Html>
    </group>
  );
}

function SphericalJointDemo({ position }: { position: [number, number, number] }) {
  const anchorRef = useRef<RapierRigidBody>(null!);
  const ballRef = useRef<RapierRigidBody>(null!);
  
  useSphericalJoint(anchorRef, ballRef, [
    [0, 0, 0],
    [0, 1.5, 0],
  ]);
  
  return (
    <group position={position}>
      <RigidBody ref={anchorRef} type="fixed" position={[0, 3, 0]}>
        <mesh>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color="#636e72" />
        </mesh>
      </RigidBody>
      <RigidBody ref={ballRef} position={[0.5, 1.5, 0.5]} restitution={0.3} friction={0.5} colliders="ball">
        <mesh castShadow>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial color="#00b894" />
        </mesh>
      </RigidBody>
      <Html position={[0, 4, 0]} center>
        <div className="bg-black/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">Spherical (Ball)</div>
      </Html>
    </group>
  );
}

function PrismaticJointDemo({ position }: { position: [number, number, number] }) {
  const anchorRef = useRef<RapierRigidBody>(null!);
  const sliderRef = useRef<RapierRigidBody>(null!);
  
  usePrismaticJoint(anchorRef, sliderRef, [
    [0, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [-1, 1],
  ]);
  
  return (
    <group position={position}>
      <RigidBody ref={anchorRef} type="fixed" position={[0, 1.5, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 3, 0.1]} />
          <meshStandardMaterial color="#636e72" transparent opacity={0.5} />
        </mesh>
      </RigidBody>
      <RigidBody ref={sliderRef} position={[0, 2, 0]} restitution={0.5} friction={0.2}>
        <mesh castShadow>
          <boxGeometry args={[0.6, 0.4, 0.4]} />
          <meshStandardMaterial color="#6c5ce7" />
        </mesh>
      </RigidBody>
      <Html position={[0, 4, 0]} center>
        <div className="bg-black/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">Prismatic (Slider)</div>
      </Html>
    </group>
  );
}

function JointPlayground({ visible }: { visible: boolean }) {
  if (!visible) return null;
  
  return (
    <group position={[0, 0, -5]}>
      <RevoluteJointDemo position={[-3, 0, 0]} />
      <SphericalJointDemo position={[0, 0, 0]} />
      <PrismaticJointDemo position={[3, 0, 0]} />
    </group>
  );
}

// ============================================================================
// FORCE VISUALIZER
// ============================================================================

interface ForceVisualizerObjectProps {
  position: [number, number, number];
  showForces: boolean;
}

function ForceVisualizerObject({ position, showForces }: ForceVisualizerObjectProps) {
  const ref = useRef<RapierRigidBody>(null);
  const [forces, setForces] = useState<ForceArrow[]>([]);
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (ref.current && showForces && meshRef.current) {
      const pos = ref.current.translation();
      const vel = ref.current.linvel();
      const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
      
      const arrows: ForceArrow[] = [];
      
      // Gravity arrow
      arrows.push({
        id: 'gravity',
        start: worldPos.clone(),
        end: worldPos.clone().add(new THREE.Vector3(0, -1, 0)),
        color: '#e17055',
        label: 'Gravity',
      });
      
      // Velocity arrow
      if (Math.abs(vel.x) > 0.1 || Math.abs(vel.y) > 0.1 || Math.abs(vel.z) > 0.1) {
        const velVec = new THREE.Vector3(vel.x, vel.y, vel.z).multiplyScalar(0.3);
        arrows.push({
          id: 'velocity',
          start: worldPos.clone(),
          end: worldPos.clone().add(velVec),
          color: '#00b894',
          label: `v: ${velVec.length().toFixed(1)}`,
        });
      }
      
      setForces(arrows);
    }
  });
  
  return (
    <group>
      <RigidBody ref={ref} position={position} restitution={0.6} friction={0.3} colliders="ball">
        <mesh ref={meshRef} castShadow>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial color="#fdcb6e" />
        </mesh>
      </RigidBody>
      {showForces && forces.map((arrow) => (
        <ForceArrowComponent key={arrow.id} {...arrow} />
      ))}
    </group>
  );
}

// ============================================================================
// RAYCASTER
// ============================================================================

interface RaycastPickerProps {
  enabled: boolean;
  onHit: (point: THREE.Vector3, normal: THREE.Vector3) => void;
}

function RaycastPicker({ enabled, onHit }: RaycastPickerProps) {
  const { rapier, world } = useRapier();
  const { camera, pointer, gl } = useThree();
  const [rayLine, setRayLine] = useState<{ start: THREE.Vector3; end: THREE.Vector3 } | null>(null);
  
  const handleClick = useCallback((event: MouseEvent) => {
    if (!enabled) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    
    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;
    
    const ray = new rapier.Ray(origin, direction);
    const hit = world.castRay(ray, 50, true);
    
    if (hit) {
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      const hitPointVec = new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z);
      const normal = new THREE.Vector3(0, 1, 0); // Simplified
      
      setRayLine({
        start: origin.clone(),
        end: hitPointVec,
      });
      
      onHit(hitPointVec, normal);
      
      setTimeout(() => setRayLine(null), 500);
    }
  }, [enabled, camera, pointer, rapier, world, onHit]);
  
  useEffect(() => {
    if (enabled) {
      gl.domElement.addEventListener('click', handleClick);
      return () => gl.domElement.removeEventListener('click', handleClick);
    }
  }, [enabled, gl.domElement, handleClick]);
  
  return rayLine ? (
    <Line
      points={[rayLine.start, rayLine.end]}
      color="#ff6b6b"
      lineWidth={2}
    />
  ) : null;
}

// ============================================================================
// MAIN PHYSICS SCENE
// ============================================================================

interface PhysicsSceneProps {
  gravity: [number, number, number];
  spawnedObjects: SpawnedObject[];
  showDebug: boolean;
  demo: 'sandbox' | 'domino' | 'tower' | 'ragdoll' | 'shapes' | 'joints' | 'forces';
  restitution: number;
  friction: number;
  raycastMode: boolean;
  onRaycastHit: (point: THREE.Vector3) => void;
}

function PhysicsScene({ gravity, spawnedObjects, showDebug, demo, restitution, friction, raycastMode, onRaycastHit }: PhysicsSceneProps) {
  return (
    <Physics gravity={gravity} debug={showDebug}>
      <Ground />
      <Walls />
      
      {/* Demo-specific content */}
      {demo === 'domino' && <DominoChain count={20} startX={-8} />}
      {demo === 'tower' && <StackingTower layers={8} position={[0, 0, 0]} />}
      {demo === 'ragdoll' && <Ragdoll position={[0, 5, 0]} />}
      {demo === 'shapes' && <CollisionShapeComparison position={[0, 0, 0]} />}
      {demo === 'joints' && <JointPlayground visible={true} />}
      {demo === 'forces' && <ForceVisualizerObject position={[0, 5, 0]} showForces={true} />}
      
      {/* Spawned objects */}
      {spawnedObjects.map((obj) => 
        obj.shape === 'sphere' ? (
          <SpawnedBall key={obj.id} {...obj} />
        ) : (
          <SpawnedBox key={obj.id} {...obj} />
        )
      )}
      
      {/* Raycast picker */}
      <RaycastPicker 
        enabled={raycastMode} 
        onHit={(point) => onRaycastHit(point)} 
      />
    </Physics>
  );
}

// ============================================================================
// MAIN PHYSICS SANDBOX COMPONENT
// ============================================================================

export default function PhysicsSandbox() {
  const [gravity, setGravity] = useState<[number, number, number]>([0, -9.81, 0]);
  const [restitution, setRestitution] = useState(0.5);
  const [friction, setFriction] = useState(0.5);
  const [spawnedObjects, setSpawnedObjects] = useState<SpawnedObject[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [demo, setDemo] = useState<'sandbox' | 'domino' | 'tower' | 'ragdoll' | 'shapes' | 'joints' | 'forces'>('sandbox');
  const [spawnShape, setSpawnShape] = useState<'sphere' | 'box'>('sphere');
  const [raycastMode, setRaycastMode] = useState(false);
  const [physicsKey, setPhysicsKey] = useState(0);
  
  const spawnObject = useCallback((velocity: [number, number, number] = [0, 0, -15]) => {
    const newObj: SpawnedObject = {
      id: `obj-${Date.now()}-${Math.random()}`,
      shape: spawnShape,
      position: [0, 8, 10],
      velocity,
      color: SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)],
      restitution,
      friction,
    };
    setSpawnedObjects((prev) => [...prev.slice(-50), newObj]); // Keep max 50 objects
  }, [spawnShape, restitution, friction]);
  
  const clearObjects = useCallback(() => {
    setSpawnedObjects([]);
  }, []);
  
  const resetScene = useCallback(() => {
    setSpawnedObjects([]);
    setPhysicsKey((k) => k + 1);
  }, []);
  
  const handleRaycastHit = useCallback((point: THREE.Vector3) => {
    // Spawn object at hit point
    const newObj: SpawnedObject = {
      id: `obj-${Date.now()}-${Math.random()}`,
      shape: 'sphere',
      position: [point.x, point.y + 2, point.z],
      velocity: [0, 0, 0],
      color: '#ff6b6b',
      restitution,
      friction,
    };
    setSpawnedObjects((prev) => [...prev.slice(-50), newObj]);
  }, [restitution, friction]);
  
  return (
    <div 
      className="relative w-full aspect-[4/3] md:aspect-[4/3] aspect-square bg-bg-secondary rounded-xl overflow-hidden border border-border"
      role="application"
      aria-label="3D Physics Sandbox - Interactive physics simulation"
    >
      <Canvas
        camera={{ position: [15, 15, 15], fov: 50 }}
        shadows
      >
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={1}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-far={50}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          
          <PhysicsScene
            key={physicsKey}
            gravity={gravity}
            spawnedObjects={spawnedObjects}
            showDebug={showDebug}
            demo={demo}
            restitution={restitution}
            friction={friction}
            raycastMode={raycastMode}
            onRaycastHit={handleRaycastHit}
          />
          
          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        </Suspense>
      </Canvas>
      
      {/* Control Panel */}
      <div 
        className="absolute top-2 left-2 md:top-4 md:left-4 bg-black/80 rounded-lg p-3 md:p-4 text-white text-sm max-w-[240px] md:max-w-[280px] max-h-[calc(100%-1rem)] md:max-h-[calc(100%-2rem)] overflow-y-auto"
        role="region"
        aria-label="Physics Controls"
      >
        <h3 className="font-bold text-accent mb-3 flex items-center gap-2" id="physics-controls-heading">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Physics Controls
        </h3>
        
        {/* Demo Selector */}
        <div className="mb-3">
          <label htmlFor="demo-select" className="block text-text-secondary text-xs mb-1">Demo Scene</label>
          <select 
            id="demo-select"
            value={demo} 
            onChange={(e) => { setDemo(e.target.value as any); resetScene(); }}
            className="w-full bg-bg-card border border-border rounded px-2 py-1 text-xs"
          >
            <option value="sandbox">Free Sandbox</option>
            <option value="domino">Domino Chain</option>
            <option value="tower">Stacking Tower</option>
            <option value="ragdoll">Ragdoll</option>
            <option value="shapes">Collision Shapes</option>
            <option value="joints">Joint Types</option>
            <option value="forces">Force Visualizer</option>
          </select>
        </div>
        
        {/* Gravity */}
        <div className="mb-3">
          <label htmlFor="gravity-slider" className="block text-text-secondary text-xs mb-1">
            Gravity Y: {gravity[1].toFixed(1)}
          </label>
          <input
            id="gravity-slider"
            type="range"
            min="-20"
            max="0"
            step="0.1"
            value={gravity[1]}
            onChange={(e) => setGravity([0, parseFloat(e.target.value), 0])}
            className="w-full accent-accent"
            aria-label={`Gravity strength: ${gravity[1].toFixed(1)}`}
          />
        </div>
        
        {/* Restitution */}
        <div className="mb-3">
          <label htmlFor="restitution-slider" className="block text-text-secondary text-xs mb-1">
            Bounciness: {restitution.toFixed(2)}
          </label>
          <input
            id="restitution-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={restitution}
            onChange={(e) => setRestitution(parseFloat(e.target.value))}
            className="w-full accent-accent"
            aria-label={`Bounciness: ${restitution.toFixed(2)}`}
          />
        </div>
        
        {/* Friction */}
        <div className="mb-3">
          <label htmlFor="friction-slider" className="block text-text-secondary text-xs mb-1">
            Friction: {friction.toFixed(2)}
          </label>
          <input
            id="friction-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={friction}
            onChange={(e) => setFriction(parseFloat(e.target.value))}
            className="w-full accent-accent"
            aria-label={`Friction: ${friction.toFixed(2)}`}
          />
        </div>
        
        {/* Spawn Controls */}
        <div className="mb-3 flex gap-2">
          <label htmlFor="spawn-shape" className="sr-only">Select shape to spawn</label>
          <select
            id="spawn-shape"
            value={spawnShape}
            onChange={(e) => setSpawnShape(e.target.value as 'sphere' | 'box')}
            className="flex-1 bg-bg-card border border-border rounded px-2 py-1 text-xs"
            aria-label="Shape to spawn"
          >
            <option value="sphere">Sphere</option>
            <option value="box">Box</option>
          </select>
          <button
            onClick={() => spawnObject()}
            className="px-3 py-1 bg-accent text-black rounded text-xs font-bold hover:bg-accent/80 touch-manipulation"
            aria-label={`Shoot a ${spawnShape} into the scene`}
          >
            Shoot
          </button>
        </div>
        
        {/* Debug & Controls */}
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Display options">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="accent-accent"
              aria-label="Toggle debug view showing collision shapes"
            />
            Debug View
          </label>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={raycastMode}
              onChange={(e) => setRaycastMode(e.target.checked)}
              className="accent-accent"
              aria-label="Toggle raycast picking mode"
            />
            Raycast Pick
          </label>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2" role="group" aria-label="Scene actions">
          <button
            onClick={clearObjects}
            className="flex-1 px-2 py-1 bg-[#636e72] text-white rounded text-xs font-bold hover:bg-[#636e72]/80 touch-manipulation"
            aria-label="Clear all spawned objects"
          >
            Clear
          </button>
          <button
            onClick={resetScene}
            className="flex-1 px-2 py-1 bg-[#e17055] text-white rounded text-xs font-bold hover:bg-[#e17055]/80 touch-manipulation"
            aria-label="Reset scene to initial state"
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Info Panel */}
      <div 
        className="absolute bottom-2 right-2 md:bottom-4 md:right-4 bg-black/80 rounded-lg p-2 md:p-3 text-white text-xs max-w-[180px] md:max-w-[200px]"
        role="note"
        aria-label="Controls help"
      >
        <p className="text-text-secondary">
          <strong className="text-accent">Drag</strong> to orbit
          <br />
          <strong className="text-accent">Pinch/Scroll</strong> to zoom
          <br />
          <strong className="text-accent">Shoot</strong> to launch objects
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// LESSON DEMOS
// ============================================================================

// Rigid Bodies Demo
export function RigidBodiesDemo() {
  const [physicsKey, setPhysicsKey] = useState(0);
  
  return (
    <div 
      className="relative w-full aspect-video bg-bg-secondary rounded-xl overflow-hidden border border-border"
      role="application"
      aria-label="Rigid Bodies Demo - Shows dynamic, static, and kinematic body types"
    >
      <Canvas camera={{ position: [8, 8, 8], fov: 50 }} shadows>
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
          
          <Physics key={physicsKey} gravity={[0, -9.81, 0]}>
            <Ground size={15} />
            
            {/* Dynamic body - affected by gravity and forces */}
            <RigidBody position={[-2, 5, 0]} restitution={0.6} colliders="ball">
              <mesh castShadow>
                <sphereGeometry args={[0.5, 32, 32]} />
                <meshStandardMaterial color="#6c5ce7" />
              </mesh>
              <Html position={[0, 1, 0]} center>
                <div className="bg-[#6c5ce7] px-2 py-1 rounded text-xs text-white whitespace-nowrap font-bold">Dynamic</div>
              </Html>
            </RigidBody>
            
            {/* Static body - never moves */}
            <RigidBody type="fixed" position={[0, 0.5, 0]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[2, 1, 2]} />
                <meshStandardMaterial color="#636e72" />
              </mesh>
              <Html position={[0, 1, 0]} center>
                <div className="bg-[#636e72] px-2 py-1 rounded text-xs text-white whitespace-nowrap font-bold">Static</div>
              </Html>
            </RigidBody>
            
            {/* Kinematic body - moved by code, not physics */}
            <KinematicBody />
          </Physics>
          
          <OrbitControls />
        </Suspense>
      </Canvas>
      
      <button
        onClick={() => setPhysicsKey((k) => k + 1)}
        className="absolute bottom-4 right-4 px-4 py-2 bg-accent text-black rounded font-bold text-sm hover:bg-accent/80"
      >
        Reset
      </button>
    </div>
  );
}

function KinematicBody() {
  const ref = useRef<RapierRigidBody>(null);
  
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.getElapsedTime();
      ref.current.setNextKinematicTranslation({
        x: 2 + Math.sin(t) * 2,
        y: 1 + Math.sin(t * 2) * 0.5,
        z: 0,
      });
    }
  });
  
  return (
    <RigidBody ref={ref} type="kinematicPosition" position={[2, 1, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#00b894" />
      </mesh>
      <Html position={[0, 1, 0]} center>
        <div className="bg-[#00b894] px-2 py-1 rounded text-xs text-white whitespace-nowrap font-bold">Kinematic</div>
      </Html>
    </RigidBody>
  );
}

// Collision Shapes Demo
export function CollisionShapesDemo() {
  const [physicsKey, setPhysicsKey] = useState(0);
  
  return (
    <div 
      className="relative w-full aspect-video bg-bg-secondary rounded-xl overflow-hidden border border-border"
      role="application"
      aria-label="Collision Shapes Demo - Compares box, sphere, capsule, hull, and trimesh colliders"
    >
      <Canvas camera={{ position: [10, 8, 10], fov: 50 }} shadows>
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
          
          <Physics key={physicsKey} gravity={[0, -9.81, 0]} debug>
            <Ground size={20} />
            
            {/* Box */}
            <RigidBody position={[-4, 3, 0]} colliders="cuboid" restitution={0.5}>
              <mesh castShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#e17055" />
              </mesh>
              <Html position={[0, 1, 0]} center>
                <div className="bg-black/80 px-2 py-1 rounded text-xs text-white">Box</div>
              </Html>
            </RigidBody>
            
            {/* Sphere */}
            <RigidBody position={[-1.5, 3, 0]} colliders="ball" restitution={0.7}>
              <mesh castShadow>
                <sphereGeometry args={[0.5, 32, 32]} />
                <meshStandardMaterial color="#00b894" />
              </mesh>
              <Html position={[0, 1, 0]} center>
                <div className="bg-black/80 px-2 py-1 rounded text-xs text-white">Sphere</div>
              </Html>
            </RigidBody>
            
            {/* Capsule */}
            <RigidBody position={[1, 3, 0]} colliders={false} restitution={0.5}>
              <CapsuleCollider args={[0.5, 0.3]} />
              <mesh castShadow>
                <capsuleGeometry args={[0.3, 1, 16, 32]} />
                <meshStandardMaterial color="#6c5ce7" />
              </mesh>
              <Html position={[0, 1.2, 0]} center>
                <div className="bg-black/80 px-2 py-1 rounded text-xs text-white">Capsule</div>
              </Html>
            </RigidBody>
            
            {/* Convex Hull */}
            <RigidBody position={[3.5, 3, 0]} colliders="hull" restitution={0.4}>
              <mesh castShadow>
                <coneGeometry args={[0.6, 1.2, 6]} />
                <meshStandardMaterial color="#fdcb6e" />
              </mesh>
              <Html position={[0, 1.2, 0]} center>
                <div className="bg-black/80 px-2 py-1 rounded text-xs text-white">Hull</div>
              </Html>
            </RigidBody>
            
            {/* Trimesh (for complex shapes) */}
            <RigidBody position={[6, 3, 0]} colliders="trimesh" restitution={0.3}>
              <mesh castShadow>
                <torusKnotGeometry args={[0.4, 0.15, 64, 16]} />
                <meshStandardMaterial color="#74b9ff" />
              </mesh>
              <Html position={[0, 1.2, 0]} center>
                <div className="bg-black/80 px-2 py-1 rounded text-xs text-white">Trimesh</div>
              </Html>
            </RigidBody>
          </Physics>
          
          <OrbitControls />
        </Suspense>
      </Canvas>
      
      <button
        onClick={() => setPhysicsKey((k) => k + 1)}
        className="absolute bottom-4 right-4 px-4 py-2 bg-accent text-black rounded font-bold text-sm hover:bg-accent/80"
      >
        Reset
      </button>
    </div>
  );
}

// Forces Demo
export function ForcesDemo() {
  return (
    <div 
      className="relative w-full aspect-video bg-bg-secondary rounded-xl overflow-hidden border border-border"
      role="application"
      aria-label="Forces Demo - Click balls to compare force vs impulse"
    >
      <Canvas camera={{ position: [8, 8, 8], fov: 50 }} shadows>
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
          
          <Physics gravity={[0, -9.81, 0]}>
            <Ground size={15} />
            <ForcesDemoContent />
          </Physics>
          
          <OrbitControls />
        </Suspense>
      </Canvas>
    </div>
  );
}

function ForcesDemoContent() {
  const forceRef = useRef<RapierRigidBody>(null);
  const impulseRef = useRef<RapierRigidBody>(null);
  
  const applyForce = useCallback(() => {
    if (forceRef.current) {
      forceRef.current.addForce({ x: 0, y: 50, z: 0 }, true);
    }
  }, []);
  
  const applyImpulse = useCallback(() => {
    if (impulseRef.current) {
      impulseRef.current.applyImpulse({ x: 0, y: 10, z: 0 }, true);
    }
  }, []);
  
  return (
    <>
      {/* Force-driven ball */}
      <RigidBody ref={forceRef} position={[-2, 1, 0]} colliders="ball" restitution={0.5}>
        <mesh castShadow onClick={applyForce}>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial color="#e17055" />
        </mesh>
        <Html position={[0, 1, 0]} center>
          <div className="bg-black/80 px-2 py-1 rounded text-xs text-white cursor-pointer" onClick={applyForce}>
            Click: Apply Force
          </div>
        </Html>
      </RigidBody>
      
      {/* Impulse-driven ball */}
      <RigidBody ref={impulseRef} position={[2, 1, 0]} colliders="ball" restitution={0.5}>
        <mesh castShadow onClick={applyImpulse}>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial color="#00b894" />
        </mesh>
        <Html position={[0, 1, 0]} center>
          <div className="bg-black/80 px-2 py-1 rounded text-xs text-white cursor-pointer" onClick={applyImpulse}>
            Click: Apply Impulse
          </div>
        </Html>
      </RigidBody>
    </>
  );
}

// Collision Response Demo
export function CollisionResponseDemo() {
  const [restitution, setRestitution] = useState(0.8);
  const [physicsKey, setPhysicsKey] = useState(0);
  
  return (
    <div 
      className="relative w-full aspect-video bg-bg-secondary rounded-xl overflow-hidden border border-border"
      role="application"
      aria-label="Collision Response Demo - Adjust restitution to change bounce behavior"
    >
      <Canvas camera={{ position: [6, 6, 6], fov: 50 }} shadows>
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
          
          <Physics key={physicsKey} gravity={[0, -9.81, 0]}>
            <Ground size={15} />
            
            {/* Bouncy ball */}
            <RigidBody position={[0, 5, 0]} colliders="ball" restitution={restitution} friction={0.3}>
              <mesh castShadow>
                <sphereGeometry args={[0.5, 32, 32]} />
                <meshStandardMaterial color="#fdcb6e" />
              </mesh>
            </RigidBody>
          </Physics>
          
          <OrbitControls />
        </Suspense>
      </Canvas>
      
      <div className="absolute top-4 left-4 bg-black/80 rounded-lg p-3 text-white text-sm" role="group" aria-label="Restitution control">
        <label htmlFor="response-restitution" className="block text-text-secondary text-xs mb-1">
          Restitution (Bounciness): {restitution.toFixed(2)}
        </label>
        <input
          id="response-restitution"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={restitution}
          onChange={(e) => { setRestitution(parseFloat(e.target.value)); setPhysicsKey(k => k + 1); }}
          className="w-full accent-accent"
          aria-label={`Restitution: ${restitution.toFixed(2)}`}
        />
      </div>
    </div>
  );
}

// Joint Demo
export function JointsDemo() {
  return (
    <div 
      className="relative w-full aspect-video bg-bg-secondary rounded-xl overflow-hidden border border-border"
      role="application"
      aria-label="Joints Demo - Shows revolute, spherical, and prismatic joint types"
    >
      <Canvas camera={{ position: [10, 8, 10], fov: 50 }} shadows>
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
          
          <Physics gravity={[0, -9.81, 0]}>
            <Ground size={20} />
            <RevoluteJointDemo position={[-4, 0, 0]} />
            <SphericalJointDemo position={[0, 0, 0]} />
            <PrismaticJointDemo position={[4, 0, 0]} />
          </Physics>
          
          <OrbitControls />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Raycast Demo
export function RaycastDemo() {
  const [hits, setHits] = useState<THREE.Vector3[]>([]);
  
  return (
    <div 
      className="relative w-full aspect-video bg-bg-secondary rounded-xl overflow-hidden border border-border"
      role="application"
      aria-label="Raycast Demo - Click to cast rays and see hit markers"
    >
      <Canvas camera={{ position: [8, 8, 8], fov: 50 }} shadows>
        <Suspense fallback={<LoadingFallback />}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
          
          <Physics gravity={[0, -9.81, 0]}>
            <Ground size={15} />
            
            {/* Static boxes to raycast against */}
            <RigidBody type="fixed" position={[-2, 1, 0]}>
              <mesh castShadow>
                <boxGeometry args={[2, 2, 2]} />
                <meshStandardMaterial color="#6c5ce7" />
              </mesh>
            </RigidBody>
            
            <RigidBody type="fixed" position={[2, 0.5, 2]}>
              <mesh castShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#e17055" />
              </mesh>
            </RigidBody>
            
            <RaycastPicker 
              enabled={true}
              onHit={(point) => setHits((prev) => [...prev.slice(-5), point])}
            />
            
            {/* Hit markers */}
            {hits.map((hit, i) => (
              <mesh key={i} position={hit}>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshBasicMaterial color="#ff6b6b" />
              </mesh>
            ))}
          </Physics>
          
          <OrbitControls />
        </Suspense>
      </Canvas>
      
      <div className="absolute top-4 left-4 bg-black/80 rounded-lg p-3 text-white text-sm">
        <p className="text-text-secondary text-xs">Click anywhere to cast a ray!</p>
        <p className="text-accent text-xs mt-1">Hits: {hits.length}</p>
      </div>
    </div>
  );
}
