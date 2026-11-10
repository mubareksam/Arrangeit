/**
 * The ArrangeIt mark, as live vector UI (not an image): the same folder + punched
 * arrow as the app icon, so the window and the taskbar agree.
 */
export function BrandMark({ size = 29 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", filter: "drop-shadow(0 6px 14px rgb(0 0 0 / 0.35))" }}
    >
      <defs>
        <linearGradient id="brand-tile" gradientUnits="userSpaceOnUse" x1="96" y1="64" x2="928" y2="976">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
        <linearGradient id="brand-hole" gradientUnits="userSpaceOnUse" x1="96" y1="64" x2="928" y2="976">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="228" fill="url(#brand-tile)" />
      <rect width="1024" height="520" rx="228" fill="#fff" opacity="0.22" />
      <g transform="translate(0,-40)">
        <path
          fill="#fff"
          d="M246 348h150a44 44 0 0 1 31 13l47 51h304a56 56 0 0 1 56 56v284a56 56 0 0 1-56 56H246a56 56 0 0 1-56-56V404a56 56 0 0 1 56-56z"
        />
        <g fill="none" stroke="url(#brand-hole)" strokeWidth="72" strokeLinecap="round" strokeLinejoin="round">
          <path d="M400 712V560h158" />
        </g>
        <path fill="url(#brand-hole)" d="M572 496l118 64-118 64z" />
      </g>
    </svg>
  );
}
