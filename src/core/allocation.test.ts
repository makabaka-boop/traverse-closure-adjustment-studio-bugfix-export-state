import { describe, expect, it } from 'vitest';
import {
  allocateLargestRemainder,
  euclideanRemainder,
  floorDiv,
} from './allocation';

function alloc(
  rows: Array<[id: string, weight: number]>,
  total: number,
): Record<string, bigint> {
  const out = allocateLargestRemainder(
    rows.map(([id, w]) => ({ id, weight: BigInt(w) })),
    BigInt(total),
  );
  return Object.fromEntries(out.map((r) => [r.id, r.amount]));
}

describe('floorDiv / euclideanRemainder', () => {
  it('负分子下取下整商，余数恒非负且小于除数', () => {
    // floor(-5/7) = -1, r = 2
    expect(floorDiv(-5n, 7n)).toBe(-1n);
    expect(euclideanRemainder(-5n, 7n)).toBe(2n);
    // floor(5/7) = 0, r = 5
    expect(floorDiv(5n, 7n)).toBe(0n);
    expect(euclideanRemainder(5n, 7n)).toBe(5n);
    // 整除
    expect(floorDiv(-14n, 7n)).toBe(-2n);
    expect(euclideanRemainder(-14n, 7n)).toBe(0n);
    for (const [a, b] of [
      [-1n, 3n],
      [-7n, 4n],
      [-8n, 4n],
      [13n, 5n],
      [-13n, 5n],
    ] as const) {
      const r = euclideanRemainder(a, b);
      expect(r >= 0n && r < b).toBe(true);
      expect(floorDiv(a, b) * b + r).toBe(a);
    }
  });
});

describe('allocateLargestRemainder — 负闭合差方向', () => {
  it('total=-5、权重 [2,1,1,2] 严格分光', () => {
    // 配额：-10,-5,-5,-10（W=6）；下整商：-2,-1,-1,-2；余数：2,1,1,2；
    // R = -5 - (-6) = 1，余数最大 2 的 E1/E4 同分，id 字节序 E1 得 +1。
    const got = alloc(
      [
        ['E1', 2],
        ['E2', 1],
        ['E3', 1],
        ['E4', 2],
      ],
      -5,
    );
    expect(got.E1).toBe(-1n);
    expect(got.E2).toBe(-1n);
    expect(got.E3).toBe(-1n);
    expect(got.E4).toBe(-2n);
    const sum = Object.values(got).reduce((s, v) => s + v, 0n);
    expect(sum).toBe(-5n);
  });

  it('全部权重为 1 且 total 为负时也严格归零分光', () => {
    const got = alloc(
      [
        ['a', 1],
        ['b', 1],
        ['c', 1],
      ],
      -7,
    );
    // 下整商各 -3，R = -7 - (-9) = 2，余数全相等，字节序 a、b 各 +1
    expect(got).toEqual({ a: -2n, b: -2n, c: -3n });
    expect(Object.values(got).reduce((s, v) => s + v, 0n)).toBe(-7n);
  });

  it('零闭合差：所有修正量为零', () => {
    const got = alloc(
      [
        ['x', 3],
        ['y', 5],
      ],
      0,
    );
    expect(got).toEqual({ x: 0n, y: 0n });
  });
});

describe('allocateLargestRemainder — 同余数按 id UTF-8 字节序', () => {
  it('余数相同时字节序较小者优先拿剩余单位', () => {
    // total=2、W=6：配额 2,2,2,2，下整商全 0，余数全 2，R=2 → id 最小的两条
    const got = alloc(
      [
        ['d', 2],
        ['c', 2],
        ['b', 2],
        ['a', 2],
      ],
      2,
    );
    expect(got.a).toBe(1n);
    expect(got.b).toBe(1n);
    expect(got.c).toBe(0n);
    expect(got.d).toBe(0n);
  });

  it('前缀关系按较短字节串优先（E < E2 < E10 之外的标准字典序）', () => {
    // 权重相等 ⇒ 余数相等；total=1 给字节序最小者
    const got = alloc(
      [
        ['E10', 1],
        ['E2', 1],
        ['E', 1],
      ],
      1,
    );
    expect(got.E).toBe(1n);
    expect(got.E2).toBe(0n);
    expect(got.E10).toBe(0n);
  });

  it('非等权时余数优先于字节序', () => {
    // total=2、W=5：hi(weight3) 配额 6 → base=1,r=1；lo(weight2) 配额 4 → base=0,r=4。
    // Σbase=1，R=1；虽然 id「hi」字节序更小，但 lo 的余数 4 > 1，单位给 lo。
    const got = alloc(
      [
        ['lo', 2],
        ['hi', 3],
      ],
      2,
    );
    expect(got.hi).toBe(1n);
    expect(got.lo).toBe(1n);
    expect(Object.values(got).reduce((s, v) => s + v, 0n)).toBe(2n);
  });
});

describe('allocateLargestRemainder — 总和不变量（随机）', () => {
  it('任意权重与正负 total 下 Σamount === total 且 |amount-base|≤1', () => {
    let seed = 123456789;
    const rand = () => {
      // 确定性 LCG
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let trial = 0; trial < 300; trial++) {
      const n = 3 + Math.floor(rand() * 20);
      const items = Array.from({ length: n }, (_, i) => ({
        id: `id-${i}`,
        weight: BigInt(1 + Math.floor(rand() * 1000)),
      }));
      const total = BigInt(Math.floor(rand() * 4000) - 2000);
      const rows = allocateLargestRemainder(items, total);
      const sum = rows.reduce((s, r) => s + r.amount, 0n);
      expect(sum).toBe(total);
      const W = items.reduce((s, it) => s + it.weight, 0n);
      for (const r of rows) {
        const numerator = total * r.weight;
        const base = floorDiv(numerator, W);
        expect(r.amount - base === 0n || r.amount - base === 1n).toBe(true);
        expect(
          r.amount >= base && (total >= 0n || true), // 负数下 base 更负、amount=base+1
        ).toBe(true);
      }
    }
  });

  it('超大权重使用 BigInt 不丢精度', () => {
    const bigW = Number.MAX_SAFE_INTEGER; // 2^53-1
    const got = allocateLargestRemainder(
      [
        { id: 'A', weight: BigInt(bigW) },
        { id: 'B', weight: 1n },
        { id: 'C', weight: 1n },
      ],
      1n,
    );
    const sum = got.reduce((s, r) => s + r.amount, 0n);
    expect(sum).toBe(1n);
    // 余数：A 为 bigW（远大于），故 A 拿这 1 个单位
    expect(got[0].amount).toBe(1n);
  });
});
