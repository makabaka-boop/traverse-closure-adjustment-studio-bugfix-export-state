import { compareUtf8Bytes } from './utf8';

export interface WeightedItem {
  id: string;
  weight: bigint;
}

export interface AllocationEntry {
  id: string;
  weight: bigint;
  /** 欧几里得整除的下整商 floor(total * weight / W) */
  base: bigint;
  /** 欧几里得余数 r ∈ [0, W) */
  remainder: bigint;
  /** 是否额外分得 1 个单位 */
  extra: boolean;
  /** 最终分配额 base + extra */
  amount: bigint;
}

/**
 * 欧几里得整除的下整商（floor）。
 * 注意 BigInt 的 `/` 向零截断，负数场景（负闭合差）下与 floor 不同，
 * 例如 floor(-5/7) = -1 而 -5n/7n = 0，因此必须显式向下取整。
 * 约定除数 b > 0。
 */
export function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n ? q - 1n : q;
}

/** 欧几里得余数 r = a - floor(a/b)*b，恒有 0 <= r < b（b > 0） */
export function euclideanRemainder(a: bigint, b: bigint): bigint {
  return a - floorDiv(a, b) * b;
}

/**
 * 按权重的最大余数分配（Hamilton 法的加权形式），整数 total 被严格分光：
 *
 *   W = Σ weight
 *   配额 a_i = total * weight_i，q_i = floor(a_i / W)，r_i = a_i - q_i*W ∈ [0,W)
 *   先各分 q_i，剩余 R = total - Σq_i 个单位（0 ≤ R < 边数），
 *   依次分给余数 r_i 较大者；余数相同按 id 的 UTF-8 字节序（小者优先）。
 *
 * total 可为负（负闭合差方向），欧几里得 floor 定义保证负数下同样成立。
 */
export function allocateLargestRemainder(
  items: WeightedItem[],
  total: bigint,
): AllocationEntry[] {
  if (items.length === 0) {
    throw new Error('分配失败：没有参与分配的边');
  }
  const W = items.reduce((sum, it) => sum + it.weight, 0n);
  if (W <= 0n) {
    throw new Error('分配失败：权重和必须为正');
  }

  const rows: AllocationEntry[] = items.map((it) => {
    const numerator = total * it.weight;
    const base = floorDiv(numerator, W);
    const remainder = numerator - base * W;
    return { id: it.id, weight: it.weight, base, remainder, extra: false, amount: base };
  });

  // R = total - Σq_i；由 Σr_i = R·W 且 0 ≤ r_i < W 可证 0 ≤ R < n。
  let remaining = total - rows.reduce((s, r) => s + r.base, 0n);

  const order = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) {
      // BigInt 差值可能超出安全整数范围，不能转 Number 比较
      return a.remainder > b.remainder ? -1 : 1;
    }
    return compareUtf8Bytes(a.id, b.id);
  });

  for (const row of order) {
    if (remaining <= 0n) break;
    row.extra = true;
    row.amount += 1n;
    remaining -= 1n;
  }

  const checkSum = rows.reduce((s, r) => s + r.amount, 0n);
  if (remaining !== 0n || checkSum !== total) {
    throw new Error('分配不变量失败：分配总额与待分配总额不一致');
  }

  return rows;
}
