/** Minimal protobuf wire codec for the Chronik messages LaiTab actually uses. */

function asU64(value: bigint | number): bigint {
  const n = typeof value === 'bigint' ? value : BigInt(value);
  if (n < 0n) {
    // protobuf int64: two's complement stored as unsigned varint
    return (1n << 64n) + n;
  }
  return n;
}

export function encodeVarint(value: bigint | number): Uint8Array {
  let n = asU64(value);
  const out: number[] = [];
  while (n > 0x7fn) {
    out.push(Number(n & 0x7fn) | 0x80);
    n >>= 7n;
  }
  out.push(Number(n));
  return Uint8Array.from(out);
}

export function decodeVarint(buf: Uint8Array, start = 0): { value: bigint; pos: number } {
  let n = 0n;
  let shift = 0n;
  let pos = start;
  while (pos < buf.length) {
    const b = buf[pos]!;
    pos += 1;
    n |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: n, pos };
    shift += 7n;
    if (shift > 63n) throw new Error('protobuf varint is too long');
  }
  throw new Error('truncated protobuf varint');
}

export class ProtoReader {
  readonly buf: Uint8Array;
  pos: number;
  readonly end: number;

  constructor(buf: Uint8Array, pos = 0, end = buf.length) {
    this.buf = buf;
    this.pos = pos;
    this.end = end;
  }

  get remaining(): number {
    return this.end - this.pos;
  }

  varint(): bigint {
    const { value, pos } = decodeVarint(this.buf, this.pos);
    if (pos > this.end) throw new Error('protobuf varint overruns message');
    this.pos = pos;
    return value;
  }

  int32(): number {
    return Number(this.varint());
  }

  int64(): bigint {
    const n = this.varint();
    return n > 0x7fffffffffffffffn ? n - (1n << 64n) : n;
  }

  bool(): boolean {
    return this.varint() !== 0n;
  }

  bytes(): Uint8Array {
    const len = Number(this.varint());
    if (len < 0 || this.pos + len > this.end) throw new Error('truncated protobuf bytes');
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }

  string(): string {
    return new TextDecoder().decode(this.bytes());
  }

  skip(wire: number): void {
    switch (wire) {
      case 0:
        this.varint();
        return;
      case 1:
        this.pos += 8;
        return;
      case 2:
        this.bytes();
        return;
      case 5:
        this.pos += 4;
        return;
      default:
        throw new Error(`unsupported protobuf wire type ${wire}`);
    }
  }

  tag(): { field: number; wire: number } | null {
    if (this.pos >= this.end) return null;
    const n = this.varint();
    return { field: Number(n >> 3n), wire: Number(n & 7n) };
  }
}

export class ProtoWriter {
  private readonly parts: Uint8Array[] = [];

  private push(bytes: Uint8Array): void {
    if (bytes.length) this.parts.push(bytes);
  }

  tag(field: number, wire: number): this {
    this.push(encodeVarint((BigInt(field) << 3n) | BigInt(wire)));
    return this;
  }

  /** Omit zero / empty, matching usual protobuf encode defaults. */
  uint(field: number, value: bigint | number): this {
    const n = typeof value === 'bigint' ? value : BigInt(value);
    if (n === 0n) return this;
    this.tag(field, 0);
    this.push(encodeVarint(n));
    return this;
  }

  int64(field: number, value: bigint): this {
    if (value === 0n) return this;
    this.tag(field, 0);
    this.push(encodeVarint(asU64(value)));
    return this;
  }

  bool(field: number, value: boolean): this {
    if (!value) return this;
    this.tag(field, 0);
    this.push(encodeVarint(1));
    return this;
  }

  bytes(field: number, value: Uint8Array): this {
    if (!value.length) return this;
    this.tag(field, 2);
    this.push(encodeVarint(value.length));
    this.push(value);
    return this;
  }

  message(field: number, value: Uint8Array): this {
    return this.bytes(field, value);
  }

  finish(): Uint8Array {
    let len = 0;
    for (const p of this.parts) len += p.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of this.parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }
}
