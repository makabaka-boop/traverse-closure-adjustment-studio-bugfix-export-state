import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCanvasPng, shareOrDownloadCanvas, stringifyResult } from './export';
import { adjustTraverse } from '../core/adjustment';
import type { RawEdge } from '../core/types';

describe('stringifyResult', () => {
  it('BigInt 字段以精确无引号整数字面量输出，且可被 JSON.parse 读回', () => {
    const edges: RawEdge[] = [
      { id: 'a', dx: 5, dy: 7, weight: 2 },
      { id: 'b', dx: -3, dy: -2, weight: 1 },
      { id: 'c', dx: -1, dy: -4, weight: 1 },
    ];
    const json = stringifyResult(adjustTraverse(edges));
    const parsed = JSON.parse(json) as {
      closure: { x: number; y: number };
      totalWeight: number | null;
      totalWeightExact: string;
      edges: Array<{ corrX: number; adjustedDx: number }>;
    };
    expect(parsed.closure.x).toBe(1);
    expect(parsed.closure.y).toBe(1);
    expect(parsed.totalWeight).toBe(4);
    expect(parsed.totalWeightExact).toBe('4');
    const sumX = parsed.edges.reduce((s, e) => s + e.adjustedDx, 0);
    expect(sumX).toBe(0);
  });

  it('总权重超过 2^53 时数值字段为 null，精确字符串逐位保留', () => {
    const big = Number.MAX_SAFE_INTEGER;
    const edges: RawEdge[] = [
      { id: 'A', dx: 1, dy: 0, weight: big },
      { id: 'B', dx: 0, dy: 0, weight: big },
      { id: 'C', dx: 0, dy: 0, weight: 1 },
    ];
    const r = adjustTraverse(edges);
    expect(r.totalWeight > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    const json = stringifyResult(r);
    const parsed = JSON.parse(json) as {
      totalWeight: number | null;
      totalWeightExact: string;
    };
    expect(parsed.totalWeight).toBeNull();
    expect(parsed.totalWeightExact).toBe((BigInt(big) * 2n + 1n).toString());
    // 文本中包含精确字面量（无引号）
    expect(json).toContain(`"totalWeightExact": "${BigInt(big) * 2n + 1n}"`);
  });
});

/** 画布导出/共享的下载计数与桩 */
describe('画布 PNG 导出与共享', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  const makeCanvas = (blob: Blob | null): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.toBlob = (cb: BlobCallback) => {
      cb(blob);
    };
    return canvas;
  };

  const stubShare = (canShare: boolean, shareImpl?: () => Promise<void>) => {
    Object.defineProperty(window.navigator, 'canShare', {
      value: vi.fn(() => canShare),
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'share', {
      value: vi.fn(shareImpl ?? (() => Promise.resolve())),
      configurable: true,
    });
  };

  beforeEach(() => {
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(
      () => 'blob:mock',
    );
    (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    clickSpy.mockRestore();
    const nav = window.navigator as unknown as Record<string, unknown>;
    delete nav.share;
    delete nav.canShare;
  });

  it('toBlob 返回 null（空画布编码）时不下载且结果为 false', async () => {
    const ok = await downloadCanvasPng(makeCanvas(null));
    expect(ok).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('toBlob 正常时恰好下载一次且结果为 true', async () => {
    const ok = await downloadCanvasPng(
      makeCanvas(new Blob(['png'], { type: 'image/png' })),
    );
    expect(ok).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('支持系统分享且用户确认：shared，不产生降级下载', async () => {
    stubShare(true);
    const outcome = await shareOrDownloadCanvas(
      makeCanvas(new Blob(['png'], { type: 'image/png' })),
    );
    expect(outcome).toBe('shared');
    expect(window.navigator.share).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('用户取消系统分享面板（AbortError）：cancelled，不补发下载', async () => {
    stubShare(true, () =>
      Promise.reject(new DOMException('用户取消', 'AbortError')),
    );
    const outcome = await shareOrDownloadCanvas(
      makeCanvas(new Blob(['png'], { type: 'image/png' })),
    );
    expect(outcome).toBe('cancelled');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('分享过程出现非取消错误：failed，不补发下载', async () => {
    stubShare(true, () => Promise.reject(new Error('系统分享不可用')));
    const outcome = await shareOrDownloadCanvas(
      makeCanvas(new Blob(['png'], { type: 'image/png' })),
    );
    expect(outcome).toBe('failed');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('环境不支持分享（无 canShare/share）：降级下载一次，downloaded', async () => {
    const outcome = await shareOrDownloadCanvas(
      makeCanvas(new Blob(['png'], { type: 'image/png' })),
    );
    expect(outcome).toBe('downloaded');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('canShare 拒绝文件分享：降级下载一次，downloaded', async () => {
    stubShare(false);
    const outcome = await shareOrDownloadCanvas(
      makeCanvas(new Blob(['png'], { type: 'image/png' })),
    );
    expect(outcome).toBe('downloaded');
    expect(window.navigator.share).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('画布编码为空：failed，不下载也不调用分享', async () => {
    stubShare(true);
    const outcome = await shareOrDownloadCanvas(makeCanvas(null));
    expect(outcome).toBe('failed');
    expect(window.navigator.share).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
