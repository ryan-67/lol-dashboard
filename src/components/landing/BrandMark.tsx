/**
 * Extruded 3D-style N mark for the marketing chrome (header brand + favicon kin).
 * Off-white rim + turquoise face so it reads against the matte black plate.
 */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="6" fill="#0a0d0e" />
        <rect
          x="0.6"
          y="0.6"
          width="30.8"
          height="30.8"
          rx="5.4"
          stroke="#57c4cf"
          strokeOpacity="0.5"
        />
        <path
          d="M8.2 7.2h4.1v9.1L19.7 7.2h4.1v17.6h-4.1v-9.1L12.3 24.8H8.2V7.2Z"
          fill="#8fe7ee"
        />
        <path d="M8.2 7.2h1.15v17.6H8.2V7.2Z" fill="#f3f0e7" fillOpacity="0.92" />
        <path d="M22.65 7.2H23.8v17.6h-1.15V7.2Z" fill="#f3f0e7" fillOpacity="0.72" />
        <path
          d="M12.3 16.3 19.7 7.2h1.05L13.15 16.9l-.85-.6Z"
          fill="#f3f0e7"
          fillOpacity="0.55"
        />
        <path d="M23.8 7.2h1.2l-.35 17.6H23.8V7.2Z" fill="#2a6f76" fillOpacity="0.85" />
      </svg>
    </span>
  )
}
