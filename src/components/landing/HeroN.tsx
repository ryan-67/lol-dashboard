import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  Points,
  Shape,
} from 'three'

interface HeroNProps {
  /** 0 → hero owns the viewport, 1 → hero fully scrolled away. */
  scrollRef: MutableRefObject<number>
  /** Lower fidelity path for small screens. */
  compact?: boolean
}

/* Letterform: a blocky N drawn as a single polygon, extruded with a soft
 * bevel. Original nucky geometry — not a loaded model. */
function buildNGeometry(): ExtrudeGeometry {
  const W = 1.9
  const H = 2.5
  const t = 0.52
  const k = 0.98

  const shape = new Shape()
  shape.moveTo(0, 0)
  shape.lineTo(0, H)
  shape.lineTo(t, H)
  shape.lineTo(W - t, k)
  shape.lineTo(W - t, H)
  shape.lineTo(W, H)
  shape.lineTo(W, 0)
  shape.lineTo(W - t, 0)
  shape.lineTo(t, H - k)
  shape.lineTo(t, 0)
  shape.closePath()

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.62,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.05,
    bevelSegments: 4,
    curveSegments: 8,
  })
  geometry.center()
  return geometry
}

/** Draw the wordmark into a texture so the glass N genuinely refracts it. */
function useWordmarkTexture(): CanvasTexture | null {
  const [texture, setTexture] = useState<CanvasTexture | null>(null)

  useEffect(() => {
    let alive = true
    const draw = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 2048
      canvas.height = 640
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      /* Soft echo behind the main mark for spatial depth. */
      ctx.font = '650 400px "IBM Plex Sans", sans-serif'
      ctx.fillStyle = 'rgba(243, 240, 231, 0.92)'
      ctx.fillText('nucky', canvas.width / 2, canvas.height / 2 + 20)

      /* Turquoise period — the brand tick. */
      const metrics = ctx.measureText('nucky')
      ctx.fillStyle = 'rgba(94, 210, 222, 0.95)'
      ctx.fillText('.', canvas.width / 2 + metrics.width / 2 + 56, canvas.height / 2 + 20)

      const tex = new CanvasTexture(canvas)
      tex.minFilter = LinearFilter
      tex.magFilter = LinearFilter
      tex.anisotropy = 4
      if (alive) setTexture(tex)
    }

    if ('fonts' in document) {
      void document.fonts.ready.then(() => {
        if (alive) draw()
      })
    } else {
      draw()
    }

    return () => {
      alive = false
    }
  }, [])

  return texture
}

function Wordmark({ scrollRef }: { scrollRef: MutableRefObject<number> }) {
  const texture = useWordmarkTexture()
  const groupRef = useRef<Group>(null)

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    const p = scrollRef.current
    /* The mark drifts against the pointer for parallax and slides upward
     * as the hero hands off to the story. */
    group.position.x = MathUtils.damp(group.position.x, -state.pointer.x * 0.34, 2.4, 1 / 60)
    group.position.y = MathUtils.damp(
      group.position.y,
      -state.pointer.y * 0.2 + p * 2.6,
      2.4,
      1 / 60,
    )
  })

  if (!texture) return null

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, -2.7]}>
        <planeGeometry args={[10.8, 3.375]} />
        <meshBasicMaterial map={texture} transparent opacity={0.98} toneMapped={false} />
      </mesh>
      <mesh position={[0.5, -0.4, -5.2]} scale={1.7}>
        <planeGeometry args={[10.8, 3.375]} />
        <meshBasicMaterial map={texture} transparent opacity={0.05} toneMapped={false} />
      </mesh>
    </group>
  )
}

const ACCENT_A = new Color('#8fe7ee')
const ACCENT_B = new Color('#bff0e9')

function GlassN({ scrollRef, compact }: HeroNProps) {
  const meshRef = useRef<Mesh>(null)
  const geometry = useMemo(buildNGeometry, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const time = state.clock.getElapsedTime()
    const p = scrollRef.current

    /* Idle drift + pointer steer + scroll hand-off, all damped so the
     * material feels weighted rather than springy. */
    const targetRy = Math.sin(time * 0.22) * 0.34 + state.pointer.x * 0.5 + p * 1.9
    const targetRx = Math.cos(time * 0.17) * 0.12 - state.pointer.y * 0.34 + p * 0.4
    mesh.rotation.y = MathUtils.damp(mesh.rotation.y, targetRy, 2.6, 1 / 60)
    mesh.rotation.x = MathUtils.damp(mesh.rotation.x, targetRx, 2.6, 1 / 60)
    mesh.position.y = Math.sin(time * 0.6) * 0.07 - p * 1.4
    mesh.position.z = p * 2.2

    /* Slow ambient tint cycle around the turquoise signature. */
    const material = mesh.material as { color?: Color }
    if (material.color) {
      const blend = (Math.sin(time * 0.16) + 1) / 2
      material.color.copy(ACCENT_A).lerp(ACCENT_B, blend)
    }
  })

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <MeshTransmissionMaterial
        transmission={1}
        samples={compact ? 4 : 7}
        resolution={compact ? 256 : 512}
        thickness={1.1}
        roughness={0.06}
        ior={1.48}
        chromaticAberration={0.32}
        anisotropicBlur={0.22}
        distortion={0.24}
        distortionScale={0.32}
        temporalDistortion={0.08}
        attenuationDistance={2.2}
        attenuationColor="#57c4cf"
        color="#8fe7ee"
        backside={!compact}
        backsideThickness={0.3}
      />
    </mesh>
  )
}

const PARTICLE_COUNT = 130

function DriftField({ compact }: { compact?: boolean }) {
  const pointsRef = useRef<Points>(null)
  const count = compact ? 60 : PARTICLE_COUNT

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8
      arr[i * 3 + 2] = -1 - Math.random() * 5
    }
    return arr
  }, [count])

  useFrame((state) => {
    const points = pointsRef.current
    if (!points) return
    const time = state.clock.getElapsedTime()
    points.rotation.z = time * 0.008
    points.position.y = Math.sin(time * 0.12) * 0.28
    points.position.x = state.pointer.x * 0.22
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#57c4cf"
        transparent
        opacity={0.42}
        sizeAttenuation
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

/** Studio-style environment built from lightformers — zero network fetches. */
function StudioRig() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer intensity={2.2} position={[0, 3, 4]} scale={[9, 3, 1]} color="#eafcff" />
      <Lightformer intensity={1.1} position={[-5, -1, 3]} rotation-y={0.6} scale={[4, 6, 1]} color="#57c4cf" />
      <Lightformer intensity={0.85} position={[5, 0, 2]} rotation-y={-0.6} scale={[3, 7, 1]} color="#f3f0e7" />
      <Lightformer intensity={0.5} position={[0, -4, 2]} scale={[10, 2, 1]} color="#0e3f46" />
    </Environment>
  )
}

/**
 * Hero centerpiece: an extruded glass N refracting the nucky wordmark
 * suspended behind it, over a slow particle drift. Pointer steers the
 * material; scroll hands the composition off to the story below.
 */
export default function HeroN({ scrollRef, compact }: HeroNProps) {
  return (
    <Canvas
      dpr={compact ? [1, 1.4] : [1, 1.8]}
      camera={{ position: [0, 0, 6.6], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
      eventSource={typeof document !== 'undefined' ? document.body : undefined}
      eventPrefix="client"
    >
      <StudioRig />
      <Wordmark scrollRef={scrollRef} />
      <GlassN scrollRef={scrollRef} compact={compact} />
      <DriftField compact={compact} />
    </Canvas>
  )
}
