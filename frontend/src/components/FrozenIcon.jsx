export default function FrozenIcon({ size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="frozen-icon"
      role="img"
      aria-label="Frozen"
    >
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="3.5" y1="7" x2="20.5" y2="17" />
        <line x1="3.5" y1="17" x2="20.5" y2="7" />
        <path d="M9 4.5 12 7l3-2.5M9 19.5 12 17l3 2.5" fill="none" />
        <path d="M5.6 9.9 5 6.4l-3.4.6M18.4 14.1l.6 3.5 3.4-.6" fill="none" />
        <path d="M5.6 14.1 5 17.6l-3.4-.6M18.4 9.9l.6-3.5 3.4.6" fill="none" />
      </g>
    </svg>
  );
}
