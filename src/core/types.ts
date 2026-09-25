/** 原始顺序边：坐标分量为整数毫米，weight 为正整数权重 */
export interface RawEdge {
  id: string;
  dx: number;
  dy: number;
  weight: number;
}

/** 单边平差结果：corrX/corrY 为按权重最大余数法分配到的整数修正量 */
export interface EdgeAdjustment extends RawEdge {
  corrX: bigint;
  corrY: bigint;
}

export interface AdjustmentResult {
  /** 闭合差 f = Σ 原始分量 */
  closureX: bigint;
  closureY: bigint;
  totalWeight: bigint;
  edges: EdgeAdjustment[];
}
