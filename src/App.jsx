// App.jsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }}>
      <ambientLight />
      <mesh>
        <boxGeometry />
        <meshStandardMaterial color="hotpink" />
      </mesh>
      <OrbitControls />
    </Canvas>
  )
}