import { describe, expect, it } from 'vitest';
import { parseTraverseInput } from './parse';

const valid = [
  { id: 'a', dx: 1, dy: 2, weight: 1 },
  { id: 'b', dx: 3, dy: 4, weight: 2 },
  { id: 'c', dx: -4, dy: -6, weight: 3 },
];

describe('parseTraverseInput — 合法输入', () => {
  it('接受 3–200 条边并保留原始顺序', () => {
    const r = parseTraverseInput(JSON.stringify(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.edges.map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(r.edges[2].dy).toBe(-6);
    }
  });

  it('接受边界值 ±10^6 与 200 条边', () => {
    const edges = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      dx: i === 0 ? 1_000_000 : i === 1 ? -1_000_000 : 0,
      dy: 0,
      weight: Number.MAX_SAFE_INTEGER,
    }));
    const r = parseTraverseInput(JSON.stringify(edges));
    expect(r.ok).toBe(true);
  });
});

describe('parseTraverseInput — 拒绝整份数据', () => {
  it.each([
    ['不是 JSON', '{not json'],
    ['顶层不是数组', '{}'],
    ['少于 3 条', JSON.stringify(valid.slice(0, 2))],
    ['超过 200 条', JSON.stringify(
      Array.from({ length: 201 }, (_, i) => ({
        id: `e${i}`,
        dx: 0,
        dy: 0,
        weight: 1,
      })),
    )],
    ['id 重复', JSON.stringify([valid[0], valid[0], valid[1]])],
    ['id 为空', JSON.stringify([{ ...valid[0], id: '' }, valid[1], valid[2]])],
    [
      'id 非 ASCII',
      JSON.stringify([{ ...valid[0], id: '边一' }, valid[1], valid[2]]),
    ],
    ['dx 为小数', JSON.stringify([{ ...valid[0], dx: 1.5 }, valid[1], valid[2]])],
    ['dx 为字符串', JSON.stringify([{ ...valid[0], dx: '1' }, valid[1], valid[2]])],
    ['dx 为布尔', JSON.stringify([{ ...valid[0], dx: true }, valid[1], valid[2]])],
    ['dx 超界', JSON.stringify([{ ...valid[0], dx: 1_000_001 }, valid[1], valid[2]])],
    ['weight 为 0', JSON.stringify([{ ...valid[0], weight: 0 }, valid[1], valid[2]])],
    ['weight 为负', JSON.stringify([{ ...valid[0], weight: -1 }, valid[1], valid[2]])],
    ['weight 为小数', JSON.stringify([{ ...valid[0], weight: 1.2 }, valid[1], valid[2]])],
    ['额外字段', JSON.stringify([{ ...valid[0], note: 'x' }, valid[1], valid[2]])],
    ['缺字段', JSON.stringify([{ id: 'a', dx: 1, dy: 2 }, valid[1], valid[2]])],
    ['元素为数组', JSON.stringify([['a', 1, 2, 1], valid[1], valid[2]])],
  ])('%s', (_name, text) => {
    const r = parseTraverseInput(text);
    expect(r.ok).toBe(false);
  });
});
