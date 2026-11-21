import { qrMatrix } from './qr-matrix';

export function QrCode({
  value,
  label,
  size = 220,
}: {
  value: string;
  label?: string;
  size?: number;
}) {
  const { modules, path } = qrMatrix(value);
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
        <path d={path} fill="#1a0f0c" />
      </svg>
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}
