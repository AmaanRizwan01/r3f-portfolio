import { shaderMaterial } from '@react-three/drei';
import { extend, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

const TextureRevealShaderMaterial = shaderMaterial(
  {
    uRevealProgress: 0,
    uScrollProgress: 0,
    uTime: 0,
    uBaseColor: new THREE.Color('#ffffff'),
  },
  // Vertex shader
  `
    varying vec2 vUv;
    varying vec3 vPosition;
    
    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment shader
  `
    uniform float uRevealProgress;
    uniform float uScrollProgress;
    uniform float uTime;
    uniform vec3 uBaseColor;
    
    varying vec2 vUv;
    varying vec3 vPosition;
    
    void main() {
      // Create splash effect from top to bottom
      float revealLine = 1.0 - uRevealProgress;
      float distFromLine = vUv.y - revealLine;
      
      // Splash spreading effect
      float spread = sin(distFromLine * 10.0 - uTime * 2.0) * 0.1;
      float reveal = smoothstep(0.0, 0.3 + spread, distFromLine);
      
      // Mix between wireframe white and textured color
      vec3 wireframeColor = vec3(1.0);
      vec3 textureColor = uBaseColor * (0.5 + 0.5 * sin(vUv.x * 20.0));
      
      vec3 finalColor = mix(wireframeColor, textureColor, reveal * (1.0 - uScrollProgress * 0.5));
      
      // Add glow at the reveal edge
      float edgeGlow = exp(-abs(distFromLine) * 10.0) * uRevealProgress * (1.0 - uRevealProgress);
      finalColor += vec3(0.0, 1.0, 1.0) * edgeGlow * 0.5;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
);

extend({ TextureRevealShaderMaterial });

export function TextureRevealMaterial({ revealProgress, scrollProgress, baseTexture }) {
  const materialRef = useRef();
  
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
      materialRef.current.uRevealProgress = revealProgress;
      materialRef.current.uScrollProgress = scrollProgress;
    }
  });
  
  return (
    <textureRevealShaderMaterial
      ref={materialRef}
      uRevealProgress={revealProgress}
      uScrollProgress={scrollProgress}
      side={THREE.DoubleSide}
    />
  );
}