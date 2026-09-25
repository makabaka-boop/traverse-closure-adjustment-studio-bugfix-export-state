import { useEffect, useRef } from 'react';
import {
  adjustedPoints,
  boundsOf,
  originalPoints,
  type Bounds,
  type Point,
} from '../core/geometry';
import type { AdjustmentResult } from '../core/types';

interface TraverseChartProps {
  result: AdjustmentResult | null;
  /** 上报“当前 result 的位图是否已实际绘制到画布”，供导出入口做可观察的可用性判断 */
  onReadyChange?: (ready: boolean) => void;
}

/**
 * 当前平差结果的确定性签名：成功绘制某 result 后打在 canvas 上。
 * 导出时比对签名，可拒绝隐藏/尺寸为零期间残留的旧画布位图，
 * 保证交付的 PNG 必然来自当前平差结果。
 */
export function resultSignature(result: AdjustmentResult): string {
  return [
    result.closureX.toString(),
    result.closureY.toString(),
    result.totalWeight.toString(),
    result.edges
      .map((e) => `${e.id}:${e.dx},${e.dy},${e.weight}=${e.corrX},${e.corrY}`)
      .join('|'),
  ].join('#');
}

const SIGNATURE_KEY = Symbol.for('traverse-chart.result-signature');

/** 读取画布上已成功绘制的结果签名（无标记或旧画布为 null） */
export function canvasResultSignature(canvas: HTMLCanvasElement): string | null {
  return (
    (canvas as unknown as { [SIGNATURE_KEY]?: string })[SIGNATURE_KEY] ?? null
  );
}

/** 画布是否为给定结果的、已成功绘制的位图（可见、尺寸非零且签名匹配） */
export function canvasMatchesResult(
  canvas: HTMLCanvasElement,
  result: AdjustmentResult,
): boolean {
  return (
    canvas.clientWidth > 0 &&
    canvas.clientHeight > 0 &&
    canvas.width > 0 &&
    canvas.height > 0 &&
    canvasResultSignature(canvas) === resultSignature(result)
  );
}

const PADDING = 48;
const COLOR_ORIGINAL = '#9ca3af';
const COLOR_ADJUSTED = '#2563eb';
const COLOR_GRID = '#e5e7eb';
const COLOR_AXIS = '#94a3b8';

/** 1/2/5 进制的“好看”网格步长 */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * pow;
}

interface View {
  toPx: (p: Point) => [number, number];
  step: number;
  bounds: Bounds;
}

function buildView(w: number, h: number, bounds: Bounds): View {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const usableW = Math.max(w - PADDING * 2, 1);
  const usableH = Math.max(h - PADDING * 2, 1);
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const contentW = spanX * scale;
  const contentH = spanY * scale;
  const offsetX = (w - contentW) / 2;
  const offsetY = (h - contentH) / 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  // 屏幕 y 向下，世界 y 向上，需要翻转
  const toPx = (p: Point): [number, number] => [
    offsetX + (p.x - cx) * scale + contentW / 2,
    offsetY - (p.y - cy) * scale + contentH / 2,
  ];

  // 网格步长按世界单位取，目标约 64px 一格
  const step = niceStep(64 / scale);
  return { toPx, step, bounds };
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  toPx: (p: Point) => [number, number],
) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = toPx(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/** 绘制当前平差结果；返回位图是否真正生成（ctx 可用且尺寸非零） */
function renderChart(canvas: HTMLCanvasElement, result: AdjustmentResult): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  // 区域隐藏或尺寸尚为零：不绘制、不打签名、不覆盖尺寸，
  // 避免把旧位图或空画布当成当前图形交付。
  if (cssW === 0 || cssH === 0) return false;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const orig = originalPoints(result.edges);
  const adj = adjustedPoints(result);
  const all = [...orig, ...adj];
  const view = buildView(cssW, cssH, boundsOf(all));
  const { toPx, step, bounds } = view;

  // —— 网格（世界整数毫米坐标）——
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  const startGX = Math.floor(bounds.minX / step) * step;
  const endGX = Math.ceil(bounds.maxX / step) * step;
  for (let gx = startGX; gx <= endGX; gx += step) {
    const [x1, y1] = toPx({ x: gx, y: bounds.minY });
    const [x2, y2] = toPx({ x: gx, y: bounds.maxY });
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  const startGY = Math.floor(bounds.minY / step) * step;
  const endGY = Math.ceil(bounds.maxY / step) * step;
  for (let gy = startGY; gy <= endGY; gy += step) {
    const [x1, y1] = toPx({ x: bounds.minX, y: gy });
    const [x2, y2] = toPx({ x: bounds.maxX, y: gy });
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // —— 原始折线（灰色虚线）——
  ctx.save();
  ctx.strokeStyle = COLOR_ORIGINAL;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  drawPolyline(ctx, orig, toPx);
  ctx.restore();

  // 原始未闭合缺口单独强调
  const first = toPx(orig[0]);
  const lastOrig = toPx(orig[orig.length - 1]);
  ctx.save();
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  ctx.lineTo(lastOrig[0], lastOrig[1]);
  ctx.stroke();
  ctx.restore();

  // —— 平差后折线（蓝色实线）——
  ctx.strokeStyle = COLOR_ADJUSTED;
  ctx.lineWidth = 2.5;
  drawPolyline(ctx, adj, toPx);

  // 顶点
  orig.forEach((p) => {
    const [x, y] = toPx(p);
    ctx.fillStyle = COLOR_ORIGINAL;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  adj.forEach((p, i) => {
    const [x, y] = toPx(p);
    ctx.fillStyle = i === 0 ? '#16a34a' : COLOR_ADJUSTED;
    ctx.beginPath();
    ctx.arc(x, y, i === 0 ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // —— 图例 ——
  const lx = 12;
  let ly = 18;
  ctx.textBaseline = 'middle';
  const drawLegend = (color: string, dashed: boolean, text: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    if (dashed) ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 26, ly);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#374151';
    ctx.fillText(text, lx + 34, ly);
    ly += 20;
  };
  drawLegend(COLOR_ORIGINAL, true, '原始折线');
  drawLegend(COLOR_ADJUSTED, false, '平差后折线（闭合）');
  drawLegend('#ef4444', true, '闭合差缺口');

  // 单位注记
  ctx.fillStyle = COLOR_AXIS;
  ctx.textAlign = 'right';
  ctx.fillText(`单位 mm，网格 ${step}`, cssW - 12, cssH - 12);
  ctx.textAlign = 'left';

  // 成功绘制后打上当前结果签名：导出据此核对 PNG 与当前平差一致
  (canvas as unknown as { [SIGNATURE_KEY]: string })[SIGNATURE_KEY] =
    resultSignature(result);
  return true;
}

export function TraverseChart({ result, onReadyChange }: TraverseChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyCallbackRef = useRef(onReadyChange);
  readyCallbackRef.current = onReadyChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    // 每次结果变化先按“未就绪”处理：恢复绘制完成前不得导出旧位图
    readyCallbackRef.current?.(false);
    const draw = () => readyCallbackRef.current?.(renderChart(canvas, result));
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [result]);

  // 结果被清空：显式回到未就绪，避免父组件保留过期的可导出状态
  useEffect(() => {
    if (!result) readyCallbackRef.current?.(false);
  }, [result]);

  if (!result) {
    return (
      <div className="chart-empty">
        <p>尚无有效平差图形</p>
        <p className="hint">粘贴顺序边 JSON 并执行平差后，原始与平差后折线将叠画于此</p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="traverse-canvas"
      aria-label="原始与平差后导线叠画图"
    />
  );
}

export { renderChart };
