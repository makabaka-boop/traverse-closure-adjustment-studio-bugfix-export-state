import { describe, expect, it } from 'vitest';
import { adjustedPoints, originalPoints } from './geometry';
import { adjustTraverse } from './adjustment';
import { compareUtf8Bytes } from './utf8';
import type { RawEdge } from './types';

describe('geometry', () => {
  it('原始折线首尾差即闭合差，平差后折线首尾严格重合', () => {
    const edges: RawEdge[] = [
      { id: 'A', dx: 3, dy: 0, weight: 1 },
      { id: 'B', dx: 0, dy: 4, weight: 1 },
      { id: 'C', dx: -1, dy: -3, weight: 1 },
    ];
    const orig = originalPoints(edges);
    expect(orig[0]).toEqual({ x: 0, y: 0 });
    const end = orig[orig.length - 1];
    expect(end).toEqual({ x: 2, y: 1 }); // 闭合差 (2,1)

    const r = adjustTraverse(edges);
    const adj = adjustedPoints(r);
    const adjEnd = adj[adj.length - 1];
    expect(adjEnd).toEqual({ x: 0, y: 0 });
  });
});

describe('compareUtf8Bytes', () => {
  it('ASCII 字典序与字节序一致', () => {
    expect(compareUtf8Bytes('a', 'b') < 0).toBe(true);
    expect(compareUtf8Bytes('E', 'E2') < 0).toBe(true);
    // 字节序（等同 ASCII 字典序）逐字节比较：第二位 0x31('1') < 0x32('2')
    expect(compareUtf8Bytes('E10', 'E2') < 0).toBe(true);
    expect(compareUtf8Bytes('abc', 'abc')).toBe(0);
  });

  it('UTF-8 字节序：多字节字符高位首字节比较', () => {
    // 'é' = C3 A9，'z' = 7A；字节序下 é 排在 z 之后
    expect(compareUtf8Bytes('é', 'z') > 0).toBe(true);
  });
});
