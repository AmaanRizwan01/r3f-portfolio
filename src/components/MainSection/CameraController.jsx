import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function CameraController({ scrollProgress }) {
  const { camera } = useThree();
  const targetPosition = useRef(new THREE.Vector3());
  
  useEffect(() => {
    // Start with a simple view
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    
    console.log('Camera initial position:', camera.position);
  }, [camera]);
  
  // Simple scroll-based zoom out
  useFrame(() => {
    const zoomOut = 10 + scrollProgress * 10;
    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      zoomOut,
      0.05
    );
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}