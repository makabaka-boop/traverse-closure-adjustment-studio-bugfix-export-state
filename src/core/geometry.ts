import type { AdjustmentResult, RawEdge } from './types';

export interface Point {
  x: number;
  y: number;
}

function cumulative(deltas: Array<{ dx: number; dy: number }>): Point[] {
  const pts: Point[] = [{ x: 0, y: 0 }];
  for (const d of deltas) {
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + d.dx, y: last.y + d.dy });
  }
  return pts;
}

/** 原始折线顶点（从原点起算） */
export function originalPoints(edges: RawEdge[]): Point[] {
  return cumulative(edges);
}

/** 平差后折线顶点（整数修正量转回 number：|corr| ≤ |闭合差| ≤ 2e8，精确可表） */
export function adjustedPoints(result: AdjustmentResult): Point[] {
  return cumulative(
    result.edges.map((e) => ({
      dx: e.dx + Number(e.corrX),
      dy: e.dy + Number(e.corrY),
    })),
  );
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boundsOf(points: Point[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}
