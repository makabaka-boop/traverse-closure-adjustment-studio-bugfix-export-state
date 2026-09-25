/**
 * jsdom 环境补桩：
 * - ResizeObserver 在 jsdom 中不存在，图表用它监听尺寸变化。
 *   桩默认不触发；测试可通过 __resizeObserverInstances 拿到实例并
 *   手动触发回调，模拟“零尺寸隐藏 → 恢复显示重绘”的顺序。
 * - HTMLCanvasElement.getContext 默认抛“Not implemented”，统一返回 null；
 *   TraverseChart 对 getContext 为 null 已做容错，需要真实绘制路径的
 *   用例可自行 vi.spyOn 替换。
 * - URL.createObjectURL/revokeObjectURL 下载链路补桩。
 */
type ResizeCallback = (entries: unknown[]) => void;

class ResizeObserverStub {
  callback: ResizeCallback;
  target: Element | null = null;

  constructor(callback: ResizeCallback) {
    this.callback = callback;
    instances.add(this);
  }

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(): void {
    this.target = null;
  }

  disconnect(): void {
    this.target = null;
    instances.delete(this);
  }

  /** 测试辅助：模拟一次尺寸变化回调 */
  trigger(): void {
    if (this.target) this.callback.call(this, [{ target: this.target }]);
  }
}

const instances = new Set<ResizeObserverStub>();

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

/** 测试辅助：触发当前所有存活观察器的尺寸回调 */
function triggerAllResizeObservers(): void {
  instances.forEach((ro) => ro.trigger());
}
(globalThis as Record<string, unknown>).__triggerResizeObservers =
  triggerAllResizeObservers;

// jsdom 中该方法存在但调用即抛 “Not implemented”，统一替换为返回 null
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// jsdom 不实现对象 URL；下载计数测试依赖它们不抛错
if (!URL.createObjectURL) {
  URL.createObjectURL = (() => 'blob:mock-url') as typeof URL.createObjectURL;
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
}
