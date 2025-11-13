import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  useGLTF,
  useAnimations,
  Environment,
  Loader as DreiLoader
} from '@react-three/drei'
import { EffectComposer, SelectiveBloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import './App.css'

// Only draw intro wireframe for these mesh/group names
//const WIREFRAME_TARGETS = ['Object_6', 'Object_18', 'Object_38', 'Object_20']
const WIREFRAME_TARGETS = ['Object_6', 'Object_20', 'Object_32']

// Easy knobs for DARK matte look
const DARK_MATTE = {
  metalness: 0.05,
  roughness: 0.95,
  envMapIntensity: 0.08,
  darkenFactor: 0.85
}

// Identify particle materials by name
function isParticleMaterialName(name) {
  if (!name) return false
  const n = name.toLowerCase()
  return n === 'emission' || n.includes('emiss') || n.includes('particle') || n.includes('fx') || n.includes('glow')
}

// Injects a "splash" reveal shader into a material (meshes) - uses uSplashProgress
function injectSplashShader(mat, introUniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSplashProgress = introUniforms.uSplashProgress
    shader.uniforms.uIntroStartPoint = introUniforms.uIntroStartPoint
    shader.uniforms.uTime = introUniforms.uTime

    shader.vertexShader = `
      varying vec3 vWorldPosition;
      ${shader.vertexShader}
    `.replace(
      `#include <begin_vertex>`,
      `#include <begin_vertex>
      vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    )
    
    shader.fragmentShader = `
      uniform float uSplashProgress;
      uniform vec3 uIntroStartPoint;
      uniform float uTime;
      varying vec3 vWorldPosition;
      ${shader.fragmentShader}
    `.replace(
      `#include <dithering_fragment>`,
      `#include <dithering_fragment>
      
      // Mesh reveal happens as uSplashProgress goes from 0.0 to 1.0.
      // If uSplashProgress starts at -1, smoothstep clamps to 0 until progress > 0.
      float modelRevealProgress = smoothstep(0.0, 1.0, uSplashProgress);

      float dist = distance(vWorldPosition, uIntroStartPoint);
      float revealRadius = modelRevealProgress * 15.0; // Increase for faster spatial sweep
      float edgeWidth = 2.0;

      // Ripple effect for the edge
      float ripple = sin(dist * 2.0 - uTime * 4.0) * 0.5 + 0.5;
      
      float op = smoothstep(revealRadius - edgeWidth, revealRadius, dist);
      float finalOpacity = mix(1.0, 0.0, op);
      
      // Add ripple only at the edge
      if (dist > revealRadius - edgeWidth && dist < revealRadius) {
        finalOpacity *= ripple;
      }
      
      if (finalOpacity < 0.01) {
        discard;
      }

      gl_FragColor = vec4(gl_FragColor.rgb, gl_FragColor.a * finalOpacity);
      `
    )
  }
}

// Merged material properties for desired lighting with intro animation compatibility
function tuneDarkMatte(root, onGlowTargets, introUniforms) {
  const glow = []
  root.traverse((child) => {
    if (child.isLight) {
      child.visible = false
      if ('intensity' in child) child.intensity = 0
      return
    }
    if (!child.isMesh) return

    child.castShadow = true
    child.receiveShadow = true

    if (child.geometry && !child.geometry.attributes.uv2 && child.geometry.attributes.uv) {
      child.geometry.setAttribute('uv2', child.geometry.attributes.uv.clone())
    }

    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach((mat) => {
      if (!mat) return

      if (mat.map) { mat.map.anisotropy = 8; mat.map.colorSpace = THREE.SRGBColorSpace }
      if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace
      if (mat.normalMap) mat.normalMap.colorSpace = THREE.LinearSRGBColorSpace
      if (mat.roughnessMap) mat.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace
      if (mat.metalnessMap) mat.metalnessMap.colorSpace = THREE.LinearSRGBColorSpace

      const isParticle = isParticleMaterialName(mat.name)

      if (isParticle) {
        if ('emissive' in mat) {
          const isBlack = !mat.emissive || (mat.emissive.r === 0 && mat.emissive.g === 0 && mat.emissive.b === 0)
          if (isBlack) mat.emissive = new THREE.Color('#88e8ff')
          mat.emissiveIntensity = 4.8
        }
        mat.toneMapped = false
        mat.transparent = true // for intro animation
        mat.depthWrite = true
        mat.depthTest = true
        mat.blending = THREE.NormalBlending
        mat.side = THREE.FrontSide
        mat.polygonOffset = true
        mat.polygonOffsetFactor = 1
        mat.polygonOffsetUnits = 1
        
        glow.push(child)
        child.renderOrder = Math.max(child.renderOrder || 0, 2)
      } else {
        if ('metalness' in mat) mat.metalness = DARK_MATTE.metalness
        if ('roughness' in mat) mat.roughness = DARK_MATTE.roughness
        if ('envMapIntensity' in mat) mat.envMapIntensity = DARK_MATTE.envMapIntensity
        if ('specularIntensity' in mat) mat.specularIntensity = 0.08
        if ('specularColor' in mat) mat.specularColor.set('#ffffff')
        if ('clearcoat' in mat) { mat.clearcoat = 0; mat.clearcoatRoughness = 1 }
        if ('sheen' in mat) mat.sheen = 0
        if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0
        
        if (mat.color) mat.color.multiplyScalar(DARK_MATTE.darkenFactor)

        mat.toneMapped = true
        mat.transparent = true // for intro animation
        mat.blending = THREE.NormalBlending
        mat.side = THREE.FrontSide
      }

      // Inject the splash shader into every material (uses uSplashProgress)
      injectSplashShader(mat, introUniforms)

      mat.needsUpdate = true
    })
  })
  onGlowTargets?.(glow)
}

const easeOutExpo   = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
const easeInOutCubic= (t) => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2)

function makePerfectLoopClip(src) {
  const clip = src.clone()
  const dur = src.duration
  clip.tracks = clip.tracks.map((track) => {
    const times = Array.from(track.times)
    const values = Array.from(track.values)
    const stride = track.getValueSize()
    if (!times.length) return track

    if (Math.abs(times[0]) > 1e-6) times[0] = 0
    const hasEndKey = Math.abs(times[times.length - 1] - dur) < 1e-6
    const firstVal = values.slice(0, stride)

    if (!hasEndKey) {
      times.push(dur)
      values.push(...firstVal)
    } else {
      for (let i = 0; i < stride; i++) {
        values[values.length - stride + i] = firstVal[i]
      }
    }

    if (/quaternion/i.test(track.constructor.name) || track.name.endsWith('.quaternion')) {
      const q0 = new THREE.Quaternion(firstVal[0], firstVal[1], firstVal[2], firstVal[3]).normalize()
      const li = values.length - stride
      const qL = new THREE.Quaternion(values[li], values[li+1], values[li+2], values[li+3]).normalize()
      if (q0.dot(qL) < 0) {
        values[li]   = -qL.x; values[li+1] = -qL.y; values[li+2] = -qL.z; values[li+3] = -qL.w
      }
    }

    const Typed = track.constructor
    const newTrack = new Typed(track.name, new Float32Array(times), new Float32Array(values))
    newTrack.setInterpolation(THREE.InterpolateLinear)
    return newTrack
  })
  clip.resetDuration()
  return clip
}

/**
 * Add wireframes that "splash in" and then "splash out".
 * This version uses uWireProgress so it can have an independent speed.
 */
function addWireframesToTargets(
  scene,
  targets,
  introUniforms,
  { color = '#dbe7ff', opacity = 0.6, threshold = 30, depthTest = true } = {}
) {
  const lines = []
  const normalize = (n) => String(n || '').toLowerCase().replace(/\.\d+$/, '') // strip .001 suffix
  const normalizedTargets = [...new Set((targets || []).map(normalize))]

  const nameMatches = (nodeName) => {
    const name = normalize(nodeName)
    return normalizedTargets.some((t) =>
      name === t ||
      name.startsWith(`${t}_`) ||
      name.startsWith(`${t}.`) ||
      name.startsWith(`${t}-`) ||
      name.startsWith(`${t} `)
    )
  }

  const matchesNodeOrAncestors = (node) => {
    let cur = node
    while (cur) {
      if (nameMatches(cur.name)) return true
      cur = cur.parent
    }
    return false
  }

  scene.traverse((child) => {
    if (!child.isMesh) return
    if (!matchesNodeOrAncestors(child)) return

    const edges = new THREE.EdgesGeometry(child.geometry, threshold)
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      toneMapped: true,
      depthTest,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWireProgress = introUniforms.uWireProgress
      shader.uniforms.uIntroStartPoint = introUniforms.uIntroStartPoint
      shader.uniforms.uTime = introUniforms.uTime

      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          `varying vec3 vWorldPosition;
           void main() {`
        )
        .replace(
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          `vWorldPosition = (modelMatrix * vec4( position, 1.0 )).xyz;
           gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );`
        )

      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform float uWireProgress;
           uniform vec3 uIntroStartPoint;
           uniform float uTime;
           varying vec3 vWorldPosition;
           void main() {`
        )
        .replace(
          /\}\s*$/,
          `
            float distWF = distance(vWorldPosition, uIntroStartPoint);
            float edgeWidthWF = 3.0; // Smoother fade thickness

            // Phase 1: Wireframe "splashes in" [-1..0]
            float revealProgress = smoothstep(-1.0, 0.0, uWireProgress);
            float revealRadius = revealProgress * 15.0;

            // Phase 2: Wireframe "splashes out" [0..1]
            float fadeProgress = smoothstep(0.0, 1.0, uWireProgress);
            float fadeRadius = fadeProgress * 15.0;

            float fadeInAlpha  = 1.0 - smoothstep(revealRadius - edgeWidthWF, revealRadius, distWF);
            float fadeOutAlpha = smoothstep(fadeRadius - edgeWidthWF, fadeRadius, distWF);

            float finalAlpha = min(fadeInAlpha, fadeOutAlpha);

            // Subtle ripple
            float ripple = 0.97 + 0.03 * sin(distWF * 2.0 - uTime * 4.0);

            gl_FragColor.a *= finalAlpha * ripple;
            if (gl_FragColor.a < 0.01) discard;
          }`
        )
    }

    const line = new THREE.LineSegments(edges, mat)
    line.renderOrder = 1000
    line.frustumCulled = false

    child.add(line)
    lines.push(line)
  })

  const cleanup = () => {
    lines.forEach((line) => {
      line.parent?.remove(line)
      line.geometry?.dispose?.()
      line.material?.dispose?.()
    })
  }

  return { lines, cleanup }
}

function SpaceStation({ scale = 0.6, onGlowTargets, introUniforms, showWireframe = true, wireframeTargets = WIREFRAME_TARGETS }) {
  const group = useRef()
  const gltf = useGLTF('/models/space_station_4.glb')
  const { scene, animations } = gltf
  const { actions, names, clips, mixer } = useAnimations(animations, group)

  const actionRef = useRef(null)
  const hoveredRef = useRef(false)
  const transitionRef = useRef({ progress: 0, from: 0.5, to: 0.5 })
  const wireRef = useRef({ lines: [], cleanup: null })

  const FORWARD_SPEED = 0.5
  const REVERSE_SPEED = -0.35
  const BRAKE_DURATION = 5.8
  const ACCEL_DURATION = 4.0

  const clipToPlay = useMemo(() => {
    return names.find((n) => /idle|loop|main|base|take|anim|action/i.test(n)) ||
           (clips?.length ? clips.reduce((a, b) => (a.duration > b.duration ? a : b)).name : names[0])
  }, [names, clips])

  useEffect(() => {
    tuneDarkMatte(scene, onGlowTargets, introUniforms)
    Object.values(actions).forEach((a) => a?.stop())

    if (clipToPlay) {
      const src = clips.find((c) => c.name === clipToPlay)
      const clip = src ? makePerfectLoopClip(src) : null
      const act = clip ? mixer.clipAction(clip, group.current) : actions[clipToPlay]

      if (act) {
        act.reset().setLoop(THREE.LoopRepeat, Infinity).play()
        act.clampWhenFinished = false
        act.timeScale = FORWARD_SPEED
        actionRef.current = act
        transitionRef.current = { progress: 1, from: FORWARD_SPEED, to: FORWARD_SPEED }

        return () => {
          act.stop()
          if (clip) mixer.uncacheClip(clip)
        }
      }
    }
  }, [actions, clipToPlay, clips, mixer, onGlowTargets, scene, group, introUniforms])

  // Attach/detach intro wireframes on the actual rendered scene
  useEffect(() => {
    if (showWireframe && scene && !wireRef.current.cleanup) {
      wireRef.current = addWireframesToTargets(
        scene,
        wireframeTargets,
        introUniforms,
        {
          color: '#dbe7ff',
          opacity: 0.6,
          threshold: 30,
          depthTest: true
        }
      )
    }
    if (!showWireframe && wireRef.current.cleanup) {
      wireRef.current.cleanup()
      wireRef.current = { lines: [], cleanup: null }
    }
    return () => {
      if (wireRef.current.cleanup) {
        wireRef.current.cleanup()
        wireRef.current = { lines: [], cleanup: null }
      }
    }
  }, [scene, showWireframe, wireframeTargets, introUniforms])

  const handleOver = (e) => {
    e.stopPropagation()
    if (hoveredRef.current) return
    hoveredRef.current = true
    document.body.style.cursor = 'pointer'
    const current = actionRef.current?.timeScale ?? FORWARD_SPEED
    transitionRef.current = { progress: 0, from: current, to: REVERSE_SPEED }
  }

  const handleOut = (e) => {
    e.stopPropagation()
    if (!hoveredRef.current) return
    hoveredRef.current = false
    document.body.style.cursor = 'default'
    const current = actionRef.current?.timeScale ?? REVERSE_SPEED
    transitionRef.current = { progress: 0, from: current, to: FORWARD_SPEED }
  }

  useFrame((_, dt) => {
    // Animation speed easing
    const act = actionRef.current
    if (act) {
      const trans = transitionRef.current
      const target = hoveredRef.current ? REVERSE_SPEED : FORWARD_SPEED
      const duration = hoveredRef.current ? BRAKE_DURATION : ACCEL_DURATION

      if (trans.progress < 1) {
        trans.progress = Math.min(1, trans.progress + dt / duration)
        const t = hoveredRef.current ? easeOutExpo(trans.progress) : easeInOutCubic(trans.progress)
        const speed = trans.from + (trans.to - trans.from) * t
        act.timeScale = Math.abs(speed) < 0.005 ? 0 : speed
      } else {
        act.timeScale = Math.abs(target) < 0.005 ? 0 : target
      }
    }

    // Optional: hard cleanup when wireframe fully revealed/finished
    const pWire = introUniforms?.uWireProgress?.value ?? 0
    if (pWire >= 0.999 && wireRef.current.cleanup) {
      wireRef.current.cleanup()
      wireRef.current = { lines: [], cleanup: null }
    }
  })

  return (
    <group ref={group} dispose={null}>
      <primitive
        object={scene}
        scale={scale}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      />
    </group>
  )
}

function SceneContent() {
  const [glowSelection, setGlowSelection] = useState([])
  const [introFinished, setIntroFinished] = useState(false)

  // Independent timelines: wireframe and splash/mesh
  const wireProgressRef = useRef({ value: -1 })
  const splashProgressRef = useRef({ value: -1 })

  // Tweak these to control start times and durations
  const WIRE_DELAY_MS = 2500
  const SPLASH_DELAY_MS = 500
  // Duration for each to go from -1 → +1 (two units total)
  const WIRE_TOTAL_SECONDS = 3.5
  const SPLASH_TOTAL_SECONDS = 6

  // Optional: control spatial sweep speed (the radius factor in shaders)
  // Increase for faster spatial expansion, decrease for slower
  // You can also expose these as uniforms if you want to tweak live.
  // Currently hard-coded in shaders as 15.0.

  const introUniforms = useMemo(() => ({
    uWireProgress: wireProgressRef.current,
    uSplashProgress: splashProgressRef.current,
    uIntroStartPoint: { value: new THREE.Vector3(0, 0, 0) },
    uTime: { value: 0 },
  }), [])

  useEffect(() => {
    const t1 = setTimeout(() => {
      wireProgressRef.current.isAnimating = true
    }, WIRE_DELAY_MS)
    const t2 = setTimeout(() => {
      splashProgressRef.current.isAnimating = true
    }, SPLASH_DELAY_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useFrame((state, dt) => {
    introUniforms.uTime.value = state.clock.elapsedTime

    const advance = (ref, totalSeconds) => {
      // Move -1 → +1 over totalSeconds (2 units / second)
      if (ref.current.isAnimating && ref.current.value < 1) {
        const unitsPerSecond = 2 / totalSeconds
        ref.current.value = Math.min(1, ref.current.value + unitsPerSecond * dt)
      }
    }

    advance(wireProgressRef, WIRE_TOTAL_SECONDS)
    advance(splashProgressRef, SPLASH_TOTAL_SECONDS)

    // Hide wireframe overlay when it's done
    if (!introFinished && wireProgressRef.current.value >= 1) {
      setIntroFinished(true)
    }
  })

  return (
    <>
      <ParallaxRig>
        <ColoredStars count={1200} radius={120} depth={40} />
        <StarFlares count={100} radius={115} minIdle={1.0} maxIdle={3.0} minDur={1.6} maxDur={2.6} />
        <NebulaFog color="#0c1840" opacity={0.05} scale={200} />

        <spotLight castShadow color="#ffffff" intensity={1.35} angle={0.55} penumbra={0.9} position={[6, 6, 6]} distance={35} shadow-bias={-0.00025} shadow-normalBias={0.03} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <directionalLight color="#9ec2ff" intensity={1.65} position={[-6, 3, 4]} />
        <directionalLight color="#9ec2ff" intensity={1.65} position={[-6, 3, -4]} />
        <directionalLight color="#9ec2ff" intensity={3.65} position={[6, 3, -4]} />
        <ambientLight intensity={5.0} />
        <hemisphereLight intensity={1.12} color="#dfe7ff" groundColor="#0b0b10" />

        <Suspense fallback={null}>
          <Environment preset="night" background={false} blur={0.2} />
          <SpaceStation
            scale={0.6}
            onGlowTargets={setGlowSelection}
            introUniforms={introUniforms}
            showWireframe={!introFinished}
            wireframeTargets={WIREFRAME_TARGETS}
          />
        </Suspense>
      </ParallaxRig>

      <EffectComposer disableNormalPass>
        {/* CHANGED: raise threshold so faint wireframe lines don't bloom */}
        <SelectiveBloom selection={glowSelection} intensity={0.5} radius={0.75} luminanceThreshold={0.7} luminanceSmoothing={0} mipmapBlur />
        <Vignette eskil offset={0.18} darkness={0.58} />
      </EffectComposer>
    </>
  )
}

function ParallaxRig({ children, yaw = 0.045, pitch = 0.03, pos = 0.07, ease = 7.8, deadzone = 0.012, mobileScale = 0.6 }) {
  const rig = useRef()
  const { pointer, size } = useThree()

  useFrame((_, dt) => {
    const scale = size.width < 1024 ? mobileScale : 1
    let px = THREE.MathUtils.clamp(pointer.x || 0, -1, 1)
    let py = THREE.MathUtils.clamp(pointer.y || 0, -1, 1)
    if (Math.abs(px) < deadzone) px = 0
    if (Math.abs(py) < deadzone) py = 0

    const targetYaw   = px * yaw * scale
    const targetPitch = -py * pitch * scale
    const targetX     = px * pos * scale
    const targetY     = py * pos * 0.5 * scale

    rig.current.rotation.y = THREE.MathUtils.damp(rig.current.rotation.y, targetYaw, ease, dt)
    rig.current.rotation.x = THREE.MathUtils.damp(rig.current.rotation.x, targetPitch, ease, dt)
    rig.current.position.x = THREE.MathUtils.damp(rig.current.position.x, targetX, ease, dt)
    rig.current.position.y = THREE.MathUtils.damp(rig.current.position.y, targetY, ease, dt)
  })

  return <group ref={rig}>{children}</group>
}

function NebulaFog({ color = '#0a1636', opacity = 0.07, scale = 180 }) {
  return (
    <mesh scale={scale}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color={color} side={THREE.BackSide} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

function useFlareTexture() {
  return useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const grd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.35, 'rgba(200,230,255,0.6)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    tex.needsUpdate = true
    return tex
  }, [])
}

function StarFlares({
  count = 100, radius = 115, minIdle = 1.0, maxIdle = 3.0, minDur = 1.6, maxDur = 2.6, baseScale = 0.18, maxScale = 1.1, color = '#a6c8ff'
}) {
  const matTex = useFlareTexture()
  const refs = useRef([])
  const states = useRef([])

  const rand = (a, b) => a + Math.random() * (b - a)
  const randOnSphere = (r) => {
    const u = Math.random(), v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    return new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi))
  }

  useMemo(() => {
    states.current = Array.from({ length: count }).map(() => ({ t: -(rand(minIdle, maxIdle)), dur: rand(minDur, maxDur), pos: randOnSphere(radius) }))
  }, [count, minIdle, maxIdle, minDur, maxDur, radius])

  useFrame((_, dt) => {
    for (let i = 0; i < states.current.length; i++) {
      const s = states.current[i]
      const spr = refs.current[i]
      if (!spr) continue
      s.t += dt
      if (s.t < 0) { spr.material.opacity = 0; continue }
      const p = s.t / s.dur
      if (p <= 1) {
        const tri = p < 0.5 ? p / 0.5 : (1 - p) / 0.5
        const e = tri * tri * (3 - 2 * tri)
        const scale = baseScale + (maxScale - baseScale) * e
        spr.scale.setScalar(scale)
        spr.material.opacity = 0.15 + 0.85 * e
      } else {
        s.t = -(rand(minIdle, maxIdle))
        s.dur = rand(minDur, maxDur)
        s.pos = randOnSphere(radius)
        spr.position.copy(s.pos)
        spr.material.opacity = 0
      }
    }
  })

  return (
    <group frustumCulled={false}>
      {Array.from({ length: count }).map((_, i) => (
        <sprite key={i} ref={(el) => (refs.current[i] = el)} position={states.current[i]?.pos || [0, 0, -radius]} scale={[baseScale, baseScale, 1]} frustumCulled={false}>
          <spriteMaterial map={matTex} color={color} transparent opacity={0} depthWrite={false} depthTest blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}

function ColoredStars({ count = 1200, radius = 120, depth = 40, small=0.65, medium=1.2, large=2.0 }) {
  const starTex = useMemo(() => {
    const size = 128
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    const grd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    grd.addColorStop(0.0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.35, 'rgba(255,255,255,0.7)')
    grd.addColorStop(1.0, 'rgba(0,0,0,0)')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, size, 0 + size)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  }, [])

  const makeCloud = useMemo(() => {
    return (n) => {
      const pos = new Float32Array(n * 3)
      const col = new Float32Array(n * 3)

      const dist = [
        { w: 0.06, pool: ['#bcd8ff', '#a9c7ff', '#9fc4ff'] },
        { w: 0.26, pool: ['#ffffff', '#f5f8ff', '#eef3ff'] },
        { w: 0.40, pool: ['#fff4cc', '#ffe9b0', '#ffe2a2'] },
        { w: 0.21, pool: ['#ffd0a2', '#ffc08b'] },
        { w: 0.07, pool: ['#ffb09a', '#ff9a89'] }
      ]
      const sumW = dist.reduce((a, d) => a + d.w, 0)

      for (let i = 0; i < n; i++) {
        const r = radius - Math.random() * depth
        const u = Math.random(), v = Math.random()
        const theta = 2 * Math.PI * u
        const phi = Math.acos(2 * v - 1)
        pos[i*3+0] = r * Math.sin(phi) * Math.cos(theta)
        pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta)
        pos[i*3+2] = r * Math.cos(phi)

        let pick = Math.random() * sumW, idx = 0
        for (let j = 0; j < dist.length; j++) {
          if (pick < dist[j].w) { idx = j; break }
          pick -= dist[j].w; idx = j
        }
        const hex = dist[idx].pool[Math.floor(Math.random() * dist[idx].pool.length)]
        const c = new THREE.Color(hex).convertSRGBToLinear()
        const k = 0.8 + Math.random() * 0.2
        c.multiplyScalar(k)
        col[i*3+0] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      return geo
    }
  }, [radius, depth])

  const nSmall = Math.floor(count * 0.7)
  const nMed = Math.floor(count * 0.25)
  const nLarge = count - nSmall - nMed

  const geoSmall = useMemo(() => makeCloud(nSmall), [makeCloud, nSmall])
  const geoMed   = useMemo(() => makeCloud(nMed), [makeCloud, nMed])
  const geoLarge = useMemo(() => makeCloud(nLarge), [makeCloud, nLarge])

  return (
    <group frustumCulled={false}>
      <points geometry={geoSmall} frustumCulled={false}>
        <pointsMaterial map={starTex} vertexColors transparent opacity={0.9} size={small} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
      <points geometry={geoMed} frustumCulled={false}>
        <pointsMaterial map={starTex} vertexColors transparent opacity={0.95} size={medium} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
      <points geometry={geoLarge} frustumCulled={false}>
        <pointsMaterial map={starTex} vertexColors transparent opacity={1.0} size={large} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </group>
  )
}

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [-5.2, -0.3, 8], fov: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          physicallyCorrectLights: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.95
        }}
        onWheel={(e) => { e.stopPropagation(); e.preventDefault() }}
        style={{ touchAction: 'none' }}
      >
        <color attach="background" args={['#000']} />
        <fogExp2 attach="fog" args={['#0a1028', 0.012]} />
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <DreiLoader />
    </div>
  )
}

export default App

useGLTF.preload('/models/space_station_4.glb')