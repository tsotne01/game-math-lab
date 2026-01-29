import { useState, useRef, useMemo, useCallback, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Stars, Html, PerspectiveCamera, OrthographicCamera, useKeyboardControls, KeyboardControls } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

type CameraType = 'orbit' | 'fps' | 'follow' | 'cinematic';

interface CameraKeyframe {
  position: THREE.Vector3;
  target: THREE.Vector3;
  time: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVector(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return new THREE.Vector3(
    lerp(a.x, b.x, t),
    lerp(a.y, b.y, t),
    lerp(a.z, b.z, t)
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
// 3D SCENE OBJECTS
// ============================================================================

function SceneObjects({ highlightTarget }: { highlightTarget?: THREE.Vector3 }) {
  const targetRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (targetRef.current && highlightTarget) {
      targetRef.current.position.copy(highlightTarget);
      targetRef.current.rotation.y += 0.02;
    }
  });

  return (
    <>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      
      {/* Grid */}
      <gridHelper args={[40, 40, '#333', '#222']} position={[0, 0, 0]} />
      
      {/* Central pillar */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 3, 32]} />
        <meshStandardMaterial color="#6c5ce7" />
      </mesh>
      
      {/* Corner towers */}
      {[[-8, 8], [8, 8], [-8, -8], [8, -8]].map(([x, z], i) => (
        <mesh key={i} position={[x, 2, z]} castShadow>
          <boxGeometry args={[2, 4, 2]} />
          <meshStandardMaterial color={['#ff6b6b', '#51cf66', '#339af0', '#ffd43b'][i]} />
        </mesh>
      ))}
      
      {/* Orbiting spheres */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i / 5) * Math.PI * 2;
        const radius = 5;
        return (
          <mesh 
            key={i} 
            position={[Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius]}
            castShadow
          >
            <sphereGeometry args={[0.5, 24, 24]} />
            <meshStandardMaterial color="#e17055" />
          </mesh>
        );
      })}
      
      {/* Target indicator */}
      {highlightTarget && (
        <mesh ref={targetRef} position={highlightTarget}>
          <octahedronGeometry args={[0.3]} />
          <meshBasicMaterial color="#00ff00" wireframe />
        </mesh>
      )}
    </>
  );
}

// ============================================================================
// CAMERA COMPONENTS
// ============================================================================

interface OrbitCameraProps {
  distance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  damping: number;
  autoRotate: boolean;
}

function OrbitCameraController({ distance, minPolarAngle, maxPolarAngle, damping, autoRotate }: OrbitCameraProps) {
  const controlsRef = useRef<any>(null);
  
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, distance * 0.5, distance]} fov={50} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={damping}
        minDistance={3}
        maxDistance={30}
        minPolarAngle={minPolarAngle}
        maxPolarAngle={maxPolarAngle}
        autoRotate={autoRotate}
        autoRotateSpeed={0.5}
      />
    </>
  );
}

interface FPSCameraProps {
  sensitivity: number;
  speed: number;
}

function FPSCameraController({ sensitivity, speed }: FPSCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, shift: false });
  const yaw = useRef(0);
  const pitch = useRef(0);
  const position = useRef(new THREE.Vector3(0, 2, 10));
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const { gl } = useThree();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        setKeys(prev => ({ ...prev, [key]: true }));
      }
      if (e.key === 'Shift') {
        setKeys(prev => ({ ...prev, shift: true }));
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        setKeys(prev => ({ ...prev, [key]: false }));
      }
      if (e.key === 'Shift') {
        setKeys(prev => ({ ...prev, shift: false }));
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPointerLocked) return;
      yaw.current -= e.movementX * sensitivity * 0.002;
      pitch.current -= e.movementY * sensitivity * 0.002;
      pitch.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch.current));
    };

    const handleClick = () => {
      gl.domElement.requestPointerLock();
    };

    const handlePointerLockChange = () => {
      setIsPointerLocked(document.pointerLockElement === gl.domElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('click', handleClick);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [sensitivity, isPointerLocked, gl.domElement]);

  useFrame((state, delta) => {
    if (!cameraRef.current) return;

    const currentSpeed = keys.shift ? speed * 2 : speed;
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    forward.set(Math.sin(yaw.current), 0, Math.cos(yaw.current)).normalize();
    right.set(forward.z, 0, -forward.x);

    if (keys.w) position.current.add(forward.clone().multiplyScalar(-currentSpeed * delta));
    if (keys.s) position.current.add(forward.clone().multiplyScalar(currentSpeed * delta));
    if (keys.a) position.current.add(right.clone().multiplyScalar(-currentSpeed * delta));
    if (keys.d) position.current.add(right.clone().multiplyScalar(currentSpeed * delta));

    // Clamp position
    position.current.x = Math.max(-18, Math.min(18, position.current.x));
    position.current.z = Math.max(-18, Math.min(18, position.current.z));

    cameraRef.current.position.copy(position.current);
    cameraRef.current.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={75} />
      {!isPointerLocked && (
        <Html center>
          <div className="bg-black/80 px-4 py-2 rounded text-white text-sm whitespace-nowrap">
            Click to enable FPS controls
          </div>
        </Html>
      )}
    </>
  );
}

interface FollowCameraProps {
  offset: THREE.Vector3;
  smoothing: number;
  targetPosition: THREE.Vector3;
}

function FollowCameraController({ offset, smoothing, targetPosition }: FollowCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const currentPos = useRef(new THREE.Vector3(0, 5, 10));
  
  useFrame((state, delta) => {
    if (!cameraRef.current) return;
    
    const targetCamPos = targetPosition.clone().add(offset);
    currentPos.current.lerp(targetCamPos, smoothing * delta);
    
    cameraRef.current.position.copy(currentPos.current);
    cameraRef.current.lookAt(targetPosition);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={50} />;
}

interface CinematicCameraProps {
  keyframes: CameraKeyframe[];
  playing: boolean;
  playbackTime: number;
  loop: boolean;
}

function CinematicCameraController({ keyframes, playing, playbackTime, loop }: CinematicCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const timeRef = useRef(playbackTime);
  
  useEffect(() => {
    timeRef.current = playbackTime;
  }, [playbackTime]);
  
  useFrame((state, delta) => {
    if (!cameraRef.current || keyframes.length < 2) return;
    
    if (playing) {
      timeRef.current += delta;
      const totalTime = keyframes[keyframes.length - 1].time;
      if (timeRef.current > totalTime) {
        timeRef.current = loop ? 0 : totalTime;
      }
    }
    
    // Find current keyframe segment
    let startKf = keyframes[0];
    let endKf = keyframes[1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (timeRef.current >= keyframes[i].time && timeRef.current <= keyframes[i + 1].time) {
        startKf = keyframes[i];
        endKf = keyframes[i + 1];
        break;
      }
    }
    
    const segmentDuration = endKf.time - startKf.time;
    const t = segmentDuration > 0 ? (timeRef.current - startKf.time) / segmentDuration : 0;
    const easedT = easeInOutCubic(Math.max(0, Math.min(1, t)));
    
    const pos = lerpVector(startKf.position, endKf.position, easedT);
    const target = lerpVector(startKf.target, endKf.target, easedT);
    
    cameraRef.current.position.copy(pos);
    cameraRef.current.lookAt(target);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={50} />;
}

// ============================================================================
// FRUSTUM VISUALIZER
// ============================================================================

function CameraFrustum({ camera, color = '#00ff00' }: { camera: THREE.PerspectiveCamera; color?: string }) {
  const frustumRef = useRef<THREE.LineSegments>(null);
  
  useFrame(() => {
    if (!frustumRef.current || !camera) return;
    
    const helper = new THREE.CameraHelper(camera);
    frustumRef.current.geometry.dispose();
    frustumRef.current.geometry = helper.geometry.clone();
    frustumRef.current.matrix = camera.matrixWorld.clone();
    frustumRef.current.matrixAutoUpdate = false;
  });
  
  return (
    <lineSegments ref={frustumRef}>
      <bufferGeometry />
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

// ============================================================================
// MAIN CAMERA CONTROLLER DEMO
// ============================================================================

interface CameraControllerSceneProps {
  cameraType: CameraType;
  orbitSettings: OrbitCameraProps;
  fpsSettings: FPSCameraProps;
  followSettings: FollowCameraProps;
  cinematicSettings: CinematicCameraProps;
}

function CameraControllerScene({
  cameraType,
  orbitSettings,
  fpsSettings,
  followSettings,
  cinematicSettings
}: CameraControllerSceneProps) {
  const movingTarget = useRef(new THREE.Vector3(0, 0.5, 0));
  
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    movingTarget.current.set(
      Math.sin(t * 0.5) * 5,
      0.5,
      Math.cos(t * 0.5) * 5
    );
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade />
      
      <SceneObjects highlightTarget={cameraType === 'follow' ? movingTarget.current : undefined} />
      
      {/* Moving target for follow camera */}
      {cameraType === 'follow' && (
        <mesh position={movingTarget.current}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#ffd43b" emissive="#ffd43b" emissiveIntensity={0.3} />
        </mesh>
      )}
      
      {cameraType === 'orbit' && <OrbitCameraController {...orbitSettings} />}
      {cameraType === 'fps' && <FPSCameraController {...fpsSettings} />}
      {cameraType === 'follow' && (
        <FollowCameraController 
          {...followSettings} 
          targetPosition={movingTarget.current}
        />
      )}
      {cameraType === 'cinematic' && <CinematicCameraController {...cinematicSettings} />}
    </>
  );
}

export default function CameraController() {
  const [cameraType, setCameraType] = useState<CameraType>('orbit');
  
  // Orbit camera settings
  const [orbitDistance, setOrbitDistance] = useState(15);
  const [orbitMinPolar, setOrbitMinPolar] = useState(0.1);
  const [orbitMaxPolar, setOrbitMaxPolar] = useState(Math.PI - 0.1);
  const [orbitDamping, setOrbitDamping] = useState(0.05);
  const [orbitAutoRotate, setOrbitAutoRotate] = useState(false);
  
  // FPS camera settings
  const [fpsSensitivity, setFpsSensitivity] = useState(1);
  const [fpsSpeed, setFpsSpeed] = useState(5);
  
  // Follow camera settings
  const [followOffset, setFollowOffset] = useState(new THREE.Vector3(0, 5, 10));
  const [followSmoothing, setFollowSmoothing] = useState(3);
  
  // Cinematic camera settings
  const [cinematicPlaying, setCinematicPlaying] = useState(false);
  const [cinematicLoop, setCinematicLoop] = useState(true);
  const [cinematicTime, setCinematicTime] = useState(0);
  
  const cinematicKeyframes: CameraKeyframe[] = useMemo(() => [
    { position: new THREE.Vector3(15, 10, 15), target: new THREE.Vector3(0, 0, 0), time: 0 },
    { position: new THREE.Vector3(-15, 5, 10), target: new THREE.Vector3(0, 2, 0), time: 3 },
    { position: new THREE.Vector3(0, 20, 0), target: new THREE.Vector3(0, 0, 0), time: 6 },
    { position: new THREE.Vector3(10, 3, -10), target: new THREE.Vector3(-5, 0, 5), time: 9 },
    { position: new THREE.Vector3(15, 10, 15), target: new THREE.Vector3(0, 0, 0), time: 12 },
  ], []);

  return (
    <div className="space-y-4" role="application" aria-label="Camera Controller Demo">
      {/* Camera Type Selector */}
      <div className="flex flex-wrap gap-2 bg-bg-secondary p-3 md:p-4 rounded-lg">
        {(['orbit', 'fps', 'follow', 'cinematic'] as CameraType[]).map((type) => (
          <button
            key={type}
            onClick={() => setCameraType(type)}
            className={`px-3 md:px-4 py-2 rounded transition-colors text-sm capitalize ${
              cameraType === type
                ? 'bg-accent text-black font-bold'
                : 'bg-bg-card text-text-secondary hover:bg-border'
            }`}
          >
            {type === 'fps' ? 'First-Person' : type === 'follow' ? 'Third-Person' : type}
          </button>
        ))}
      </div>

      {/* Camera-specific controls */}
      <div className="bg-bg-secondary p-3 md:p-4 rounded-lg space-y-3">
        {cameraType === 'orbit' && (
          <>
            <h4 className="text-sm font-bold text-accent mb-2">Orbit Camera Controls</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Distance</label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={orbitDistance}
                  onChange={(e) => setOrbitDistance(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <span className="text-xs text-accent">{orbitDistance}</span>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Damping</label>
                <input
                  type="range"
                  min="0.01"
                  max="0.2"
                  step="0.01"
                  value={orbitDamping}
                  onChange={(e) => setOrbitDamping(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <span className="text-xs text-accent">{orbitDamping.toFixed(2)}</span>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={orbitAutoRotate}
                    onChange={(e) => setOrbitAutoRotate(e.target.checked)}
                    className="accent-accent w-4 h-4"
                  />
                  <span className="text-xs text-text-secondary">Auto Rotate</span>
                </label>
              </div>
            </div>
          </>
        )}

        {cameraType === 'fps' && (
          <>
            <h4 className="text-sm font-bold text-accent mb-2">First-Person Controls</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Mouse Sensitivity</label>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={fpsSensitivity}
                  onChange={(e) => setFpsSensitivity(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <span className="text-xs text-accent">{fpsSensitivity.toFixed(1)}</span>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Move Speed</label>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={fpsSpeed}
                  onChange={(e) => setFpsSpeed(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <span className="text-xs text-accent">{fpsSpeed}</span>
              </div>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              WASD to move • Mouse to look • Shift to sprint • ESC to release
            </p>
          </>
        )}

        {cameraType === 'follow' && (
          <>
            <h4 className="text-sm font-bold text-accent mb-2">Follow Camera Controls</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Height Offset</label>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={followOffset.y}
                  onChange={(e) => setFollowOffset(new THREE.Vector3(followOffset.x, Number(e.target.value), followOffset.z))}
                  className="w-full accent-accent"
                />
                <span className="text-xs text-accent">{followOffset.y}</span>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Distance</label>
                <input
                  type="range"
                  min="2"
                  max="20"
                  value={followOffset.z}
                  onChange={(e) => setFollowOffset(new THREE.Vector3(followOffset.x, followOffset.y, Number(e.target.value)))}
                  className="w-full accent-accent"
                />
                <span className="text-xs text-accent">{followOffset.z}</span>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Smoothing</label>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={followSmoothing}
                  onChange={(e) => setFollowSmoothing(Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <span className="text-xs text-accent">{followSmoothing}</span>
              </div>
            </div>
          </>
        )}

        {cameraType === 'cinematic' && (
          <>
            <h4 className="text-sm font-bold text-accent mb-2">Cinematic Camera Controls</h4>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setCinematicPlaying(!cinematicPlaying)}
                className={`px-4 py-2 rounded text-sm font-bold transition-colors ${
                  cinematicPlaying ? 'bg-[#e17055] text-white' : 'bg-[#00b894] text-white'
                }`}
              >
                {cinematicPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={() => setCinematicTime(0)}
                className="px-4 py-2 rounded bg-bg-card text-text-secondary hover:bg-border text-sm"
              >
                Reset
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cinematicLoop}
                  onChange={(e) => setCinematicLoop(e.target.checked)}
                  className="accent-accent w-4 h-4"
                />
                <span className="text-xs text-text-secondary">Loop</span>
              </label>
            </div>
            <div className="mt-3">
              <p className="text-xs text-text-secondary mb-2">Keyframe Timeline:</p>
              <div className="flex gap-1">
                {cinematicKeyframes.map((kf, i) => (
                  <div
                    key={i}
                    className="flex-1 h-2 rounded bg-accent/30 relative"
                    title={`Keyframe ${i + 1}: t=${kf.time}s`}
                  >
                    <div className="absolute left-0 top-0 h-full bg-accent rounded" style={{ width: '4px' }} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3D Canvas */}
      <div 
        className="h-[350px] sm:h-[400px] md:h-[500px] bg-black rounded-lg overflow-hidden border border-border"
        role="img"
        aria-label="3D camera controller demo"
      >
        <Canvas shadows dpr={[1, 2]} performance={{ min: 0.5 }}>
          <Suspense fallback={<LoadingFallback />}>
            <CameraControllerScene
              cameraType={cameraType}
              orbitSettings={{
                distance: orbitDistance,
                minPolarAngle: orbitMinPolar,
                maxPolarAngle: orbitMaxPolar,
                damping: orbitDamping,
                autoRotate: orbitAutoRotate
              }}
              fpsSettings={{
                sensitivity: fpsSensitivity,
                speed: fpsSpeed
              }}
              followSettings={{
                offset: followOffset,
                smoothing: followSmoothing,
                targetPosition: new THREE.Vector3(0, 0.5, 0)
              }}
              cinematicSettings={{
                keyframes: cinematicKeyframes,
                playing: cinematicPlaying,
                playbackTime: cinematicTime,
                loop: cinematicLoop
              }}
            />
          </Suspense>
        </Canvas>
      </div>
      
      <p className="text-center text-sm text-text-secondary">
        {cameraType === 'orbit' && 'Drag to rotate • Scroll to zoom • Right-drag to pan'}
        {cameraType === 'fps' && 'Click to enable • WASD to move • Mouse to look'}
        {cameraType === 'follow' && 'Camera follows the moving target automatically'}
        {cameraType === 'cinematic' && 'Press Play to see the camera path animation'}
      </p>
    </div>
  );
}

// ============================================================================
// FRUSTUM VISUALIZER DEMO
// ============================================================================

function FrustumScene({ fov, near, far, showFrustum }: { fov: number; near: number; far: number; showFrustum: boolean }) {
  const mainCameraRef = useRef<THREE.PerspectiveCamera>(null);
  const frustumHelperRef = useRef<THREE.CameraHelper | null>(null);
  
  useFrame(() => {
    if (mainCameraRef.current) {
      mainCameraRef.current.fov = fov;
      mainCameraRef.current.near = near;
      mainCameraRef.current.far = far;
      mainCameraRef.current.updateProjectionMatrix();
    }
  });
  
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
      <gridHelper args={[30, 30, '#333', '#222']} />
      
      {/* Objects at various distances */}
      {[2, 5, 10, 15, 20, 25].map((dist, i) => (
        <mesh key={i} position={[0, 0.5, -dist]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial 
            color={dist < near || dist > far ? '#444' : '#6c5ce7'} 
            transparent
            opacity={dist < near || dist > far ? 0.3 : 1}
          />
          <Html position={[0, 1.2, 0]}>
            <div className={`text-xs px-1 rounded ${dist < near || dist > far ? 'bg-red-500/50' : 'bg-green-500/50'}`}>
              {dist}m
            </div>
          </Html>
        </mesh>
      ))}
      
      {/* The camera we're visualizing */}
      <PerspectiveCamera
        ref={mainCameraRef}
        position={[0, 2, 5]}
        fov={fov}
        near={near}
        far={far}
      />
      
      {/* Frustum visualization */}
      {showFrustum && mainCameraRef.current && (
        <primitive object={new THREE.CameraHelper(mainCameraRef.current)} />
      )}
      
      {/* Observer camera */}
      <PerspectiveCamera makeDefault position={[15, 15, 20]} fov={50} />
      <OrbitControls enableDamping />
    </>
  );
}

export function FrustumVisualizer() {
  const [fov, setFov] = useState(60);
  const [near, setNear] = useState(1);
  const [far, setFar] = useState(15);
  const [showFrustum, setShowFrustum] = useState(true);

  return (
    <div className="space-y-4" role="application" aria-label="Camera Frustum Visualizer">
      <div className="grid grid-cols-3 gap-3 md:gap-4 bg-bg-secondary p-3 md:p-4 rounded-lg">
        <div>
          <label className="text-xs text-text-secondary block mb-1">FOV: {fov}°</label>
          <input
            type="range"
            min="20"
            max="120"
            value={fov}
            onChange={(e) => setFov(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Near: {near}m</label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={near}
            onChange={(e) => setNear(Number(e.target.value))}
            className="w-full accent-[#51cf66]"
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Far: {far}m</label>
          <input
            type="range"
            min="5"
            max="30"
            value={far}
            onChange={(e) => setFar(Number(e.target.value))}
            className="w-full accent-[#ff6b6b]"
          />
        </div>
      </div>
      
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showFrustum}
          onChange={(e) => setShowFrustum(e.target.checked)}
          className="accent-accent w-4 h-4"
        />
        <span className="text-sm text-text-secondary">Show Frustum Wireframe</span>
      </label>

      <div className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <FrustumScene fov={fov} near={near} far={far} showFrustum={showFrustum} />
          </Suspense>
        </Canvas>
      </div>
      
      <div className="bg-bg-card p-3 rounded-lg border border-border">
        <p className="text-sm text-text-secondary">
          Objects between <span className="text-[#51cf66] font-mono">{near}m</span> and{' '}
          <span className="text-[#ff6b6b] font-mono">{far}m</span> are visible.
          Objects outside the frustum are grayed out.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// CAMERA INTERPOLATION DEMO
// ============================================================================

function InterpolationScene({ 
  t, 
  easing 
}: { 
  t: number; 
  easing: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  
  const startPos = useMemo(() => new THREE.Vector3(10, 5, 10), []);
  const endPos = useMemo(() => new THREE.Vector3(-10, 15, -5), []);
  const startTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const endTarget = useMemo(() => new THREE.Vector3(5, 2, -5), []);
  
  const easingFunctions: Record<string, (t: number) => number> = {
    linear: (t) => t,
    easeInOut: easeInOutCubic,
    easeIn: (t) => t * t * t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
  };
  
  useFrame(() => {
    if (!cameraRef.current) return;
    
    const easedT = easingFunctions[easing](t);
    const pos = lerpVector(startPos, endPos, easedT);
    const target = lerpVector(startTarget, endTarget, easedT);
    
    cameraRef.current.position.copy(pos);
    cameraRef.current.lookAt(target);
  });
  
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
      <gridHelper args={[30, 30, '#333', '#222']} />
      
      <SceneObjects />
      
      {/* Start/End markers */}
      <mesh position={startPos}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color="#51cf66" />
      </mesh>
      <Html position={startPos}><div className="text-xs text-[#51cf66] font-bold">Start</div></Html>
      
      <mesh position={endPos}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color="#ff6b6b" />
      </mesh>
      <Html position={endPos}><div className="text-xs text-[#ff6b6b] font-bold">End</div></Html>
      
      {/* Path line */}
      <Line
        points={[startPos, endPos]}
        color="#ffd43b"
        lineWidth={2}
        dashed
        dashSize={0.5}
        gapSize={0.2}
      />
      
      <PerspectiveCamera ref={cameraRef} makeDefault fov={50} />
    </>
  );
}

export function CameraInterpolation() {
  const [t, setT] = useState(0);
  const [easing, setEasing] = useState<'linear' | 'easeInOut' | 'easeIn' | 'easeOut'>('easeInOut');
  const [playing, setPlaying] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  
  useEffect(() => {
    if (playing) {
      let startTime: number | null = null;
      const duration = 3000; // 3 seconds
      
      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const newT = Math.min(elapsed / duration, 1);
        setT(newT);
        
        if (newT < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setPlaying(false);
        }
      };
      
      animationRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playing]);

  return (
    <div className="space-y-4" role="application" aria-label="Camera Interpolation Demo">
      <div className="bg-bg-secondary p-3 md:p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={() => { setT(0); setPlaying(true); }}
            className="px-4 py-2 rounded bg-[#00b894] text-white font-bold text-sm"
          >
            Play Transition
          </button>
          <button
            onClick={() => setT(0)}
            className="px-4 py-2 rounded bg-bg-card text-text-secondary hover:bg-border text-sm"
          >
            Reset
          </button>
          
          <div className="flex gap-2 ml-auto">
            {(['linear', 'easeIn', 'easeOut', 'easeInOut'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEasing(e)}
                className={`px-3 py-1 rounded text-xs ${
                  easing === e ? 'bg-accent text-black font-bold' : 'bg-bg-card text-text-secondary'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        
        <div>
          <label className="text-xs text-text-secondary block mb-1">Interpolation: {(t * 100).toFixed(0)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      </div>

      <div className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <InterpolationScene t={t} easing={easing} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

// ============================================================================
// DOLLY ZOOM (VERTIGO EFFECT) DEMO
// ============================================================================

function DollyZoomScene({ subjectDistance, fov }: { subjectDistance: number; fov: number }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  
  useFrame(() => {
    if (!cameraRef.current) return;
    cameraRef.current.fov = fov;
    cameraRef.current.position.z = subjectDistance;
    cameraRef.current.updateProjectionMatrix();
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
      
      {/* Background buildings to show perspective change */}
      {[-10, -5, 0, 5, 10].map((x) => (
        <group key={x}>
          {[10, 15, 20, 25, 30].map((z) => (
            <mesh key={z} position={[x, (Math.random() * 3 + 2), -z]}>
              <boxGeometry args={[2, Math.random() * 6 + 4, 2]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
          ))}
        </group>
      ))}
      
      {/* Subject (always same apparent size) */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#6c5ce7" />
      </mesh>
      
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[50, 100]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 2, subjectDistance]} fov={fov} />
    </>
  );
}

export function DollyZoom() {
  const [t, setT] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState(1);
  const animationRef = useRef<number | undefined>(undefined);
  
  // Calculate FOV and distance to keep subject same size
  // subjectHeight / distance = 2 * tan(fov/2)
  const minFov = 20;
  const maxFov = 100;
  const fov = lerp(minFov, maxFov, t);
  const baseDistance = 5;
  // Adjust distance to maintain subject size
  const distance = baseDistance / Math.tan((fov * Math.PI / 180) / 2) * Math.tan((60 * Math.PI / 180) / 2);
  
  useEffect(() => {
    if (playing) {
      const animate = () => {
        setT((prev) => {
          let newT = prev + direction * 0.008;
          if (newT >= 1 || newT <= 0) {
            setDirection(-direction);
            newT = Math.max(0, Math.min(1, newT));
          }
          return newT;
        });
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [playing, direction]);

  return (
    <div className="space-y-4" role="application" aria-label="Dolly Zoom (Vertigo Effect) Demo">
      <div className="bg-bg-secondary p-3 md:p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={() => setPlaying(!playing)}
            className={`px-4 py-2 rounded font-bold text-sm ${
              playing ? 'bg-[#e17055] text-white' : 'bg-[#00b894] text-white'
            }`}
          >
            {playing ? 'Stop' : 'Play Effect'}
          </button>
          <div className="text-sm text-text-secondary">
            FOV: <span className="text-accent font-mono">{fov.toFixed(0)}°</span>
            {' | '}
            Distance: <span className="text-accent font-mono">{distance.toFixed(1)}m</span>
          </div>
        </div>
        
        <div>
          <label className="text-xs text-text-secondary block mb-1">Manual Control</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      </div>

      <div className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <DollyZoomScene subjectDistance={distance} fov={fov} />
          </Suspense>
        </Canvas>
      </div>
      
      <div className="bg-bg-card p-3 rounded-lg border border-border">
        <p className="text-sm text-text-secondary">
          The <strong className="text-white">dolly zoom</strong> (or "Vertigo effect") moves the camera while changing FOV
          to keep the subject the same size, but the background perspective changes dramatically!
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// SPLIT SCREEN COMPARISON
// ============================================================================

function SplitScreenHalf({ 
  projection, 
  position 
}: { 
  projection: 'perspective' | 'orthographic';
  position: 'left' | 'right';
}) {
  const { size, gl } = useThree();
  const halfWidth = size.width / 2;
  
  useFrame(({ gl, scene, camera }) => {
    const left = position === 'left' ? 0 : halfWidth;
    gl.setViewport(left, 0, halfWidth, size.height);
    gl.setScissor(left, 0, halfWidth, size.height);
    gl.setScissorTest(true);
    gl.render(scene, camera);
  }, 1);

  return projection === 'perspective' ? (
    <PerspectiveCamera position={[10, 10, 10]} fov={50} />
  ) : (
    <OrthographicCamera position={[10, 10, 10]} zoom={30} />
  );
}

function SplitScreenScene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
      <gridHelper args={[20, 20, '#333', '#222']} />
      
      {/* Objects at varying distances */}
      {[0, 3, 6, 9].map((z, i) => (
        <mesh key={i} position={[0, 0.5, -z]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={['#ff6b6b', '#51cf66', '#339af0', '#ffd43b'][i]} />
        </mesh>
      ))}
      
      <OrbitControls enableDamping />
    </>
  );
}

export function SplitScreenComparison() {
  return (
    <div className="space-y-4" role="application" aria-label="Split Screen Camera Comparison">
      <div className="flex justify-between bg-bg-secondary p-3 rounded-lg text-sm">
        <div className="text-center flex-1">
          <span className="text-[#6c5ce7] font-bold">Perspective</span>
          <p className="text-xs text-text-secondary">Objects shrink with distance</p>
        </div>
        <div className="w-px bg-border" />
        <div className="text-center flex-1">
          <span className="text-[#00b894] font-bold">Orthographic</span>
          <p className="text-xs text-text-secondary">Objects maintain size</p>
        </div>
      </div>

      <div className="h-[300px] sm:h-[350px] md:h-[400px] bg-black rounded-lg overflow-hidden border border-border relative">
        {/* Perspective View */}
        <div className="absolute left-0 top-0 w-1/2 h-full">
          <Canvas dpr={[1, 2]} camera={{ position: [10, 10, 10], fov: 50 }}>
            <Suspense fallback={<LoadingFallback />}>
              <ambientLight intensity={0.4} />
              <directionalLight position={[10, 20, 10]} intensity={1} />
              <gridHelper args={[20, 20, '#333', '#222']} />
              {[0, 3, 6, 9].map((z, i) => (
                <mesh key={i} position={[0, 0.5, -z]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial color={['#ff6b6b', '#51cf66', '#339af0', '#ffd43b'][i]} />
                </mesh>
              ))}
              <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={50} />
              <OrbitControls enableDamping />
            </Suspense>
          </Canvas>
        </div>
        
        {/* Orthographic View */}
        <div className="absolute right-0 top-0 w-1/2 h-full border-l border-border">
          <Canvas dpr={[1, 2]} orthographic camera={{ position: [10, 10, 10], zoom: 40 }}>
            <Suspense fallback={<LoadingFallback />}>
              <ambientLight intensity={0.4} />
              <directionalLight position={[10, 20, 10]} intensity={1} />
              <gridHelper args={[20, 20, '#333', '#222']} />
              {[0, 3, 6, 9].map((z, i) => (
                <mesh key={i} position={[0, 0.5, -z]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial color={['#ff6b6b', '#51cf66', '#339af0', '#ffd43b'][i]} />
                </mesh>
              ))}
              <OrthographicCamera makeDefault position={[8, 8, 8]} zoom={40} />
              <OrbitControls enableDamping />
            </Suspense>
          </Canvas>
        </div>
        
        {/* Divider */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30 pointer-events-none" />
      </div>
      
      <p className="text-center text-sm text-text-secondary">
        Same scene, different projections. Drag to rotate each view independently.
      </p>
    </div>
  );
}

// ============================================================================
// CAMERA MATRIX DISPLAY
// ============================================================================

export function CameraMatrixDisplay() {
  const [position, setPosition] = useState({ x: 5, y: 5, z: 10 });
  const [target, setTarget] = useState({ x: 0, y: 0, z: 0 });
  
  // Calculate view matrix using lookAt
  const viewMatrix = useMemo(() => {
    const eye = new THREE.Vector3(position.x, position.y, position.z);
    const tgt = new THREE.Vector3(target.x, target.y, target.z);
    const up = new THREE.Vector3(0, 1, 0);
    
    const matrix = new THREE.Matrix4();
    matrix.lookAt(eye, tgt, up);
    
    // Invert to get view matrix
    const viewMat = matrix.clone().invert();
    
    // Add translation
    const transMat = new THREE.Matrix4().makeTranslation(-eye.x, -eye.y, -eye.z);
    viewMat.multiply(transMat);
    
    return viewMat.elements;
  }, [position, target]);
  
  const formatMatrix = (elements: number[]) => {
    const rows = [];
    for (let i = 0; i < 4; i++) {
      rows.push([
        elements[i],
        elements[i + 4],
        elements[i + 8],
        elements[i + 12]
      ]);
    }
    return rows;
  };

  return (
    <div className="space-y-4" role="application" aria-label="Camera Matrix Display">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-bg-secondary p-3 md:p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#51cf66] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></svg>
            Camera Position
          </h4>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <label className="text-xs text-text-secondary w-4 uppercase">{axis}</label>
              <input
                type="range"
                min="-15"
                max="15"
                step="0.5"
                value={position[axis]}
                onChange={(e) => setPosition({ ...position, [axis]: Number(e.target.value) })}
                className="flex-1 accent-[#51cf66]"
              />
              <span className="text-xs font-mono w-10">{position[axis].toFixed(1)}</span>
            </div>
          ))}
        </div>
        
        <div className="bg-bg-secondary p-3 md:p-4 rounded-lg">
          <h4 className="text-sm font-bold text-[#ff6b6b] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            Target Position
          </h4>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2 mb-2">
              <label className="text-xs text-text-secondary w-4 uppercase">{axis}</label>
              <input
                type="range"
                min="-10"
                max="10"
                step="0.5"
                value={target[axis]}
                onChange={(e) => setTarget({ ...target, [axis]: Number(e.target.value) })}
                className="flex-1 accent-[#ff6b6b]"
              />
              <span className="text-xs font-mono w-10">{target[axis].toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-[250px] sm:h-[300px] bg-black rounded-lg overflow-hidden border border-border">
        <Canvas dpr={[1, 2]}>
          <Suspense fallback={<LoadingFallback />}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 20, 10]} intensity={1} />
            <gridHelper args={[20, 20, '#333', '#222']} />
            
            {/* Target marker */}
            <mesh position={[target.x, target.y, target.z]}>
              <sphereGeometry args={[0.3, 16, 16]} />
              <meshBasicMaterial color="#ff6b6b" />
            </mesh>
            
            {/* Camera position marker */}
            <mesh position={[position.x, position.y, position.z]}>
              <coneGeometry args={[0.3, 0.6, 8]} />
              <meshBasicMaterial color="#51cf66" />
            </mesh>
            
            {/* Line from camera to target */}
            <Line
              points={[
                [position.x, position.y, position.z],
                [target.x, target.y, target.z]
              ]}
              color="#ffd43b"
              lineWidth={2}
            />
            
            <SceneObjects />
            
            <PerspectiveCamera makeDefault position={[20, 15, 20]} fov={50} />
            <OrbitControls enableDamping />
          </Suspense>
        </Canvas>
      </div>
      
      <div className="bg-bg-card p-3 md:p-4 rounded-lg border border-border font-mono text-xs overflow-x-auto">
        <p className="text-text-secondary mb-2 font-sans text-sm">View Matrix (lookAt result):</p>
        <pre className="text-accent">
{formatMatrix(viewMatrix).map((row, i) => 
  `[ ${row.map(v => v.toFixed(3).padStart(8)).join('  ')} ]`
).join('\n')}
        </pre>
      </div>
    </div>
  );
}
