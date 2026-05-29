import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { animateCounter } from '../../theme/animations'

interface AnimatedCounterProps {
  value: number
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
}

export default function AnimatedCounter({
  value,
  decimals = 1,
  suffix = '',
  prefix = '',
  className = '',
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      animateCounter(ref.current, value, { decimals, suffix, prefix })
    },
    { scope: ref, dependencies: [value, decimals, suffix, prefix] },
  )

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  )
}
