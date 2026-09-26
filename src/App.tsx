import { useCallback, useMemo, useRef, useState } from 'react';
import { TraverseChart } from './components/TraverseChart';
import { ResultTable } from './components/ResultTable';
import { adjustTraverse } from './core/adjustment';
import { parseTraverseInput } from './core/parse';
import type { AdjustmentResult, RawEdge } from './core/types';
import { SAMPLE_JSON } from './core/sample';
import {
  downloadCanvasPng,
  downloadResultJson,
  shareOrDownloadCanvas,
} from './utils/export';

export function App() {
  const [inputText, setInputText] = useState('');
  // lastValid 保留上次有效图形：非法输入只更新错误提示，不触碰它
  const [result, setResult] = useState<AdjustmentResult | null>(null);
  const [rawEdges, setRawEdges] = useState<RawEdge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 画布是否真正画上了当前结果：仅在 TraverseChart 确认落笔后为 true，
  // 隐藏/零尺寸时保持 false，导出与共享入口随之不可用
  const [chartDrawn, setChartDrawn] = useState(false);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  const handleDrawnChange = useCallback((drawn: boolean) => {
    setChartDrawn(drawn);
  }, []);

  const closureInfo = useMemo(() => {
    if (!result) return null;
    const closed = result.closureX === 0n && result.closureY === 0n;
    return {
      closed,
      fx: result.closureX.toString(),
      fy: result.closureY.toString(),
      w: result.totalWeight.toString(),
      count: result.edges.length,
    };
  }, [result]);

  // 交付提示中标识“哪一次图形”：边数与两轴闭合差，可与下载 JSON 逐位核对
  const figureDesc = useMemo(() => {
    if (!result) return '';
    return `${result.edges.length} 条边，fx=${result.closureX.toString()}，fy=${result.closureY.toString()}`;
  }, [result]);

  const applyEdges = (edges: RawEdge[]) => {
    const adjusted = adjustTraverse(edges);
    setRawEdges(edges);
    setResult(adjusted);
    setError(null);
    // 新结果尚未落笔前视为不可导出，等待 TraverseChart 绘制确认，
    // 避免把仍显示旧图形的画布当成新结果交付
    setChartDrawn(false);
    setNotice(`平差完成：${edges.length} 条边，两轴修正后整数和严格为 0`);
  };

  const handleRun = () => {
    const parsed = parseTraverseInput(inputText);
    if (!parsed.ok) {
      // 拒绝整份数据，保留上次有效图形
      setError(parsed.error);
      return;
    }
    applyEdges(parsed.edges);
  };

  const handleLoadSample = () => {
    setInputText(SAMPLE_JSON);
    const parsed = parseTraverseInput(SAMPLE_JSON);
    if (parsed.ok) applyEdges(parsed.edges);
  };

  const handleClear = () => {
    setInputText('');
    setResult(null);
    setRawEdges([]);
    setError(null);
    setNotice(null);
    setChartDrawn(false);
  };

  const getCanvas = (): HTMLCanvasElement | null =>
    canvasHostRef.current?.querySelector('canvas') ?? null;

  /** 当前画布可导出性：结果存在、画布已挂载且已按当前结果落笔 */
  const getExportCanvas = (): HTMLCanvasElement | null => {
    if (!result || !chartDrawn) return null;
    return getCanvas();
  };

  const handleDownloadJson = () => {
    if (!result) return;
    downloadResultJson(result);
    setNotice(`已下载 JSON 结果（BigInt 精度的精确整数）：${figureDesc}`);
  };

  const handleDownloadPng = async () => {
    if (!result) return;
    const canvas = getExportCanvas();
    if (!canvas) {
      setNotice('图形尚未绘制（面板隐藏或尺寸为零），无法导出 PNG，未产生任何文件');
      return;
    }
    const ok = await downloadCanvasPng(canvas);
    setNotice(
      ok
        ? `已下载画布 PNG（当前平差结果：${figureDesc}）`
        : '画布导出失败：浏览器未能生成 PNG 数据，未产生任何文件',
    );
  };

  const handleShare = async () => {
    if (!result) return;
    const canvas = getExportCanvas();
    if (!canvas) {
      setNotice('图形尚未绘制（面板隐藏或尺寸为零），无法共享，未产生任何文件');
      return;
    }
    const outcome = await shareOrDownloadCanvas(canvas);
    if (outcome === 'shared') {
      setNotice(`已通过系统分享面板共享画布（当前平差结果：${figureDesc}）`);
    } else if (outcome === 'downloaded') {
      setNotice(`当前环境不支持分享，已改为下载 PNG（当前平差结果：${figureDesc}）`);
    } else if (outcome === 'cancelled') {
      setNotice('已取消分享，未产生任何文件');
    } else {
      setNotice('画布导出失败：浏览器未能生成 PNG 数据，未产生任何文件');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>闭合导线平差工作台</h1>
        <p className="subtitle">
          离线纯前端 · 按权重最大余数分配 · 东西/南北独立闭合 · 整数毫米精度（BigInt）
        </p>
      </header>

      <main className="layout">
        <section className="panel input-panel">
          <h2>输入顺序边（JSON 数组）</h2>
          <p className="hint">
            每条边仅含 <code>id</code>（唯一 ASCII）、
            <code>dx</code>/<code>dy</code>（|分量| ≤ 10⁶ 的整数）、
            <code>weight</code>（正整数），3–200 条。
            非法字段或重复 id 将拒绝整份数据并保留上次有效图形。
          </p>
          <textarea
            className="json-input"
            spellCheck={false}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={'[\n  {"id":"E1","dx":10,"dy":5,"weight":2},\n  ...\n]'}
          />
          <div className="button-row">
            <button className="primary" onClick={handleRun} disabled={!inputText.trim()}>
              执行平差
            </button>
            <button onClick={handleLoadSample}>载入示例</button>
            <button onClick={handleClear} disabled={!result && !inputText}>
              清空
            </button>
          </div>

          {error && (
            <div className="banner error" role="alert">
              <strong>已拒绝整份数据：</strong>
              {error}
              {result && <span className="banner-note">（画面仍为上次有效图形）</span>}
            </div>
          )}
          {!error && notice && (
            <div className="banner info" role="status">
              {notice}
            </div>
          )}

          {closureInfo && (
            <dl className="summary">
              <div>
                <dt>边数</dt>
                <dd data-testid="edge-count">{closureInfo.count}</dd>
              </div>
              <div>
                <dt>东西闭合差 fx</dt>
                <dd className={closureInfo.fx === '0' ? 'zero-check' : 'neg'}>
                  {closureInfo.fx}
                </dd>
              </div>
              <div>
                <dt>南北闭合差 fy</dt>
                <dd className={closureInfo.fy === '0' ? 'zero-check' : 'neg'}>
                  {closureInfo.fy}
                </dd>
              </div>
              <div>
                <dt>权重和 W</dt>
                <dd>{closureInfo.w}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd className={closureInfo.closed ? 'zero-check' : 'ok'}>
                  {closureInfo.closed ? '原本闭合' : '已严格闭合'}
                </dd>
              </div>
            </dl>
          )}

          <h2 className="algo-title">算法口径（可逐毫米复算）</h2>
          <ol className="algo">
            <li>
              各轴独立处理，待分配总额 <code>T = −f</code>（f 为该轴闭合差，可为负）。
            </li>
            <li>
              欧几里得整除取<strong>下整商</strong>{' '}
              <code>q = floor(T·w / W)</code>，余数{' '}
              <code>r = T·w − q·W ∈ [0, W)</code>；负数下 floor 与向零截断不同。
            </li>
            <li>
              先各分 q，剩余 <code>R = T − Σq</code> 个单位（0 ≤ R &lt; n）给余数较大者。
            </li>
            <li>余数相同按 id 的 UTF-8 字节序（小者优先）。</li>
            <li>修正量总和恒等于 −f，修正后两轴整数和严格为 0。</li>
          </ol>
        </section>

        <section className="panel chart-panel">
          <div className="chart-toolbar">
            <h2>导线叠画</h2>
            <div className="button-row">
              <button onClick={handleShare} disabled={!result || !chartDrawn}>
                共享画布
              </button>
              <button onClick={handleDownloadPng} disabled={!result || !chartDrawn}>
                下载 PNG
              </button>
              <button className="primary" onClick={handleDownloadJson} disabled={!result}>
                下载 JSON
              </button>
            </div>
          </div>
          <div className="chart-host" ref={canvasHostRef}>
            <TraverseChart result={result} onDrawnChange={handleDrawnChange} />
          </div>
          {result && !chartDrawn && (
            <p className="hint chart-unavailable" data-testid="chart-unavailable" role="note">
              图形区域当前不可见或尺寸为零，尚未绘制；共享与 PNG 导出暂不可用，恢复显示后自动重绘。
            </p>
          )}
          {result && (
            <p className="hint chart-meta">
              原始边数 {rawEdges.length}；灰虚线为原始路线（红色为未闭合缺口），蓝实线为平差后路线。
            </p>
          )}
        </section>
      </main>

      {result && (
        <section className="panel table-panel">
          <h2>逐边修正量（整数毫米）</h2>
          <ResultTable result={result} />
        </section>
      )}

      <footer className="app-footer">
        全部计算在浏览器本地完成，无网络请求；数据不离开本机。
      </footer>
    </div>
  );
}
