/**
 * jsdom 环境补桩：
 * - ResizeObserver 在 jsdom 中不存在，图表用它监听尺寸变化，桩实现即可。
 * - HTMLCanvasElement.getContext 默认抛“Not implemented”，统一返回 null；
 *   TraverseChart 对 getContext 为 null 已做容错，其余逻辑不依赖真实渲染。
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

// jsdom 中该方法存在但调用即抛 “Not implemented”，统一替换为返回 null
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
