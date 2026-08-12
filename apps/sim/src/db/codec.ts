export function encodePath(path: Array<[number, number]>): Buffer {
  const out = Buffer.allocUnsafe(path.length * 2);
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    if (!step) continue;
    out[i * 2] = step[0] & 0xff;
    out[i * 2 + 1] = step[1] & 0xff;
  }
  return out;
}

export function decodePath(buf: Buffer | Uint8Array | null): Array<[number, number]> {
  if (!buf || buf.length === 0) return [];
  const path: Array<[number, number]> = [];
  for (let i = 0; i + 1 < buf.length; i += 2) {
    path.push([buf[i] ?? 0, buf[i + 1] ?? 0]);
  }
  return path;
}
