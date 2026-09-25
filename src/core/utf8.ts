const encoder = new TextEncoder();

/**
 * 按 UTF-8 字节序比较两个字符串。
 * 规格中 id 为 ASCII，此时等同字典序；保留 UTF-8 实现可与排序口径严格一致。
 */
export function compareUtf8Bytes(a: string, b: string): number {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  const n = Math.min(ab.length, bb.length);
  for (let i = 0; i < n; i++) {
    if (ab[i] !== bb[i]) {
      return Number(ab[i]) - Number(bb[i]);
    }
  }
  return ab.length - bb.length;
}
