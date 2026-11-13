interface AppLogoProps {
  size?: number;
  className?: string;
}

export function AppLogo({ size = 26, className = '' }: AppLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="axl-logo-bg" x1="256" y1="16" x2="256" y2="496" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1A2234" />
          <stop offset="100%" stopColor="#0D121C" />
        </linearGradient>
        <linearGradient id="axl-logo-crimson" x1="-170" y1="-32" x2="-48" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#B91C1C" />
        </linearGradient>
        <linearGradient id="axl-logo-cobalt" x1="48" y1="-32" x2="170" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="axl-logo-paper" x1="-170" y1="0" x2="170" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="45%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#axl-logo-bg)" />
      <rect x="18" y="18" width="476" height="476" rx="110" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="4" />

      <g transform="translate(256 256)">
        <circle cx="0" cy="0" r="162" stroke="#94A3B8" strokeOpacity="0.14" strokeWidth="3" />

        <g transform="rotate(45)">
          <rect x="-172" y="-32" width="122" height="64" rx="16" fill="url(#axl-logo-crimson)" />
          <rect x="50" y="-32" width="122" height="64" rx="16" fill="url(#axl-logo-cobalt)" />
        </g>

        <g transform="rotate(-45)">
          <path
            d="M-156 -32 H126 L172 14 V16 C172 24.837 164.837 32 156 32 H-156 C-164.837 32 -172 24.837 -172 16 V-16 C-172 -24.837 -164.837 -32 -156 -32 Z"
            fill="url(#axl-logo-paper)"
          />
          <path
            d="M126 -32 L172 14 H138 C131.373 14 126 8.627 126 2 V-32 Z"
            fill="#CBD5E1"
          />
          <rect x="-132" y="-7" width="84" height="5" rx="2.5" fill="#94A3B8" fillOpacity="0.45" />
          <rect x="-132" y="5" width="52" height="5" rx="2.5" fill="#94A3B8" fillOpacity="0.32" />
        </g>
      </g>
    </svg>
  );
}
