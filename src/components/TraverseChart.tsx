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

function renderChart(canvas: HTMLCanvasElement, result: AdjustmentResult): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW === 0 || cssH === 0) return;
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
}

export function TraverseChart({ result }: TraverseChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const draw = () => renderChart(canvas, result);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
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
