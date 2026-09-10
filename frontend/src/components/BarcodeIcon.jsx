export default function BarcodeIcon({ missing = false, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <g fill="currentColor">
        <rect x="2" y="4" width="2" height="16" />
        <rect x="6" y="4" width="1" height="16" />
        <rect x="9" y="4" width="2" height="16" />
        <rect x="13" y="4" width="1" height="16" />
        <rect x="16" y="4" width="3" height="16" />
        <rect x="21" y="4" width="1" height="16" />
      </g>
      {missing && (
        <line x1="2" y1="21" x2="22" y2="3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      )}
    </svg>
  );
}
