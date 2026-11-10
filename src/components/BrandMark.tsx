/**
 * The ArrangeIt mark as live vector UI: the same geometric "A" monogram as the
 * application icon, so the window, the taskbar and the installer agree.
 */
export function BrandMark({ size = 29 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-label="ArrangeIt"
      role="img"
      style={{ display: "block", filter: "drop-shadow(0 4px 10px rgb(0 0 0 / 0.28))" }}
    >
      <defs>
        <linearGradient id="brand-tile" gradientUnits="userSpaceOnUse" x1="96" y1="48" x2="936" y2="984">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
        <linearGradient id="brand-sheen" gradientUnits="userSpaceOnUse" x1="512" y1="0" x2="512" y2="640">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="228" fill="url(#brand-tile)" />
      <rect width="1024" height="620" rx="228" fill="url(#brand-sheen)" />
      <g fill="none" stroke="#fff" strokeWidth="118" strokeLinecap="round" strokeLinejoin="round">
        <path d="M352 762L512 262L672 762" />
        <path d="M420 586h184" />
      </g>
    </svg>
  );
}
