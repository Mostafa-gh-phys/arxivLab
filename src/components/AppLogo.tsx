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
        <linearGradient id="axl-logo-bg" x1="256" y1="20" x2="256" y2="492" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#141E30" />
          <stop offset="100%" stopColor="#090E18" />
        </linearGradient>
        <linearGradient id="axl-logo-blue" x1="152" y1="360" x2="360" y2="152" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
      </defs>

      <rect x="20" y="20" width="472" height="472" rx="112" fill="url(#axl-logo-bg)" />
      <rect
        x="22"
        y="22"
        width="468"
        height="468"
        rx="110"
        stroke="#FFFFFF"
        strokeOpacity="0.10"
        strokeWidth="4"
      />

      <path
        d="M158 158 L354 354"
        stroke="#F8FAFC"
        strokeWidth="40"
        strokeLinecap="round"
      />
      <path
        d="M158 354 L238 274"
        stroke="url(#axl-logo-blue)"
        strokeWidth="40"
        strokeLinecap="round"
      />
      <path
        d="M274 238 L354 158"
        stroke="#F8FAFC"
        strokeWidth="40"
        strokeLinecap="round"
      />
    </svg>
  );
}
