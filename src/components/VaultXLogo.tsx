import React from "react"

interface VaultXLogoProps {
  className?: string
  size?: number
}

export function VaultXLogo({ className = "h-5 w-5", size = 24 }: VaultXLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      fill="none"
      className={className}
      width={size}
      height={size}
      aria-label="Vault X Logo"
    >
      <defs>
        <linearGradient id="logo-bg" x1="64" y1="64" x2="960" y2="960" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#181820" />
          <stop offset="50%" stopColor="#0d0d12" />
          <stop offset="100%" stopColor="#060608" />
        </linearGradient>

        <linearGradient id="logo-rim" x1="64" y1="64" x2="960" y2="960" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a1a1aa" stopOpacity="0.85" />
          <stop offset="35%" stopColor="#52525b" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#27272a" stopOpacity="0.25" />
        </linearGradient>

        <radialGradient id="logo-glow" cx="512" cy="512" r="420" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
          <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#047857" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="logo-under" x1="0" y1="-305" x2="0" y2="305" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e4e4e7" />
          <stop offset="50%" stopColor="#a1a1aa" />
          <stop offset="100%" stopColor="#52525b" />
        </linearGradient>

        <linearGradient id="logo-light" x1="0" y1="-305" x2="0" y2="305" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#f4f4f5" />
          <stop offset="100%" stopColor="#d4d4d8" />
        </linearGradient>

        <linearGradient id="logo-shade" x1="0" y1="-305" x2="0" y2="305" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e4e4e7" />
          <stop offset="50%" stopColor="#a1a1aa" />
          <stop offset="100%" stopColor="#71717a" />
        </linearGradient>

        <linearGradient id="logo-core" x1="-48" y1="-48" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#27272a" />
          <stop offset="100%" stopColor="#09090b" />
        </linearGradient>

        <radialGradient id="logo-pip" cx="512" cy="512" r="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </radialGradient>

        <clipPath id="logo-clip">
          <rect x="-68" y="-305" width="136" height="610" rx="18" ry="18" />
        </clipPath>
      </defs>

      {/* Outer Squircle Container */}
      <rect x="64" y="64" width="896" height="896" rx="216" fill="url(#logo-bg)" stroke="url(#logo-rim)" strokeWidth="8" />

      {/* Ambient Glow */}
      <circle cx="512" cy="512" r="380" fill="url(#logo-glow)" />

      {/* Vault Dial Track */}
      <circle cx="512" cy="512" r="335" stroke="#71717a" strokeOpacity="0.3" strokeWidth="4" />

      {/* Cardinal Ticks */}
      <g stroke="#e4e4e7" strokeLinecap="round">
        <line x1="512" y1="165" x2="512" y2="188" strokeWidth="5" strokeOpacity="0.8" />
        <line x1="512" y1="836" x2="512" y2="859" strokeWidth="5" strokeOpacity="0.8" />
        <line x1="165" y1="512" x2="188" y2="512" strokeWidth="5" strokeOpacity="0.8" />
        <line x1="836" y1="512" x2="859" y2="512" strokeWidth="5" strokeOpacity="0.8" />
      </g>

      {/* Under Arm (TR to BL) */}
      <g transform="translate(512, 512) rotate(-45)">
        <rect x="-68" y="-305" width="136" height="610" rx="18" fill="url(#logo-under)" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="3" />
      </g>

      {/* Shadow */}
      <g transform="translate(512, 512) rotate(45)">
        <rect x="-82" y="-319" width="164" height="638" rx="26" fill="#000000" fillOpacity="0.35" />
      </g>

      {/* Over Arm (TL to BR) */}
      <g transform="translate(512, 512) rotate(45)">
        <g clipPath="url(#logo-clip)">
          <rect x="-68" y="-305" width="68" height="610" fill="url(#logo-light)" />
          <rect x="0" y="-305" width="68" height="610" fill="url(#logo-shade)" />
          <line x1="0" y1="-305" x2="0" y2="305" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="3" />
        </g>
        <rect x="-68" y="-305" width="136" height="610" rx="18" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="3" fill="none" />
      </g>

      {/* Center Vault Lock Medallion */}
      <g transform="translate(512, 512)">
        <polygon points="0,-52 52,0 0,52 -52,0" fill="#000000" fillOpacity="0.4" />
        <polygon points="0,-48 48,0 0,48 -48,0" fill="url(#logo-core)" stroke="#34d399" strokeWidth="4" />
        <circle cx="0" cy="0" r="14" fill="url(#logo-pip)" />
      </g>
    </svg>
  )
}
