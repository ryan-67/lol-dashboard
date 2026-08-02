import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  MathUtils,
  Mesh,
  Points,
  Shape,
} from 'three'

interface SceneProgress {
  /** 0 → hero owns the viewport, 1 → hero fully scrolled away. */
  heroRef: MutableRefObject<number>
  /** 0 → top of page, 1 → bottom. Drives the persistent rotation. */
  pageRef: MutableRefObject<number>
  /** 0 → before finale, 1 → finale fully revealed. Spins + brightens the N. */
  finaleRef: MutableRefObject<number>
  /** 0–1 pulse during section hand-off gaps — drives a rapid spin burst. */
  boostRef?: MutableRefObject<number>
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

interface WordmarkProps {
  heroRef: MutableRefObject<number>
}

function Wordmark({ heroRef }: WordmarkProps) {
  const texture = useWordmarkTexture()
  const groupRef = useRef<Group>(null)
  const mainRef = useRef<Mesh>(null)
  const echoRef = useRef<Mesh>(null)

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    const p = heroRef.current
    /* Parallax against the pointer; lifts and dissolves as the hero hands
     * off so only the glass N persists into the story. */
    group.position.x = MathUtils.damp(group.position.x, -state.pointer.x * 0.34, 2.4, 1 / 60)
    group.position.y = MathUtils.damp(
      group.position.y,
      -state.pointer.y * 0.2 + p * 3.1,
      2.4,
      1 / 60,
    )
    const fade = MathUtils.clamp(1 - p * 1.65, 0, 1)
    const mainMat = mainRef.current?.material as { opacity?: number } | undefined
    const echoMat = echoRef.current?.material as { opacity?: number } | undefined
    if (mainMat) mainMat.opacity = 0.98 * fade
    if (echoMat) echoMat.opacity = 0.05 * fade
  })

  if (!texture) return null

  return (
    <group ref={groupRef}>
      <mesh ref={mainRef} position={[0, 0, -2.7]}>
        <planeGeometry args={[10.8, 3.375]} />
        <meshBasicMaterial map={texture} transparent opacity={0.98} toneMapped={false} />
      </mesh>
      <mesh ref={echoRef} position={[0.5, -0.4, -5.2]} scale={1.7}>
        <planeGeometry args={[10.8, 3.375]} />
        <meshBasicMaterial map={texture} transparent opacity={0.05} toneMapped={false} />
      </mesh>
    </group>
  )
}

const ACCENT_A = new Color('#8fe7ee')
const ACCENT_B = new Color('#bff0e9')
const ACCENT_FINALE = new Color('#ffffff')
const EDGE_COLOR = new Color('#6fd9e4')
const EDGE_FINALE = new Color('#ffffff')

function GlassN({ heroRef, pageRef, finaleRef, boostRef, compact }: SceneProgress) {
  const groupRef = useRef<Group>(null)
  const meshRef = useRef<Mesh>(null)
  const shellRef = useRef<Mesh>(null)
  const edgesRef = useRef<LineSegments>(null)
  const lastPageRef = useRef(0)
  const spinVelRef = useRef(0)
  const geometry = useMemo(buildNGeometry, [])
  const edges = useMemo(() => new EdgesGeometry(geometry, 14), [geometry])

  useEffect(
    () => () => {
      geometry.dispose()
      edges.dispose()
    },
    [geometry, edges],
  )

  useFrame((state, delta) => {
    const group = groupRef.current
    const mesh = meshRef.current
    if (!group || !mesh) return
    const time = state.clock.getElapsedTime()
    const hero = heroRef.current
    const page = pageRef.current
    const finale = MathUtils.clamp(finaleRef.current, 0, 1)

    /* Idle drift + pointer steer + persistent scroll rotation. Finale adds
     * a rapid spin burst before the brand plane takes over. */
    const targetRy =
      Math.sin(time * 0.22) * 0.3 +
      state.pointer.x * 0.5 +
      hero * 2.4 +
      page * 5.6 +
      finale * Math.PI * 3.4
    const targetRx =
      Math.cos(time * 0.17) * 0.1 - state.pointer.y * 0.3 + hero * 0.25 + finale * 0.35

    /* During the finale burst, chase the target harder so the spin reads. */
    const damp = finale > 0.05 ? 5.5 : 2.6
    group.rotation.y = MathUtils.damp(group.rotation.y, targetRy, damp, delta)
    group.rotation.x = MathUtils.damp(group.rotation.x, targetRx, damp, delta)

    /* Scroll-direction spin: scroll velocity feeds a smoothed angular kick —
     * clockwise on the way down, counter-clockwise back up. */
    const pageVel = delta > 0 ? (page - lastPageRef.current) / delta : 0
    lastPageRef.current = page
    spinVelRef.current = MathUtils.damp(spinVelRef.current, pageVel, 3, delta)
    group.rotation.y += spinVelRef.current * 7 * delta

    /* Hand-off burst: while a section transition gap is on screen, the N
     * spins rapidly (direction follows scroll) — the transition catalyst. */
    const boost = MathUtils.clamp(boostRef?.current ?? 0, 0, 1)
    if (boost > 0.01) {
      const dir = spinVelRef.current < 0 ? -1 : 1
      group.rotation.y += dir * boost * delta * 5.5
    }

    /* Extra free-spin while the finale is mid-transition. */
    if (finale > 0.05 && finale < 0.92) {
      group.rotation.y += delta * (1.8 + finale * 4.2)
    }

    /* Recede after the hero, then push forward + scale up for the finale. */
    const baseZ = -hero * 1.7
    const finaleZ = finale * 1.35
    group.position.y = Math.sin(time * 0.6) * 0.07
    group.position.z = MathUtils.damp(group.position.z, baseZ + finaleZ, 2.4, delta)
    const scale = 1 + finale * 0.18
    group.scale.setScalar(MathUtils.damp(group.scale.x, scale, 2.8, delta))

    /* Ambient tint + finale brighten. */
    const material = mesh.material as {
      color?: Color
      roughness?: number
      transmission?: number
    }
    if (material.color) {
      const blend = (Math.sin(time * 0.16) + 1) / 2
      material.color.copy(ACCENT_A).lerp(ACCENT_B, blend)
      if (finale > 0) material.color.lerp(ACCENT_FINALE, finale * 0.45)
    }
    if (typeof material.roughness === 'number') {
      material.roughness = MathUtils.lerp(0.06, 0.02, finale)
    }

    /* Turquoise holo rim — a breathing glow shell + edge lines keep the
     * glass readable mid-page; brightest during the finale spin. */
    const holoPulse = 0.5 + Math.sin(time * 1.4) * 0.5
    const shellMat = shellRef.current?.material as { opacity?: number; color?: Color } | undefined
    if (shellMat) {
      const midPresence = hero > 0.2 ? 0.3 : 0.18
      shellMat.opacity = MathUtils.clamp(
        midPresence + holoPulse * 0.08 + finale * 0.35,
        0.12,
        0.68,
      )
      if (shellMat.color) shellMat.color.copy(EDGE_COLOR).lerp(EDGE_FINALE, finale)
    }
    const edgeMat = edgesRef.current?.material as LineBasicMaterial | undefined
    if (edgeMat) {
      const midPresence = hero > 0.2 ? 0.62 : 0.42
      edgeMat.opacity = MathUtils.clamp(midPresence + holoPulse * 0.1 + finale * 0.35, 0.3, 1)
      edgeMat.color.copy(EDGE_COLOR).lerp(EDGE_FINALE, finale)
    }
  })

  return (
    <group ref={groupRef}>
      {/* Additive turquoise shell — soft holographic glow around the glass. */}
      <mesh ref={shellRef} geometry={geometry} scale={1.045}>
        <meshBasicMaterial
          color="#57c4cf"
          side={BackSide}
          transparent
          opacity={0.2}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Round-2 glass — deep transmissive turquoise, not milky. */}
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
      {/* Turquoise holo edge lines — crisp silhouette on matte black. */}
      <lineSegments ref={edgesRef} geometry={edges}>
        <lineBasicMaterial
          color="#6fd9e4"
          transparent
          opacity={0.5}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </group>
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
        opacity={0.5}
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
 * Persistent brand scene: the extruded glass N (refracting the in-scene
 * nucky wordmark) lives behind the whole landing page. During the hero it
 * owns the viewport; afterwards the wordmark dissolves and the N stays
 * centered with an off-white edge outline, rotating with scroll. Approaching
 * the finale, it brightens and spins rapidly before the brand plane takes over.
 */
export default function HeroN({ heroRef, pageRef, finaleRef, boostRef, compact }: SceneProgress) {
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
      <Wordmark heroRef={heroRef} />
      <GlassN
        heroRef={heroRef}
        pageRef={pageRef}
        finaleRef={finaleRef}
        boostRef={boostRef}
        compact={compact}
      />
      <DriftField compact={compact} />
    </Canvas>
  )
}
