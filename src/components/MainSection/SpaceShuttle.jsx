import React, { useRef, useState, useEffect } from 'react';
import { useGLTF, Box, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function SpaceShuttle({ scrollProgress, mousePosition }) {
  const groupRef = useRef();
  const [modelLoaded, setModelLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [isWireframe, setIsWireframe] = useState(true);
  const [revealProgress, setRevealProgress] = useState(0);

  // Try to load the GLB file with error handling
  let gltf = null;
  try {
    gltf = useGLTF('/assets/space_station_4.glb');
    console.log('GLTF Loaded:', gltf);
  } catch (err) {
    console.error('Error loading GLB:', err);
    setError(err.message);
  }

  useEffect(() => {
    if (gltf) {
      setModelLoaded(true);
      console.log('Model nodes:', gltf.nodes);
      console.log('Model materials:', gltf.materials);
      console.log('Model scene:', gltf.scene);
      
      // Log bounding box to understand model size
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      console.log('Model size:', size);
      console.log('Model center:', box.getCenter(new THREE.Vector3()));
    }
  }, [gltf]);

  // Animate texture reveal
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsWireframe(false);
      const interval = setInterval(() => {
        setRevealProgress(prev => {
          if (prev >= 1) {
            clearInterval(interval);
            return 1;
          }
          return prev + 0.02;
        });
      }, 30);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Mouse parallax effect
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        mousePosition.x * 0.05,
        0.05
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        mousePosition.y * 0.02,
        0.05
      );
    }
  });

  // If there's an error or model hasn't loaded, show a placeholder
  if (error || !gltf) {
    return (
      <group ref={groupRef}>
        {/* Placeholder box */}
        <Box args={[2, 2, 2]} position={[0, 0, 0]}>
          <meshBasicMaterial 
            wireframe={isWireframe}
            color={isWireframe ? "#ffffff" : "#666666"}
            transparent
            opacity={1 - scrollProgress * 0.5}
          />
        </Box>
        <Html center>
          <div style={{ color: 'white', background: 'rgba(255,0,0,0.5)', padding: '10px' }}>
            {error ? `Error: ${error}` : 'Loading model...'}
          </div>
        </Html>
      </group>
    );
  }

  // Apply materials to the loaded model
  if (gltf.scene) {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (isWireframe) {
          child.material = new THREE.MeshBasicMaterial({
            wireframe: true,
            color: '#ffffff',
            transparent: true,
            opacity: 1 - scrollProgress * 0.5
          });
        } else {
          // Use original material or a default one
          if (!child.userData.originalMaterial) {
            child.userData.originalMaterial = child.material;
          }
          child.material = child.userData.originalMaterial || new THREE.MeshStandardMaterial({
            color: '#666666',
            metalness: 0.5,
            roughness: 0.5
          });
          child.material.transparent = true;
          child.material.opacity = revealProgress;
        }
      }
    });
  }

  return (
    <group ref={groupRef}>
      {/* Helper box to see position */}
      <Box args={[0.5, 0.5, 0.5]} position={[0, -3, 0]}>
        <meshBasicMaterial color="red" wireframe />
      </Box>
      
      {/* Try different scales - start with 1 and adjust */}
      <primitive 
        object={gltf.scene} 
        scale={[1, 1, 1]}  // Try: 0.001, 0.01, 0.1, 1, 10, 100
        position={[0, 0, 0]}
      />
      
      {/* Show debug info */}
      <Html position={[0, 3, 0]}>
        <div style={{ color: 'white', background: 'rgba(0,0,0,0.5)', padding: '5px' }}>
          Model Loaded: {modelLoaded ? 'Yes' : 'No'}
        </div>
      </Html>
    </group>
  );
}