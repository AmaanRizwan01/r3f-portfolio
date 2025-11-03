import React, { Suspense, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { 
  Environment, 
  Loader, 
  OrbitControls,
  Grid,
  Stats
} from '@react-three/drei';
import { SpaceShuttle } from './SpaceShuttle';
import { SpaceParticles } from './SpaceParticles';
import { CameraController } from './CameraController';
import './MainSection.css';

export default function MainSection() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Handle scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const windowHeight = window.innerHeight;
      const progress = Math.min(scrollTop / windowHeight, 1);
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle mouse movement
  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="main-section">
      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        }}
        onCreated={({ gl, camera }) => {
          console.log('Canvas created');
          console.log('Camera:', camera);
          console.log('WebGL Renderer:', gl);
        }}
      >
        {/* Add stats for debugging */}
        <Stats />
        
        {/* Add OrbitControls for debugging - remove later */}
        <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} />
        
        {/* Add grid to see the ground plane */}
        <Grid args={[20, 20]} />
        
        {/* Add axes helper to see orientation */}
        <axesHelper args={[5]} />
        
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={1}
            castShadow
          />
          
          {/* Main Objects */}
          <SpaceShuttle 
            scrollProgress={scrollProgress}
            mousePosition={mousePosition}
          />
          
          {/* Temporarily disable particles for clarity */}
          {/* <SpaceParticles count={200} /> */}
          
          {/* Camera Controller - temporarily disabled for OrbitControls */}
          {/* <CameraController scrollProgress={scrollProgress} /> */}
        </Suspense>
      </Canvas>
      
      {/* Debug info overlay */}
      <div style={{
        position: 'fixed',
        top: 10,
        left: 10,
        color: 'white',
        background: 'rgba(0,0,0,0.7)',
        padding: '10px',
        fontFamily: 'monospace',
        zIndex: 1000
      }}>
        <div>Scroll Progress: {scrollProgress.toFixed(2)}</div>
        <div>Mouse X: {mousePosition.x.toFixed(2)}</div>
        <div>Mouse Y: {mousePosition.y.toFixed(2)}</div>
        <div>Check console for model info</div>
      </div>
      
      <Loader />
    </div>
  );
}