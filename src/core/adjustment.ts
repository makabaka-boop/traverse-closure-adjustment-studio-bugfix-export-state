import { allocateLargestRemainder } from './allocation';
import type { AdjustmentResult, EdgeAdjustment, RawEdge } from './types';

/**
 * 闭合导线整网平差：
 * 东西、南北两个方向独立按权重执行最大余数分配，
 * 每轴修正量总和严格等于该轴闭合差的相反数。
 *
 * 全程 BigInt 运算：weight 允许到 2^53-1，total*weight 可达约 1.8e24，
 * 超出安全整数范围，必须用 BigInt 才能保证逐毫米可复算。
 */
export function adjustTraverse(edges: RawEdge[]): AdjustmentResult {
  const closureX = edges.reduce((s, e) => s + BigInt(e.dx), 0n);
  const closureY = edges.reduce((s, e) => s + BigInt(e.dy), 0n);
  const totalWeight = edges.reduce((s, e) => s + BigInt(e.weight), 0n);

  const weighted = edges.map((e) => ({ id: e.id, weight: BigInt(e.weight) }));

  // 待分配总额 = -闭合差，使修正后分量和严格归零。
  const allocX = allocateLargestRemainder(weighted, -closureX);
  const allocY = allocateLargestRemainder(weighted, -closureY);

  const out: EdgeAdjustment[] = edges.map((e, i) => ({
    ...e,
    corrX: allocX[i].amount,
    corrY: allocY[i].amount,
  }));

  // 硬性不变量：修正后两轴整数和必须严格为零。
  const sumX = out.reduce((s, e) => s + BigInt(e.dx) + e.corrX, 0n);
  const sumY = out.reduce((s, e) => s + BigInt(e.dy) + e.corrY, 0n);
  if (sumX !== 0n || sumY !== 0n) {
    throw new Error('平差不变量失败：修正后分量和非零');
  }

  return { closureX, closureY, totalWeight, edges: out };
}
