import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { fireResizeObservers } from './test/setup';

// 3 条边：fx = 5-3-1 = 1，fy = 7-2-4 = 1
const inputA = JSON.stringify([
  { id: 'A', dx: 5, dy: 7, weight: 2 },
  { id: 'B', dx: -3, dy: -2, weight: 1 },
  { id: 'C', dx: -1, dy: -4, weight: 1 },
]);

// 4 条边：fx = 10-3-4+0 = 3，fy = 5+5-8+0 = 2
const inputB = JSON.stringify([
  { id: 'E1', dx: 10, dy: 5, weight: 2 },
  { id: 'E2', dx: -3, dy: 5, weight: 1 },
  { id: 'E3', dx: -4, dy: -8, weight: 1 },
  { id: 'E4', dx: 0, dy: 0, weight: 2 },
]);

/** 不落盘的真实 2D 上下文：任何方法都是可计数的桩 */
function fakeContext2d(): CanvasRenderingContext2D {
  const store: Record<PropertyKey, unknown> = {};
  return new Proxy(store, {
    get(t, prop) {
      if (!(prop in t)) t[prop] = vi.fn();
      return t[prop];
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** 让 jsdom 中零尺寸的画布“恢复显示”：给定 CSS 尺寸并提供 2D 上下文 */
function makeCanvasDrawable(canvas: HTMLCanvasElement, w = 800, h = 600): void {
  Object.defineProperty(canvas, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: h, configurable: true });
  canvas.getContext = (() =>
    fakeContext2d()) as unknown as typeof canvas.getContext;
}

function getCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('画布不存在');
  return canvas;
}

function runAdjustment(input: string): void {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: input } });
  fireEvent.click(screen.getByRole('button', { name: '执行平差' }));
}

function pngButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '下载 PNG' }) as HTMLButtonElement;
}

function shareButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '共享画布' }) as HTMLButtonElement;
}

function jsonButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '下载 JSON' }) as HTMLButtonElement;
}

function noticeText(): string {
  return screen.getByRole('status').textContent ?? '';
}

/** 点击后冲刷到宏任务边界：让导出/分享的整条微任务链（toBlob→share→setState）落定 */
async function clickAndSettle(el: HTMLElement): Promise<void> {
  fireEvent.click(el);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('画布导出与共享的可观察状态', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 以锚点点击次数作为“实际下载次数”；jsdom 无 createObjectURL，一并补桩
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

  it('零尺寸时导出入口不可用且不产生下载，恢复绘制后 PNG 对应当前结果', async () => {
    render(<App />);
    runAdjustment(inputA);

    // jsdom 中画布 CSS 尺寸为零：未落笔，共享/PNG 入口关闭并给出可用性提示
    expect(pngButton().disabled).toBe(true);
    expect(shareButton().disabled).toBe(true);
    expect(screen.getByTestId('chart-unavailable').textContent).toContain(
      '尚未绘制',
    );
    // 精确 JSON 出口不受图形可用性影响（兼容行为）
    expect(jsonButton().disabled).toBe(false);
    await clickAndSettle(jsonButton());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(noticeText()).toContain('已下载 JSON 结果');
    expect(noticeText()).toContain('3 条边，fx=1，fy=1');

    // 恢复显示：尺寸到位后触发重绘，导出入口打开
    const canvas = getCanvas();
    makeCanvasDrawable(canvas);
    canvas.toBlob = (cb: BlobCallback) =>
      cb(new Blob(['png-a'], { type: 'image/png' }));
    act(() => fireResizeObservers());
    expect(pngButton().disabled).toBe(false);
    expect(shareButton().disabled).toBe(false);
    expect(screen.queryByTestId('chart-unavailable')).toBeNull();

    await clickAndSettle(pngButton());
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(noticeText()).toContain('已下载画布 PNG');
    expect(noticeText()).toContain('3 条边，fx=1，fy=1');

    // 换一份数据重新平差：提示必须对应新结果，且与旧图形无关
    runAdjustment(inputB);
    expect(pngButton().disabled).toBe(false); // 画布仍可见，新结果已落笔
    await clickAndSettle(pngButton());
    expect(clickSpy).toHaveBeenCalledTimes(3);
    expect(noticeText()).toContain('4 条边，fx=3，fy=2');
    expect(noticeText()).not.toContain('3 条边');
  });

  it('新结果在零尺寸下未落笔前，不得导出旧画布', async () => {
    render(<App />);
    runAdjustment(inputA);
    const canvas = getCanvas();
    makeCanvasDrawable(canvas);
    act(() => fireResizeObservers());
    expect(pngButton().disabled).toBe(false);

    // 面板隐藏（尺寸归零）后重新平差：旧位图仍在，但入口必须关闭
    Object.defineProperty(canvas, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 0, configurable: true });
    act(() => fireResizeObservers());
    expect(pngButton().disabled).toBe(true);
    runAdjustment(inputB);
    expect(pngButton().disabled).toBe(true);
    expect(shareButton().disabled).toBe(true);
    expect(clickSpy).not.toHaveBeenCalled();

    // 恢复显示后导出的是新结果 B
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    canvas.toBlob = (cb: BlobCallback) =>
      cb(new Blob(['png-b'], { type: 'image/png' }));
    act(() => fireResizeObservers());
    await clickAndSettle(pngButton());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(noticeText()).toContain('4 条边，fx=3，fy=2');
  });

  it('用户取消系统分享面板：提示已取消，实际下载次数为 0', async () => {
    render(<App />);
    runAdjustment(inputA);
    const canvas = getCanvas();
    makeCanvasDrawable(canvas);
    canvas.toBlob = (cb: BlobCallback) =>
      cb(new Blob(['png'], { type: 'image/png' }));
    act(() => fireResizeObservers());

    Object.defineProperty(window.navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'share', {
      value: vi.fn(() =>
        Promise.reject(new DOMException('用户取消', 'AbortError')),
      ),
      configurable: true,
    });

    await clickAndSettle(shareButton());
    expect(noticeText()).toContain('已取消分享');
    expect(noticeText()).toContain('未产生任何文件');
    expect(noticeText()).not.toContain('已改为下载');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('系统分享成功：提示已共享且标识当前结果，无降级下载', async () => {
    render(<App />);
    runAdjustment(inputA);
    const canvas = getCanvas();
    makeCanvasDrawable(canvas);
    canvas.toBlob = (cb: BlobCallback) =>
      cb(new Blob(['png'], { type: 'image/png' }));
    act(() => fireResizeObservers());

    Object.defineProperty(window.navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'share', {
      value: vi.fn(() => Promise.resolve()),
      configurable: true,
    });

    await clickAndSettle(shareButton());
    expect(noticeText()).toContain('已通过系统分享面板共享画布');
    expect(noticeText()).toContain('3 条边，fx=1，fy=1');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('环境不支持分享：降级下载一次并提示已改为下载（兼容行为）', async () => {
    render(<App />);
    runAdjustment(inputA);
    const canvas = getCanvas();
    makeCanvasDrawable(canvas);
    canvas.toBlob = (cb: BlobCallback) =>
      cb(new Blob(['png'], { type: 'image/png' }));
    act(() => fireResizeObservers());
    // navigator 上无 canShare/share —— jsdom 默认即如此

    await clickAndSettle(shareButton());
    expect(noticeText()).toContain('当前环境不支持分享，已改为下载 PNG');
    expect(noticeText()).toContain('3 条边，fx=1，fy=1');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('画布编码为空：下载 PNG 如实失败，实际下载次数为 0', async () => {
    render(<App />);
    runAdjustment(inputA);
    const canvas = getCanvas();
    makeCanvasDrawable(canvas);
    canvas.toBlob = (cb: BlobCallback) => cb(null); // 空画布编码
    act(() => fireResizeObservers());

    await clickAndSettle(pngButton());
    expect(noticeText()).toContain('画布导出失败');
    expect(noticeText()).toContain('未产生任何文件');
    expect(noticeText()).not.toContain('已下载画布 PNG');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('分享路径遇到空画布编码：如实失败，不下载也不谎报', async () => {
    render(<App />);
    runAdjustment(inputA);
    const canvas = getCanvas();
    makeCanvasDrawable(canvas);
    canvas.toBlob = (cb: BlobCallback) => cb(null);
    act(() => fireResizeObservers());

    await clickAndSettle(shareButton());
    expect(noticeText()).toContain('画布导出失败');
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
