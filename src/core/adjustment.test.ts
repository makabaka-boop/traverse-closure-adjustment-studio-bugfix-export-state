import { describe, expect, it } from 'vitest';
import { adjustTraverse } from './adjustment';
import type { RawEdge } from './types';

describe('adjustTraverse — 负闭合差端到端', () => {
  it('fx=-5,fy=-5 时两轴修正量和分别为 +5/+5，修正后严格闭合', () => {
    const edges: RawEdge[] = [
      { id: 'A', dx: -10, dy: -10, weight: 2 },
      { id: 'B', dx: 3, dy: 3, weight: 1 },
      { id: 'C', dx: 2, dy: 2, weight: 1 },
      { id: 'D', dx: 0, dy: 0, weight: 3 },
    ];
    const r = adjustTraverse(edges);
    expect(r.closureX).toBe(-5n);
    expect(r.closureY).toBe(-5n);
    expect(r.totalWeight).toBe(7n);
    const sx = r.edges.reduce((s, e) => s + e.corrX, 0n);
    const sy = r.edges.reduce((s, e) => s + e.corrY, 0n);
    expect(sx).toBe(5n);
    expect(sy).toBe(5n);
    for (const e of r.edges) {
      // 每条边每方向的修正量绝对值不超过 |闭合差|（逐毫米可复算）
      expect(e.corrX >= -5n && e.corrX <= 5n).toBe(true);
    }
  });

  it('修正后 dx+corrX、dy+corrY 的整数和严格为零', () => {
    const edges: RawEdge[] = [
      { id: 'p1', dx: 1000000, dy: -1000000, weight: 999 },
      { id: 'p2', dx: -999997, dy: 999999, weight: 1 },
      { id: 'p3', dx: -3, dy: 1, weight: 1 },
    ];
    const r = adjustTraverse(edges);
    const sumX = r.edges.reduce((s, e) => s + BigInt(e.dx) + e.corrX, 0n);
    const sumY = r.edges.reduce((s, e) => s + BigInt(e.dy) + e.corrY, 0n);
    expect(sumX).toBe(0n);
    expect(sumY).toBe(0n);
  });
});

describe('adjustTraverse — 不变量（确定性随机）', () => {
  it('100 组随机数据：两轴修正和恒等于 -闭合差', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let t = 0; t < 100; t++) {
      const n = 3 + Math.floor(rand() * 30);
      const edges: RawEdge[] = Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        dx: Math.floor(rand() * 2001) - 1000,
        dy: Math.floor(rand() * 2001) - 1000,
        weight: 1 + Math.floor(rand() * 100),
      }));
      const r = adjustTraverse(edges);
      expect(r.edges.reduce((s, e) => s + e.corrX, 0n)).toBe(-r.closureX);
      expect(r.edges.reduce((s, e) => s + e.corrY, 0n)).toBe(-r.closureY);
      expect(
        r.edges.every((e) => {
          const ax = BigInt(e.dx) + e.corrX;
          const ay = BigInt(e.dy) + e.corrY;
          return (
            Number.isSafeInteger(Number(ax)) && Number.isSafeInteger(Number(ay))
          );
        }),
      ).toBe(true);
    }
  });
});
