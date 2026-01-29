import { useState, useRef, useMemo, useCallback, useEffect, Suspense, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

interface ShaderPreset {
  name: string;
  description: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: UniformConfig[];
}

interface UniformConfig {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'color' | 'texture';
  default: number | number[] | string;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}

interface ShaderError {
  type: 'vertex' | 'fragment';
  line: number;
  message: string;
}

// ============================================================================
// PRESET SHADERS
// ============================================================================

const SHADER_PRESETS: ShaderPreset[] = [
  {
    name: 'Basic',
    description: 'Simple color shader - start here!',
    vertexShader: `varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vNormal;

void main() {
    gl_FragColor = vec4(uColor, 1.0);
}`,
    uniforms: [
      { name: 'uColor', type: 'color', default: '#6c5ce7', label: 'Color' }
    ]
  },
  {
    name: 'UV Debug',
    description: 'Visualize UV coordinates as colors',
    vertexShader: `varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `varying vec2 vUv;

void main() {
    gl_FragColor = vec4(vUv.x, vUv.y, 0.0, 1.0);
}`,
    uniforms: []
  },
  {
    name: 'Normal Debug',
    description: 'Visualize surface normals as colors',
    vertexShader: `varying vec3 vNormal;

void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `varying vec3 vNormal;

void main() {
    vec3 color = vNormal * 0.5 + 0.5;
    gl_FragColor = vec4(color, 1.0);
}`,
    uniforms: []
  },
  {
    name: 'Toon',
    description: 'Cel-shading / toon shading effect',
    vertexShader: `varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: `uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uSteps;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    float NdotL = dot(vNormal, normalize(uLightDir));
    float intensity = floor(NdotL * uSteps) / uSteps;
    intensity = max(0.2, intensity);
    
    vec3 color = uColor * intensity;
    gl_FragColor = vec4(color, 1.0);
}`,
    uniforms: [
      { name: 'uColor', type: 'color', default: '#00b894', label: 'Base Color' },
      { name: 'uLightDir', type: 'vec3', default: [1, 1, 1], label: 'Light Direction' },
      { name: 'uSteps', type: 'float', default: 4, min: 2, max: 10, step: 1, label: 'Shading Steps' }
    ]
  },
  {
    name: 'Hologram',
    description: 'Sci-fi hologram effect with scanlines',
    vertexShader: `varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vY;

void main() {
    vUv = uv;
    vY = position.y;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: `uniform float uTime;
uniform vec3 uColor;
uniform float uScanlineSpeed;
uniform float uScanlineCount;
uniform float uGlitchIntensity;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vY;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main() {
    // Fresnel effect (edge glow)
    float fresnel = pow(1.0 - abs(dot(vViewDir, vNormal)), 3.0);
    
    // Scanlines
    float scanline = sin(vY * uScanlineCount + uTime * uScanlineSpeed) * 0.5 + 0.5;
    scanline = pow(scanline, 0.5);
    
    // Random glitch
    float glitch = step(0.99 - uGlitchIntensity * 0.1, random(vec2(uTime * 0.1, vY)));
    
    // Combine
    float alpha = 0.3 + fresnel * 0.5 + scanline * 0.2 + glitch * 0.5;
    vec3 color = uColor + fresnel * 0.3;
    
    gl_FragColor = vec4(color, alpha);
}`,
    uniforms: [
      { name: 'uColor', type: 'color', default: '#00ff88', label: 'Hologram Color' },
      { name: 'uScanlineSpeed', type: 'float', default: 5.0, min: 0, max: 20, step: 0.5, label: 'Scanline Speed' },
      { name: 'uScanlineCount', type: 'float', default: 50.0, min: 10, max: 200, step: 10, label: 'Scanline Count' },
      { name: 'uGlitchIntensity', type: 'float', default: 0.3, min: 0, max: 1, step: 0.1, label: 'Glitch Intensity' }
    ]
  },
  {
    name: 'Fresnel',
    description: 'Edge glow based on view angle',
    vertexShader: `varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: `uniform vec3 uColor;
uniform vec3 uFresnelColor;
uniform float uFresnelPower;
uniform float uFresnelBias;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    float fresnel = uFresnelBias + (1.0 - uFresnelBias) * pow(1.0 - abs(dot(vViewDir, vNormal)), uFresnelPower);
    vec3 color = mix(uColor, uFresnelColor, fresnel);
    gl_FragColor = vec4(color, 1.0);
}`,
    uniforms: [
      { name: 'uColor', type: 'color', default: '#1a1a2e', label: 'Core Color' },
      { name: 'uFresnelColor', type: 'color', default: '#6c5ce7', label: 'Edge Color' },
      { name: 'uFresnelPower', type: 'float', default: 2.0, min: 0.5, max: 5, step: 0.1, label: 'Power' },
      { name: 'uFresnelBias', type: 'float', default: 0.1, min: 0, max: 1, step: 0.05, label: 'Bias' }
    ]
  },
  {
    name: 'Wave',
    description: 'Animated wave displacement',
    vertexShader: `uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
varying vec2 vUv;
varying vec3 vNormal;
varying float vWave;

void main() {
    vUv = uv;
    
    // Wave displacement
    float wave = sin(position.x * uFrequency + uTime) * 
                 sin(position.z * uFrequency + uTime) * 
                 uAmplitude;
    vWave = wave;
    
    vec3 newPosition = position + normal * wave;
    
    // Recalculate normal (approximate)
    float delta = 0.01;
    float waveX = sin((position.x + delta) * uFrequency + uTime) * sin(position.z * uFrequency + uTime) * uAmplitude;
    float waveZ = sin(position.x * uFrequency + uTime) * sin((position.z + delta) * uFrequency + uTime) * uAmplitude;
    vec3 tangent = vec3(delta, waveX - wave, 0.0);
    vec3 bitangent = vec3(0.0, waveZ - wave, delta);
    vNormal = normalize(cross(tangent, bitangent));
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}`,
    fragmentShader: `uniform vec3 uColor1;
uniform vec3 uColor2;
varying vec2 vUv;
varying vec3 vNormal;
varying float vWave;

void main() {
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(vNormal, lightDir), 0.3);
    
    vec3 color = mix(uColor1, uColor2, vWave + 0.5);
    color *= diff;
    
    gl_FragColor = vec4(color, 1.0);
}`,
    uniforms: [
      { name: 'uAmplitude', type: 'float', default: 0.2, min: 0, max: 1, step: 0.05, label: 'Amplitude' },
      { name: 'uFrequency', type: 'float', default: 3.0, min: 1, max: 10, step: 0.5, label: 'Frequency' },
      { name: 'uColor1', type: 'color', default: '#0077be', label: 'Valley Color' },
      { name: 'uColor2', type: 'color', default: '#00d4aa', label: 'Peak Color' }
    ]
  },
  {
    name: 'Dissolve',
    description: 'Noise-based dissolve effect',
    vertexShader: `varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `uniform float uTime;
uniform float uDissolve;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uEdgeWidth;
varying vec2 vUv;
varying vec3 vPosition;

// Simple 3D noise
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
    float n = noise(vPosition * 3.0);
    
    if (n < uDissolve) {
        discard;
    }
    
    float edge = smoothstep(uDissolve, uDissolve + uEdgeWidth, n);
    vec3 color = mix(uEdgeColor, uColor, edge);
    
    gl_FragColor = vec4(color, 1.0);
}`,
    uniforms: [
      { name: 'uDissolve', type: 'float', default: 0.0, min: 0, max: 1, step: 0.01, label: 'Dissolve' },
      { name: 'uColor', type: 'color', default: '#6c5ce7', label: 'Base Color' },
      { name: 'uEdgeColor', type: 'color', default: '#ff6b6b', label: 'Edge Color' },
      { name: 'uEdgeWidth', type: 'float', default: 0.1, min: 0.01, max: 0.5, step: 0.01, label: 'Edge Width' }
    ]
  },
  {
    name: 'Fire',
    description: 'Animated fire/plasma effect',
    vertexShader: `varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `uniform float uTime;
uniform float uIntensity;
uniform vec3 uColorHot;
uniform vec3 uColorCold;
varying vec2 vUv;
varying vec3 vPosition;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 uv = vUv;
    uv.y -= uTime * 0.5;
    
    float n = fbm(uv * 5.0);
    n += fbm(uv * 10.0 + uTime * 0.3) * 0.5;
    
    float gradient = 1.0 - vUv.y;
    n *= gradient * uIntensity;
    
    vec3 color = mix(uColorCold, uColorHot, n);
    float alpha = smoothstep(0.1, 0.5, n);
    
    gl_FragColor = vec4(color, alpha);
}`,
    uniforms: [
      { name: 'uIntensity', type: 'float', default: 1.5, min: 0.5, max: 3, step: 0.1, label: 'Intensity' },
      { name: 'uColorHot', type: 'color', default: '#ffff00', label: 'Hot Color' },
      { name: 'uColorCold', type: 'color', default: '#ff4400', label: 'Cold Color' }
    ]
  },
  {
    name: 'Water',
    description: 'Animated water surface',
    vertexShader: `uniform float uTime;
uniform float uWaveHeight;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    vUv = uv;
    
    float wave1 = sin(position.x * 2.0 + uTime) * cos(position.z * 2.0 + uTime * 0.7) * uWaveHeight;
    float wave2 = sin(position.x * 4.0 - uTime * 1.3) * cos(position.z * 3.0 + uTime) * uWaveHeight * 0.5;
    
    vec3 newPos = position + vec3(0.0, wave1 + wave2, 0.0);
    
    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    vNormal = normalize(normalMatrix * normal);
    
    gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: `uniform float uTime;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform float uFresnelPower;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    float fresnel = pow(1.0 - max(dot(vViewDir, vNormal), 0.0), uFresnelPower);
    
    // Fake caustics
    float caustic1 = sin(vUv.x * 20.0 + uTime) * sin(vUv.y * 20.0 + uTime * 0.7);
    float caustic2 = sin(vUv.x * 30.0 - uTime * 1.2) * sin(vUv.y * 25.0 + uTime);
    float caustics = (caustic1 + caustic2) * 0.1 + 0.2;
    
    vec3 color = mix(uDeepColor, uShallowColor, fresnel);
    color += caustics * 0.2;
    
    gl_FragColor = vec4(color, 0.8 + fresnel * 0.2);
}`,
    uniforms: [
      { name: 'uWaveHeight', type: 'float', default: 0.1, min: 0, max: 0.5, step: 0.01, label: 'Wave Height' },
      { name: 'uShallowColor', type: 'color', default: '#00d4ff', label: 'Shallow Color' },
      { name: 'uDeepColor', type: 'color', default: '#004488', label: 'Deep Color' },
      { name: 'uFresnelPower', type: 'float', default: 2.0, min: 0.5, max: 5, step: 0.1, label: 'Fresnel Power' }
    ]
  }
];

// ============================================================================
// SHADER ERROR PARSING
// ============================================================================

function parseShaderError(error: string, type: 'vertex' | 'fragment'): ShaderError[] {
  const errors: ShaderError[] = [];
  const lines = error.split('\n');
  
  for (const line of lines) {
    const match = line.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
    if (match) {
      errors.push({
        type,
        line: parseInt(match[1], 10),
        message: match[2]
      });
    }
  }
  
  if (errors.length === 0 && error.trim()) {
    errors.push({ type, line: 0, message: error });
  }
  
  return errors;
}

// ============================================================================
// 3D PREVIEW COMPONENT
// ============================================================================

interface ShaderMeshProps {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: any }>;
  geometry: 'sphere' | 'box' | 'torus' | 'plane' | 'cylinder';
  onError: (errors: ShaderError[]) => void;
  wireframe: boolean;
}

function ShaderMesh({ vertexShader, fragmentShader, uniforms, geometry, onError, wireframe }: ShaderMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [hasError, setHasError] = useState(false);
  
  // Create material
  const material = useMemo(() => {
    try {
      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          ...uniforms,
          uTime: { value: 0 },
          uMouse: { value: new THREE.Vector2(0, 0) },
          uResolution: { value: new THREE.Vector2(1, 1) }
        },
        transparent: true,
        wireframe,
        side: THREE.DoubleSide
      });
      
      // Force compilation
      const renderer = new THREE.WebGLRenderer();
      const testGeo = new THREE.BoxGeometry();
      const testMesh = new THREE.Mesh(testGeo, mat);
      const testScene = new THREE.Scene();
      testScene.add(testMesh);
      const testCamera = new THREE.PerspectiveCamera();
      
      try {
        renderer.compile(testScene, testCamera);
        onError([]);
        setHasError(false);
      } catch (e: any) {
        const errors = parseShaderError(e.message || e.toString(), 'fragment');
        onError(errors);
        setHasError(true);
      } finally {
        renderer.dispose();
        testGeo.dispose();
      }
      
      materialRef.current = mat;
      return mat;
    } catch (e: any) {
      const errors = parseShaderError(e.message || e.toString(), 'vertex');
      onError(errors);
      setHasError(true);
      return new THREE.MeshBasicMaterial({ color: '#ff4444', wireframe: true });
    }
  }, [vertexShader, fragmentShader, wireframe]);
  
  // Update uniforms
  useEffect(() => {
    if (materialRef.current) {
      Object.entries(uniforms).forEach(([key, val]) => {
        if (materialRef.current!.uniforms[key]) {
          materialRef.current!.uniforms[key].value = val.value;
        }
      });
    }
  }, [uniforms]);
  
  // Animate
  useFrame((state) => {
    if (materialRef.current && !hasError) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uMouse.value.set(
        state.mouse.x * 0.5 + 0.5,
        state.mouse.y * 0.5 + 0.5
      );
    }
    if (meshRef.current && geometry !== 'plane') {
      meshRef.current.rotation.y += 0.003;
    }
  });
  
  const geo = useMemo(() => {
    switch (geometry) {
      case 'sphere': return <sphereGeometry args={[1, 64, 64]} />;
      case 'box': return <boxGeometry args={[1.5, 1.5, 1.5]} />;
      case 'torus': return <torusGeometry args={[0.8, 0.3, 32, 100]} />;
      case 'plane': return <planeGeometry args={[3, 3, 64, 64]} />;
      case 'cylinder': return <cylinderGeometry args={[0.7, 0.7, 2, 32]} />;
    }
  }, [geometry]);
  
  return (
    <mesh ref={meshRef} material={material}>
      {geo}
    </mesh>
  );
}

// ============================================================================
// CODE EDITOR COMPONENT
// ============================================================================

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  errors: ShaderError[];
  label: string;
  shaderType: 'vertex' | 'fragment';
}

function CodeEditor({ code, onChange, errors, label, shaderType }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  
  const lines = code.split('\n');
  const errorLines = errors.filter(e => e.type === shaderType).map(e => e.line);
  
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0a0a0f] border-b border-[#2a2a3a]">
        <span className="text-xs text-text-secondary font-medium">{label}</span>
        {errors.filter(e => e.type === shaderType).length > 0 && (
          <span 
            className="text-xs text-red-400 flex items-center gap-1"
            role="alert"
            id={`${shaderType}-errors`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {errors.filter(e => e.type === shaderType).length} error(s)
          </span>
        )}
      </div>
      <div className="flex-1 flex overflow-hidden bg-[#1e1e2e]">
        <div 
          ref={lineNumbersRef}
          className="w-10 flex-shrink-0 bg-[#0a0a0f] text-right pr-2 py-2 overflow-hidden select-none"
        >
          {lines.map((_, i) => (
            <div 
              key={i} 
              className={`text-xs h-5 leading-5 ${
                errorLines.includes(i + 1) ? 'text-red-400 font-bold' : 'text-[#4a4a5a]'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          className="flex-1 bg-transparent text-[#d4d4d4] font-mono text-xs p-2 resize-none focus:outline-none leading-5"
          spellCheck={false}
          style={{ tabSize: 2 }}
          aria-label={`${shaderType === 'vertex' ? 'Vertex' : 'Fragment'} shader code editor`}
          aria-describedby={errors.filter(e => e.type === shaderType).length > 0 ? `${shaderType}-errors` : undefined}
        />
      </div>
    </div>
  );
}

// ============================================================================
// UNIFORM CONTROLS
// ============================================================================

interface UniformControlsProps {
  uniforms: UniformConfig[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
}

function UniformControls({ uniforms, values, onChange }: UniformControlsProps) {
  if (uniforms.length === 0) {
    return (
      <div className="text-center text-text-secondary text-sm py-4">
        No uniforms to control
      </div>
    );
  }
  
  return (
    <div className="space-y-4 p-4" role="group" aria-label="Shader uniform controls">
      {uniforms.map((uniform) => (
        <div key={uniform.name} className="space-y-1">
          <label id={`label-${uniform.name}`} className="text-xs text-text-secondary block">{uniform.label}</label>
          {uniform.type === 'float' && (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={uniform.min ?? 0}
                max={uniform.max ?? 1}
                step={uniform.step ?? 0.01}
                value={values[uniform.name] ?? uniform.default}
                onChange={(e) => onChange(uniform.name, parseFloat(e.target.value))}
                className="flex-1 accent-accent"
                aria-labelledby={`label-${uniform.name}`}
                aria-valuemin={uniform.min ?? 0}
                aria-valuemax={uniform.max ?? 1}
                aria-valuenow={values[uniform.name] ?? uniform.default}
              />
              <span className="text-xs text-accent w-12 text-right font-mono" aria-hidden="true">
                {(values[uniform.name] ?? uniform.default).toFixed(2)}
              </span>
            </div>
          )}
          {uniform.type === 'color' && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={values[uniform.name] ?? uniform.default}
                onChange={(e) => onChange(uniform.name, e.target.value)}
                className="w-10 h-8 rounded border-0 cursor-pointer"
                aria-labelledby={`label-${uniform.name}`}
              />
              <span className="text-xs text-text-secondary font-mono" aria-hidden="true">
                {values[uniform.name] ?? uniform.default}
              </span>
            </div>
          )}
          {uniform.type === 'vec3' && (
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={`label-${uniform.name}`}>
              {['x', 'y', 'z'].map((axis, i) => (
                <div key={axis} className="flex flex-col">
                  <span id={`${uniform.name}-${axis}`} className="text-[10px] text-text-secondary mb-1">{axis.toUpperCase()}</span>
                  <input
                    type="number"
                    step="0.1"
                    value={(values[uniform.name] ?? uniform.default)[i]}
                    onChange={(e) => {
                      const current = values[uniform.name] ?? [...(uniform.default as number[])];
                      const newVal = [...current];
                      newVal[i] = parseFloat(e.target.value) || 0;
                      onChange(uniform.name, newVal);
                    }}
                    className="w-full bg-bg-secondary px-2 py-1 rounded text-xs font-mono text-white"
                    aria-label={`${uniform.label} ${axis.toUpperCase()} component`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ShaderPlayground() {
  const [activePreset, setActivePreset] = useState(0);
  const [vertexShader, setVertexShader] = useState(SHADER_PRESETS[0].vertexShader);
  const [fragmentShader, setFragmentShader] = useState(SHADER_PRESETS[0].fragmentShader);
  const [uniformValues, setUniformValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<ShaderError[]>([]);
  const [geometry, setGeometry] = useState<'sphere' | 'box' | 'torus' | 'plane' | 'cylinder'>('sphere');
  const [wireframe, setWireframe] = useState(false);
  const [activeTab, setActiveTab] = useState<'vertex' | 'fragment'>('fragment');
  
  // Initialize uniform values from preset
  useEffect(() => {
    const preset = SHADER_PRESETS[activePreset];
    const values: Record<string, any> = {};
    preset.uniforms.forEach(u => {
      values[u.name] = u.default;
    });
    setUniformValues(values);
    setVertexShader(preset.vertexShader);
    setFragmentShader(preset.fragmentShader);
    setErrors([]);
  }, [activePreset]);
  
  // Convert uniform values to Three.js format
  const threeUniforms = useMemo(() => {
    const result: Record<string, { value: any }> = {};
    const preset = SHADER_PRESETS[activePreset];
    
    preset.uniforms.forEach(u => {
      const val = uniformValues[u.name] ?? u.default;
      if (u.type === 'color') {
        result[u.name] = { value: new THREE.Color(val) };
      } else if (u.type === 'vec3') {
        result[u.name] = { value: new THREE.Vector3(val[0], val[1], val[2]) };
      } else if (u.type === 'vec2') {
        result[u.name] = { value: new THREE.Vector2(val[0], val[1]) };
      } else {
        result[u.name] = { value: val };
      }
    });
    
    return result;
  }, [uniformValues, activePreset]);
  
  const handleUniformChange = useCallback((name: string, value: any) => {
    setUniformValues(prev => ({ ...prev, [name]: value }));
  }, []);
  
  const handleExport = useCallback(() => {
    const code = `// Vertex Shader
${vertexShader}

// Fragment Shader
${fragmentShader}

// Uniforms
${JSON.stringify(uniformValues, null, 2)}`;
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shader-${SHADER_PRESETS[activePreset].name.toLowerCase()}.glsl`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vertexShader, fragmentShader, uniformValues, activePreset]);
  
  const geometries: Array<{ value: typeof geometry; label: string; icon: ReactNode }> = [
    { value: 'sphere', label: 'Sphere', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg> },
    { value: 'box', label: 'Box', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21 16-9 5-9-5V8l9-5 9 5v8z"/><path d="m3.27 6.96 8.73 4.84 8.73-4.84"/><path d="M12 22.08V11.8"/></svg> },
    { value: 'torus', label: 'Torus', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="10"/></svg> },
    { value: 'plane', label: 'Plane', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> },
    { value: 'cylinder', label: 'Cylinder', icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/></svg> }
  ];
  
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <span className="font-bold text-white">Shader Playground</span>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-3 py-1.5 bg-accent/20 text-accent rounded text-sm hover:bg-accent/30 transition-colors"
          aria-label="Export shader code as GLSL file"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
      </div>
      
      {/* Preset Selector */}
      <div className="flex flex-wrap gap-2 p-4 bg-bg-secondary/50 border-b border-border" role="group" aria-label="Shader presets">
        {SHADER_PRESETS.map((preset, i) => (
          <button
            key={preset.name}
            onClick={() => setActivePreset(i)}
            className={`px-3 py-1.5 rounded text-sm transition-all ${
              activePreset === i 
                ? 'bg-accent text-black font-medium' 
                : 'bg-bg-card text-text-secondary hover:text-white border border-border'
            }`}
            aria-pressed={activePreset === i}
            aria-label={`${preset.name} shader preset: ${preset.description}`}
          >
            {preset.name}
          </button>
        ))}
      </div>
      
      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row" style={{ minHeight: '600px' }}>
        {/* Left: 3D Preview */}
        <div className="lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border">
          <div className="h-80 lg:h-full relative">
            <Canvas camera={{ position: [2.5, 2, 2.5], fov: 50 }}>
              <color attach="background" args={['#0a0a0f']} />
              <ambientLight intensity={0.3} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <Suspense fallback={null}>
                <ShaderMesh
                  vertexShader={vertexShader}
                  fragmentShader={fragmentShader}
                  uniforms={threeUniforms}
                  geometry={geometry}
                  onError={setErrors}
                  wireframe={wireframe}
                />
              </Suspense>
              <OrbitControls enableDamping dampingFactor={0.05} />
              <gridHelper args={[10, 10, '#2a2a3a', '#1a1a2a']} position={[0, -1.5, 0]} />
            </Canvas>
            
            {/* Geometry & Controls Overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 bg-black/80 rounded p-1">
                {geometries.map(g => (
                  <button
                    key={g.value}
                    onClick={() => setGeometry(g.value)}
                    className={`p-2 rounded transition-colors ${
                      geometry === g.value ? 'bg-accent text-black' : 'text-text-secondary hover:text-white'
                    }`}
                    title={g.label}
                  >
                    {g.icon}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 bg-black/80 px-3 py-2 rounded text-sm">
                <input
                  type="checkbox"
                  checked={wireframe}
                  onChange={(e) => setWireframe(e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-text-secondary">Wireframe</span>
              </label>
            </div>
            
            {/* Error Display */}
            {errors.length > 0 && (
              <div className="absolute top-4 left-4 right-4 bg-red-900/90 text-red-200 p-3 rounded text-xs font-mono max-h-32 overflow-auto">
                {errors.map((err, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-red-400">[{err.type}:{err.line}]</span>
                    <span>{err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Right: Code Editor & Controls */}
        <div className="lg:w-1/2 flex flex-col">
          {/* Tab Buttons */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('vertex')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'vertex' 
                  ? 'bg-[#1e1e2e] text-white border-b-2 border-accent' 
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              Vertex Shader
            </button>
            <button
              onClick={() => setActiveTab('fragment')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'fragment' 
                  ? 'bg-[#1e1e2e] text-white border-b-2 border-accent' 
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              Fragment Shader
            </button>
          </div>
          
          {/* Code Editor */}
          <div className="flex-1 min-h-[250px]">
            {activeTab === 'vertex' ? (
              <CodeEditor
                code={vertexShader}
                onChange={setVertexShader}
                errors={errors}
                label="vertex.glsl"
                shaderType="vertex"
              />
            ) : (
              <CodeEditor
                code={fragmentShader}
                onChange={setFragmentShader}
                errors={errors}
                label="fragment.glsl"
                shaderType="fragment"
              />
            )}
          </div>
          
          {/* Uniform Controls */}
          <div className="border-t border-border">
            <div className="flex items-center gap-2 px-4 py-2 bg-bg-secondary border-b border-border">
              <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v10"/>
                <path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24"/>
                <path d="M1 12h6m6 0h10"/>
                <path d="m4.93 19.07 4.24-4.24m5.66-5.66 4.24-4.24"/>
              </svg>
              <span className="text-sm font-medium text-white">Uniforms</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <UniformControls
                uniforms={SHADER_PRESETS[activePreset].uniforms}
                values={uniformValues}
                onChange={handleUniformChange}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Preset Description */}
      <div className="px-4 py-3 bg-bg-secondary/50 border-t border-border">
        <p className="text-sm text-text-secondary">
          <strong className="text-accent">{SHADER_PRESETS[activePreset].name}:</strong>{' '}
          {SHADER_PRESETS[activePreset].description}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// PIPELINE VISUALIZER
// ============================================================================

export function PipelineVisualizer() {
  const [step, setStep] = useState(0);
  
  const steps = [
    {
      title: 'Vertices (Model Space)',
      description: 'Raw vertex data from the 3D model. Each vertex has position, normal, UV coordinates.',
      code: `// Input: Vertex attributes
attribute vec3 position;  // (0, 1, 0), (1, 0, 0), ...
attribute vec3 normal;    // Surface direction
attribute vec2 uv;        // Texture coordinates`,
      color: '#ff6b6b'
    },
    {
      title: 'Vertex Shader',
      description: 'Processes each vertex. Transforms positions from model space to clip space using MVP matrix.',
      code: `// Vertex Shader
void main() {
    // Transform to clip space
    gl_Position = projectionMatrix 
                * viewMatrix 
                * modelMatrix 
                * vec4(position, 1.0);
    
    // Pass data to fragment shader
    vUv = uv;
    vNormal = normalMatrix * normal;
}`,
      color: '#6c5ce7'
    },
    {
      title: 'Rasterization',
      description: 'GPU converts triangles into fragments (potential pixels). Interpolates varying variables.',
      code: `// Hardware stage (not programmable)
// For each triangle:
//   1. Clip to view frustum
//   2. Transform to screen space
//   3. Generate fragments for each pixel
//   4. Interpolate varyings (vUv, vNormal, etc.)`,
      color: '#fdcb6e'
    },
    {
      title: 'Fragment Shader',
      description: 'Runs for each fragment. Calculates the final color using lighting, textures, and effects.',
      code: `// Fragment Shader
void main() {
    // Sample texture
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Calculate lighting
    float light = dot(vNormal, uLightDir);
    
    // Output final color
    gl_FragColor = texColor * light;
}`,
      color: '#00b894'
    },
    {
      title: 'Output (Framebuffer)',
      description: 'Final pixel colors are written to the framebuffer, which is displayed on screen.',
      code: `// Final output
// gl_FragColor = vec4(r, g, b, a)
// 
// Each fragment may also output:
//   - gl_FragDepth (depth buffer)
//   - Multiple render targets (MRT)`,
      color: '#00d4ff'
    }
  ];
  
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-bg-secondary border-b border-border">
        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2"/>
          <line x1="8" x2="16" y1="21" y2="21"/>
          <line x1="12" x2="12" y1="17" y2="21"/>
        </svg>
        <span className="font-bold text-white">GPU Rendering Pipeline</span>
      </div>
      
      {/* Pipeline Steps */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-6 overflow-x-auto pb-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center flex-shrink-0">
              <button
                onClick={() => setStep(i)}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                  step === i 
                    ? 'scale-110 shadow-lg' 
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{ 
                  backgroundColor: step >= i ? s.color : '#2a2a3a',
                  color: step >= i ? '#000' : '#666'
                }}
              >
                {i + 1}
              </button>
              {i < steps.length - 1 && (
                <div 
                  className="w-8 h-1 mx-1"
                  style={{ backgroundColor: step > i ? steps[i + 1].color : '#2a2a3a' }}
                />
              )}
            </div>
          ))}
        </div>
        
        {/* Current Step Content */}
        <div 
          className="p-4 rounded-lg border-2 transition-colors"
          style={{ borderColor: steps[step].color + '40', backgroundColor: steps[step].color + '10' }}
        >
          <h3 className="text-lg font-bold mb-2" style={{ color: steps[step].color }}>
            {steps[step].title}
          </h3>
          <p className="text-text-secondary text-sm mb-4">{steps[step].description}</p>
          <pre className="bg-black/30 p-3 rounded text-xs font-mono text-[#d4d4d4] overflow-x-auto">
            {steps[step].code}
          </pre>
        </div>
        
        {/* Navigation */}
        <div className="flex justify-between mt-4">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="px-4 py-2 bg-bg-secondary rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
            disabled={step === steps.length - 1}
            className="px-4 py-2 bg-accent text-black rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/80 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// UV VISUALIZER
// ============================================================================

export function UVVisualizer() {
  const [showGrid, setShowGrid] = useState(true);
  
  const uvShader = {
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform bool uShowGrid;
      varying vec2 vUv;
      
      void main() {
        vec3 color = vec3(vUv.x, vUv.y, 0.0);
        
        if (uShowGrid) {
          float gridX = step(0.02, mod(vUv.x, 0.1));
          float gridY = step(0.02, mod(vUv.y, 0.1));
          color = mix(vec3(1.0), color, gridX * gridY);
        }
        
        gl_FragColor = vec4(color, 1.0);
      }
    `
  };
  
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18"/>
            <path d="M3 15h18"/>
            <path d="M9 3v18"/>
            <path d="M15 3v18"/>
          </svg>
          <span className="font-bold text-white">UV Coordinate Visualizer</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-text-secondary">Show Grid</span>
        </label>
      </div>
      
      <div className="flex flex-col md:flex-row">
        <div className="h-64 md:h-80 md:flex-1">
          <Canvas camera={{ position: [2, 2, 2], fov: 50 }}>
            <color attach="background" args={['#0a0a0f']} />
            <mesh>
              <sphereGeometry args={[1, 32, 32]} />
              <shaderMaterial
                vertexShader={uvShader.vertexShader}
                fragmentShader={uvShader.fragmentShader}
                uniforms={{ uShowGrid: { value: showGrid } }}
              />
            </mesh>
            <OrbitControls enableDamping />
          </Canvas>
        </div>
        
        <div className="p-4 md:w-64 bg-bg-secondary/50 border-t md:border-t-0 md:border-l border-border">
          <h4 className="font-semibold text-white mb-2">UV Mapping</h4>
          <p className="text-sm text-text-secondary mb-4">
            UV coordinates map 2D textures to 3D surfaces. U goes from 0 (left) to 1 (right), 
            V goes from 0 (bottom) to 1 (top).
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }} />
              <span className="text-text-secondary">High U (right side)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(0, 255, 0)' }} />
              <span className="text-text-secondary">High V (top side)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(255, 255, 0)' }} />
              <span className="text-text-secondary">High U + V (corner)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(0, 0, 0)' }} />
              <span className="text-text-secondary">Low U + V (origin)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NORMAL VISUALIZER
// ============================================================================

export function NormalVisualizer() {
  const [space, setSpace] = useState<'world' | 'view'>('world');
  
  const worldNormalShader = {
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        vec3 color = vNormal * 0.5 + 0.5;
        gl_FragColor = vec4(color, 1.0);
      }
    `
  };
  
  const viewNormalShader = {
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize((modelViewMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        vec3 color = vNormal * 0.5 + 0.5;
        gl_FragColor = vec4(color, 1.0);
      }
    `
  };
  
  const shader = space === 'world' ? worldNormalShader : viewNormalShader;
  
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="m12 2 0 4"/>
            <path d="m12 18 0 4"/>
            <path d="m4.93 4.93 2.83 2.83"/>
            <path d="m16.24 16.24 2.83 2.83"/>
          </svg>
          <span className="font-bold text-white">Normal Visualizer</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSpace('world')}
            className={`px-3 py-1 rounded text-sm ${space === 'world' ? 'bg-accent text-black' : 'bg-bg-card text-text-secondary'}`}
          >
            World Space
          </button>
          <button
            onClick={() => setSpace('view')}
            className={`px-3 py-1 rounded text-sm ${space === 'view' ? 'bg-accent text-black' : 'bg-bg-card text-text-secondary'}`}
          >
            View Space
          </button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row">
        <div className="h-64 md:h-80 md:flex-1">
          <Canvas camera={{ position: [2, 2, 2], fov: 50 }}>
            <color attach="background" args={['#0a0a0f']} />
            <mesh>
              <torusKnotGeometry args={[0.8, 0.3, 128, 32]} />
              <shaderMaterial
                vertexShader={shader.vertexShader}
                fragmentShader={shader.fragmentShader}
              />
            </mesh>
            <OrbitControls enableDamping />
          </Canvas>
        </div>
        
        <div className="p-4 md:w-64 bg-bg-secondary/50 border-t md:border-t-0 md:border-l border-border">
          <h4 className="font-semibold text-white mb-2">Surface Normals</h4>
          <p className="text-sm text-text-secondary mb-4">
            Normals indicate surface direction. They're essential for lighting calculations.
            {space === 'view' ? ' View-space normals change as you rotate the camera.' : ' World-space normals stay fixed.'}
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#ff8080]" />
              <span className="text-text-secondary">+X (right)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#80ff80]" />
              <span className="text-text-secondary">+Y (up)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#8080ff]" />
              <span className="text-text-secondary">+Z (forward)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FRESNEL DEMO
// ============================================================================

export function FresnelDemo() {
  const [power, setPower] = useState(2);
  const [bias, setBias] = useState(0.1);
  const [coreColor, setCoreColor] = useState('#1a1a2e');
  const [edgeColor, setEdgeColor] = useState('#00ff88');
  
  const fresnelShader = {
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uCoreColor;
      uniform vec3 uEdgeColor;
      uniform float uPower;
      uniform float uBias;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      
      void main() {
        float fresnel = uBias + (1.0 - uBias) * pow(1.0 - abs(dot(vViewDir, vNormal)), uPower);
        vec3 color = mix(uCoreColor, uEdgeColor, fresnel);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  };
  
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-bg-secondary border-b border-border">
        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="6" strokeDasharray="2 2"/>
          <circle cx="12" cy="12" r="2"/>
        </svg>
        <span className="font-bold text-white">Fresnel Effect Demo</span>
      </div>
      
      <div className="flex flex-col lg:flex-row">
        <div className="h-64 lg:h-80 lg:flex-1">
          <Canvas camera={{ position: [2, 1, 2], fov: 50 }}>
            <color attach="background" args={['#0a0a0f']} />
            <mesh>
              <sphereGeometry args={[1, 64, 64]} />
              <shaderMaterial
                vertexShader={fresnelShader.vertexShader}
                fragmentShader={fresnelShader.fragmentShader}
                uniforms={{
                  uCoreColor: { value: new THREE.Color(coreColor) },
                  uEdgeColor: { value: new THREE.Color(edgeColor) },
                  uPower: { value: power },
                  uBias: { value: bias }
                }}
              />
            </mesh>
            <OrbitControls enableDamping />
          </Canvas>
        </div>
        
        <div className="p-4 lg:w-72 bg-bg-secondary/50 border-t lg:border-t-0 lg:border-l border-border">
          <h4 className="font-semibold text-white mb-4">Fresnel Formula</h4>
          <pre className="bg-black/30 p-2 rounded text-xs font-mono text-[#d4d4d4] mb-4">
{`fresnel = bias + (1 - bias) 
  * pow(1 - dot(V, N), power)`}
          </pre>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Power: {power.toFixed(1)}</label>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.1"
                value={power}
                onChange={(e) => setPower(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Bias: {bias.toFixed(2)}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bias}
                onChange={(e) => setBias(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-text-secondary block mb-1">Core</label>
                <input
                  type="color"
                  value={coreColor}
                  onChange={(e) => setCoreColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Edge</label>
                <input
                  type="color"
                  value={edgeColor}
                  onChange={(e) => setEdgeColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
          
          <p className="text-xs text-text-secondary mt-4">
            The Fresnel effect makes edges glow based on view angle. Used for shields, 
            holograms, X-ray effects, and realistic material rendering.
          </p>
        </div>
      </div>
    </div>
  );
}
