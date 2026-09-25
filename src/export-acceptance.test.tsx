import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import {
  canvasResultSignature,
  resultSignature,
} from './components/TraverseChart';
import {
  downloadCanvasPng,
  shareOrDownloadCanvas,
} from './utils/export';
import { adjustTraverse } from './core/adjustment';
import type { RawEdge } from './core/types';

const edgesA: RawEdge[] = [
  { id: 'A', dx: 5, dy: 7, weight: 2 },
  { id: 'B', dx: -3, dy: -2, weight: 1 },
  { id: 'C', dx: -1, dy: -4, weight: 1 },
];
const edgesB: RawEdge[] = [
  { id: 'X', dx: 10, dy: 0, weight: 1 },
  { id: 'Y', dx: -4, dy: 6, weight: 3 },
  { id: 'Z', dx: -3, dy: -6, weight: 2 },
];
const inputA = JSON.stringify(edgesA);
const inputB = JSON.stringify(edgesB);

const triggerResize = () =>
  (globalThis as unknown as { __triggerResizeObservers: () => void }).__triggerResizeObservers();

/** 足够的 2D 上下文桩：属性可写、绘图方法均为空操作 */
function makeFake2d() {
  return new Proxy(
    {},
    {
      get(target, prop: string | symbol) {
        if (typeof prop === 'symbol') return undefined;
        if (prop in target) return (target as Record<string, unknown>)[prop];
        return () => {};
      },
      set(target, prop: string | symbol, value) {
        (target as Record<string | symbol, unknown>)[prop] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

/** 直接设置画布的 CSS 尺寸（jsdom 不做布局，clientWidth 恒为 0） */
function setCanvasCssSize(w: number, h: number) {
  const proto = HTMLElement.prototype;
  Object.defineProperty(proto, 'clientWidth', { configurable: true, value: w });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, value: h });
}

function getCanvas(): HTMLCanvasElement {
  return document.querySelector('canvas') as HTMLCanvasElement;
}

let downloadCount = 0;
let toBlobImpl: (
  cb: (blob: Blob | null) => void,
  type?: string,
) => void;

function pngBlob() {
  return new Blob(['png-bytes'], { type: 'image/png' });
}

function configureShare(opts: {
  canShare?: boolean;
  shareImpl?: () => Promise<void>;
}) {
  const nav = navigator as unknown as Record<string, unknown>;
  if (opts.canShare === undefined) {
    delete nav.canShare;
    delete nav.share;
  } else {
    nav.canShare = opts.canShare ? () => true : () => false;
    nav.share = opts.shareImpl ? opts.shareImpl : vi.fn();
  }
}

function abortError() {
  return new DOMException('Share canceled', 'AbortError');
}

function runAdjustment(json: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: json } });
  fireEvent.click(screen.getByRole('button', { name: '执行平差' }));
}

/**
 * 直接调用 React 挂在按钮 fiber 上的 onClick（绕过 disabled 的合成事件拦截），
 * 用于验证处理函数自身对“未就绪画布”的守卫。
 */
function invokeReactHandler(el: Element, key: string): void {
  const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  const handler = fiberKey
    ? (el as unknown as Record<string, Record<string, () => void>>)[fiberKey]?.[key]
    : undefined;
  if (!handler) throw new Error(`未找到 React 处理器 ${key}`);
  handler();
}

beforeEach(() => {
  downloadCount = 0;
  toBlobImpl = (cb) => cb(pngBlob());
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: (blob: Blob | null) => void,
  ) {
    toBlobImpl(cb);
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeFake2d());
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download) downloadCount += 1;
  });
  setCanvasCssSize(640, 480);
  configureShare({ canShare: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  configureShare({});
  setCanvasCssSize(0, 0);
});

const waitReady = async () =>
  waitFor(() =>
    expect(screen.getByTestId('chart-state').textContent).toContain('已绘制'),
  );

describe('PNG / 分享导出验收', () => {
  it('系统分享面板确认：提示已共享，且不产生下载', async () => {
    render(<App />);
    runAdjustment(inputA);
    await waitReady();

    configureShare({ canShare: true, shareImpl: vi.fn().mockResolvedValue(undefined) });
    fireEvent.click(screen.getByRole('button', { name: '共享画布' }));

    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toContain('已通过系统分享面板共享'),
    );
    expect(downloadCount).toBe(0);
  });

  it('用户取消分享面板：提示已取消，且实际没有任何下载', async () => {
    render(<App />);
    runAdjustment(inputA);
    await waitReady();

    configureShare({
      canShare: true,
      shareImpl: vi.fn().mockRejectedValue(abortError()),
    });
    fireEvent.click(screen.getByRole('button', { name: '共享画布' }));

    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toContain('已取消分享'),
    );
    const status = screen.getByTestId('export-notice');
    expect(status.textContent).not.toContain('已下载');
    expect(downloadCount).toBe(0);
  });

  it('环境不支持分享：真实降级下载一次，提示与下载次数一致', async () => {
    render(<App />);
    runAdjustment(inputA);
    await waitReady();

    configureShare({ canShare: false });
    fireEvent.click(screen.getByRole('button', { name: '共享画布' }));

    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toContain('已下载当前平差图形'),
    );
    expect(downloadCount).toBe(1);
  });

  it('toBlob 返回空数据：不产生下载，明确提示下载失败', async () => {
    render(<App />);
    runAdjustment(inputA);
    await waitReady();

    toBlobImpl = (cb) => cb(null);
    fireEvent.click(screen.getByRole('button', { name: '下载 PNG' }));

    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toContain('下载未完成'),
    );
    expect(downloadCount).toBe(0);
  });

  it('零尺寸隐藏期间导出被禁用且无下载；恢复显示后才交付当前结果 PNG', async () => {
    setCanvasCssSize(0, 0);
    render(<App />);
    runAdjustment(inputA);

    // 尺寸尚为零：状态提示未就绪，两个导出入口禁用
    await waitFor(() =>
      expect(screen.getByTestId('chart-state').textContent).toContain('尚未绘制'),
    );
    const shareBtn = screen.getByRole('button', { name: '共享画布' });
    const pngBtn = screen.getByRole('button', { name: '下载 PNG' });
    expect(shareBtn.hasAttribute('disabled')).toBe(true);
    expect(pngBtn.hasAttribute('disabled')).toBe(true);

    // 即使绕过按钮禁用直接调用处理函数，也必须拒绝旧/空画布
    await act(async () => {
      invokeReactHandler(pngBtn, 'onClick');
    });
    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toContain('尚未绘制完成'),
    );
    expect(downloadCount).toBe(0);

    // 恢复显示 → ResizeObserver 触发重绘 → 就绪并可下载
    setCanvasCssSize(640, 480);
    act(() => {
      triggerResize();
    });
    await waitFor(() =>
      expect(screen.getByTestId('chart-state').textContent).toContain('已绘制'),
    );
    expect(pngBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(pngBtn);
    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toContain('已下载当前平差图形 PNG'),
    );
    expect(downloadCount).toBe(1);
  });

  it('隐藏期间残留的旧结果位图在切换结果后不得导出，恢复后交付的是当前结果', async () => {
    render(<App />);
    runAdjustment(inputA);
    await waitReady();
    const sigA = resultSignature(adjustTraverse(edgesA));
    expect(canvasResultSignature(getCanvas())).toBe(sigA);

    // 隐藏画布：尺寸归零，再次平差为 B。effect 先上报未就绪；
    // 画布位图仍是 A 的旧内容（renderChart 在零尺寸下直接返回）。
    setCanvasCssSize(0, 0);
    act(() => {
      triggerResize();
    });
    runAdjustment(inputB);

    await waitFor(() =>
      expect(screen.getByTestId('chart-state').textContent).toContain('尚未绘制'),
    );
    expect(screen.getByRole('button', { name: '下载 PNG' }).hasAttribute('disabled')).toBe(
      true,
    );
    // 旧画布签名仍是 A，与当前结果 B 不符
    expect(canvasResultSignature(getCanvas())).toBe(sigA);
    const sigB = resultSignature(adjustTraverse(edgesB));
    expect(canvasResultSignature(getCanvas())).not.toBe(sigB);

    // 恢复显示：重绘 B 后才允许导出
    setCanvasCssSize(640, 480);
    act(() => {
      triggerResize();
    });
    await waitFor(() =>
      expect(screen.getByTestId('chart-state').textContent).toContain('已绘制'),
    );
    expect(canvasResultSignature(getCanvas())).toBe(sigB);

    // 导出编码拿到的画布签名必须是当前结果 B，且只下载一次
    let encodedSignature: string | null = null;
    toBlobImpl = (cb) => {
      encodedSignature = canvasResultSignature(getCanvas());
      cb(pngBlob());
    };
    fireEvent.click(screen.getByRole('button', { name: '共享画布' }));
    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toMatch(/共享|下载当前平差图形/),
    );
    expect(encodedSignature).toBe(sigB);
    expect(downloadCount).toBe(1);
  });

  it('清空结果后导出入口禁用，不残留可交付状态', async () => {
    render(<App />);
    runAdjustment(inputA);
    await waitReady();
    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(screen.getByRole('button', { name: '共享画布' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: '下载 PNG' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.queryByTestId('chart-state')).toBeNull();
  });

  it('JSON 下载不受画布就绪影响，保持原有精确整数交付', async () => {
    setCanvasCssSize(0, 0);
    render(<App />);
    runAdjustment(inputA);
    await waitFor(() =>
      expect(screen.getByTestId('chart-state').textContent).toContain('尚未绘制'),
    );
    const jsonBtn = screen.getByRole('button', { name: '下载 JSON' });
    expect(jsonBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(jsonBtn);
    await waitFor(() =>
      expect(screen.getByTestId('export-notice').textContent).toContain('已下载 JSON'),
    );
  });
});

describe('导出工具函数（不依赖 React）', () => {
  function makeCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    Object.defineProperty(c, 'clientWidth', { configurable: true, value: w });
    Object.defineProperty(c, 'clientHeight', { configurable: true, value: h });
    return c;
  }

  it('downloadCanvasPng：编码为空时 resolve(false) 且不下载', async () => {
    let clicks = 0;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        if (this.download) clicks += 1;
      });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
    await expect(downloadCanvasPng(makeCanvas(10, 10))).resolves.toBe(false);
    expect(clicks).toBe(0);
    clickSpy.mockRestore();
  });

  it('downloadCanvasPng：编码成功时 resolve(true) 且下载一次', async () => {
    let clicks = 0;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        if (this.download) clicks += 1;
      });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
      cb(pngBlob()),
    );
    await expect(downloadCanvasPng(makeCanvas(10, 10))).resolves.toBe(true);
    expect(clicks).toBe(1);
    clickSpy.mockRestore();
  });

  it('shareOrDownloadCanvas：AbortError 归类 cancelled，不下载', async () => {
    let clicks = 0;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        if (this.download) clicks += 1;
      });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
      cb(pngBlob()),
    );
    configureShare({
      canShare: true,
      shareImpl: vi.fn().mockRejectedValue(abortError()),
    });
    const outcome = await shareOrDownloadCanvas(makeCanvas(10, 10));
    expect(outcome).toBe('cancelled');
    expect(clicks).toBe(0);
    clickSpy.mockRestore();
  });

  it('shareOrDownloadCanvas：零尺寸画布直接 failed', async () => {
    const outcome = await shareOrDownloadCanvas(makeCanvas(0, 0));
    expect(outcome).toBe('failed');
  });
});
