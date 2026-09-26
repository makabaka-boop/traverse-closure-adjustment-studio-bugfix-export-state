/**
 * jsdom 环境补桩：
 * - ResizeObserver 在 jsdom 中不存在，图表用它监听尺寸变化，桩实现即可。
 *   桩会登记存活实例，测试可用 fireResizeObservers() 模拟“尺寸恢复”。
 * - HTMLCanvasElement.getContext 默认抛“Not implemented”，统一返回 null；
 *   TraverseChart 对 getContext 为 null 已做容错，其余逻辑不依赖真实渲染。
 */
class ResizeObserverStub {
  private static instances = new Set<ResizeObserverStub>();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.add(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    ResizeObserverStub.instances.delete(this);
  }

  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }

  static fireAll(): void {
    for (const inst of [...ResizeObserverStub.instances]) inst.fire();
  }
}

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

/** 测试辅助：触发所有存活的 ResizeObserver 回调（模拟面板恢复显示/尺寸变化） */
export function fireResizeObservers(): void {
  ResizeObserverStub.fireAll();
}

// jsdom 中该方法存在但调用即抛 “Not implemented”，统一替换为返回 null
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
