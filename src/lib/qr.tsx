import { encode } from 'uqr';

export function QrCode({
  value,
  label,
  size = 220,
}: {
  value: string;
  label?: string;
  size?: number;
}) {
  const { data, size: modules } = encode(value, { ecc: 'M', border: 2 });
  const path: string[] = [];
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (data[y * modules + x]) {
        path.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }
  return (
    <figure className="qr">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${modules} ${modules}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={label ?? 'QR code'}
      >
        <rect width={modules} height={modules} fill="#fbf7ef" />
        <path d={path.join('')} fill="#1a0f0c" />
      </svg>
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}
