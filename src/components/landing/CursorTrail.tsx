import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { coarsePointer, reducedMotion } from './motion'

/* Luminous fluid cursor trail (Three.js ping-pong feedback buffer with curl
 * noise advection). Adapted from the cursor-trail reference implementation,
 * recolored to the nucky turquoise signal palette. Desktop / fine pointers
 * only; the canvas is screen-blended over the page so black stays invisible.
 */

const TRAIL_FRAGMENT = /* glsl */ `
uniform vec2 uResolution;
uniform sampler2D uMap;
uniform vec2 uPointer;
uniform float uDt;
uniform float uSpeed;
uniform float uTime;

vec4 permute(vec4 x){return mod(x*x*34.+x,289.);}
float snoise(vec3 v){
  const vec2 C = 1./vec2(6,3);
  const vec4 D = vec4(0,.5,1,2);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1. - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.x;
  vec3 x2 = x0 - i2 + C.y;
  vec3 x3 = x0 - D.yyy;
  i = mod(i,289.);
  vec4 p = permute( permute( permute(
      i.z + vec4(0., i1.z, i2.z, 1.))
    + i.y + vec4(0., i1.y, i2.y, 1.))
    + i.x + vec4(0., i1.x, i2.x, 1.));
  vec3 ns = .142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49. * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = floor(j - 7. * x_ ) *ns.x + ns.yyyy;
  vec4 h = 1. - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 sh = -step(h, vec4(0));
  vec4 a0 = b0.xzyw + (floor(b0)*2.+ 1.).xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + (floor(b1)*2.+ 1.).xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = inversesqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.);
  return .5 + 12. * dot( m * m * m, vec4( dot(p0,x0), dot(p1,x1),dot(p2,x2), dot(p3,x3) ) );
}

vec3 snoiseVec3( vec3 x ){
  return vec3(  snoise(vec3( x )*2.-1.),
                snoise(vec3( x.y - 19.1 , x.z + 33.4 , x.x + 47.2 ))*2.-1.,
                snoise(vec3( x.z + 74.2 , x.x - 124.5 , x.y + 99.4 )*2.-1.)
  );
}

vec3 curlNoise( vec3 p ){
  const float e = .1;
  vec3 dx = vec3( e   , 0.0 , 0.0 );
  vec3 dy = vec3( 0.0 , e   , 0.0 );
  vec3 dz = vec3( 0.0 , 0.0 , e   );

  vec3 p_x0 = snoiseVec3( p - dx );
  vec3 p_x1 = snoiseVec3( p + dx );
  vec3 p_y0 = snoiseVec3( p - dy );
  vec3 p_y1 = snoiseVec3( p + dy );
  vec3 p_z0 = snoiseVec3( p - dz );
  vec3 p_z1 = snoiseVec3( p + dz );

  float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
  float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
  float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;

  const float divisor = 1.0 / ( 2.0 * e );
  return normalize( vec3( x , y , z ) * divisor );
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  vec2 uv2 = uv + curlNoise(vec3(uv * 4. + uTime * 0.1, uTime * 0.1)).xy * uDt * 0.3;
  uv += curlNoise(vec3(uv * 2. + uTime * 0.1, uTime * 0.1)).xy * uDt * 0.15;

  vec3 mapColor = texture2D(uMap, uv).rgb;
  vec3 mapColor2 = texture2D(uMap, uv2).rgb;

  uv -= 0.5;
  uv *= 2.0;
  uv.x *= uResolution.x / uResolution.y;
  vec2 pointer = uPointer;
  pointer.x *= uResolution.x / uResolution.y;

  float d = distance(uv, pointer);

  vec3 color = mix(mapColor, mapColor2, 0.5);
  color *= 1. - uDt * 2.;
  float speed = clamp(uSpeed * 2., 0.075, 0.25);
  float t = smoothstep(speed, 0., d);
  float t2 = smoothstep(speed, 0., d);
  float t3 = smoothstep(speed, 0., d);
  t2 = pow(t2, 10.);
  t3 = pow(t3, 4.);
  float scale = speed * 5.;
  t *= scale;
  t2 *= scale;
  t3 *= scale;

  /* nucky signal palette: deep teal wash → turquoise core → pale hot center */
  color = mix(color, vec3(0.015, 0.22, 0.26), t);
  color = mix(color, vec3(0.34, 0.77, 0.81), t3);
  color = mix(color, vec3(0.78, 1.0, 1.0), t2);

  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`

const TRAIL_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position, 1.0);
}
`

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion() || coarsePointer()) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'low-power',
      })
    } catch {
      return
    }

    const sizes = { width: window.innerWidth, height: window.innerHeight }
    const camera = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 0.1, 10)

    /* Fullscreen triangle shared by both passes. */
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    )
    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
    )

    const outputMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTrailMap;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D(uTrailMap, vUv).rgb;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uTrailMap: new THREE.Uniform<THREE.Texture | null>(null),
      },
      depthWrite: false,
    })
    const outputScene = new THREE.Scene()
    outputScene.add(new THREE.Mesh(geometry, outputMaterial))

    const createRenderTarget = () =>
      new THREE.WebGLRenderTarget(sizes.width * 0.25, sizes.height * 0.25, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      })

    let rt1 = createRenderTarget()
    let rt2 = createRenderTarget()
    let inputRT = rt1
    let outputRT = rt2

    const trailMaterial = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERTEX,
      fragmentShader: TRAIL_FRAGMENT,
      uniforms: {
        uResolution: new THREE.Uniform(
          new THREE.Vector2(sizes.width * 0.25, sizes.height * 0.25),
        ),
        uMap: new THREE.Uniform<THREE.Texture | null>(null),
        uPointer: new THREE.Uniform(new THREE.Vector2(0, -1)),
        uDt: new THREE.Uniform(0),
        uSpeed: new THREE.Uniform(0),
        uTime: new THREE.Uniform(0),
      },
    })
    const trailScene = new THREE.Scene()
    trailScene.add(new THREE.Mesh(geometry, trailMaterial))

    const pointer = new THREE.Vector2(0, -1)
    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / sizes.width) * 2 - 1
      pointer.y = -(event.clientY / sizes.height) * 2 + 1
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true })

    const handleResize = () => {
      sizes.width = window.innerWidth
      sizes.height = window.innerHeight
      camera.aspect = sizes.width / sizes.height
      camera.updateProjectionMatrix()
      trailMaterial.uniforms.uResolution.value.set(sizes.width * 0.25, sizes.height * 0.25)
      renderer.setSize(sizes.width, sizes.height)
      rt1.setSize(sizes.width * 0.25, sizes.height * 0.25)
      rt2.setSize(sizes.width * 0.25, sizes.height * 0.25)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)
    handleResize()

    const clock = new THREE.Clock()
    let time = 0
    let raf = 0

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 1 / 30)
      time += dt

      trailMaterial.uniforms.uTime.value = time
      const prevPointer = trailMaterial.uniforms.uPointer.value as THREE.Vector2

      trailMaterial.uniforms.uSpeed.value = THREE.MathUtils.lerp(
        trailMaterial.uniforms.uSpeed.value as number,
        Math.hypot(pointer.x - prevPointer.x, pointer.y - prevPointer.y),
        dt * 3,
      )

      prevPointer.lerp(pointer, dt * 15)
      trailMaterial.uniforms.uDt.value = dt
      trailMaterial.uniforms.uMap.value = inputRT.texture

      renderer.setRenderTarget(outputRT)
      renderer.render(trailScene, camera)
      renderer.setRenderTarget(null)

      outputMaterial.uniforms.uTrailMap.value = outputRT.texture
      renderer.render(outputScene, camera)

      const temp = inputRT
      inputRT = outputRT
      outputRT = temp

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('resize', handleResize)
      geometry.dispose()
      trailMaterial.dispose()
      outputMaterial.dispose()
      rt1.dispose()
      rt2.dispose()
      renderer.dispose()
    }
  }, [])

  if (typeof window !== 'undefined' && (reducedMotion() || coarsePointer())) return null

  return <canvas className="cursor-trail" ref={canvasRef} aria-hidden="true" />
}
