import type { AdjustmentResult } from '../core/types';

type JsonValue =
  | RawBigInt
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 精确整数字面量节点：序列化时原样输出 text（无引号），不经过 Number 中转 */
class RawBigInt {
  constructor(readonly text: string) {}
}

function rawBigInt(value: bigint): JsonValue {
  return new RawBigInt(value.toString());
}

function encode(value: JsonValue, indent: string, level: number): string {
  if (value instanceof RawBigInt) return value.text;
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const pad = indent.repeat(level + 1);
      const close = indent.repeat(level);
      const items = value.map((v) => pad + encode(v, indent, level + 1));
      return `[\n${items.join(',\n')}\n${close}]`;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const pad = indent.repeat(level + 1);
    const close = indent.repeat(level);
    const items = entries.map(
      ([k, v]) => `${pad}${JSON.stringify(k)}: ${encode(v, indent, level + 1)}`,
    );
    return `{\n${items.join(',\n')}\n${close}}`;
  }
  return JSON.stringify(value);
}

/**
 * BigInt 安全的 JSON 序列化：大整数以精确十进制字面量输出（无引号），
 * 避免 totalWeight（200 条边时可达约 2^61）经 Number 中转丢精度。
 *
 * JSON 文本本身逐位精确；但原生 JSON.parse 会把超过 2^53 的数字舍入为
 * double，这是 JS/JSON 的固有限制。因此同时提供 `totalWeightExact`
 * 十进制字符串字段，任何消费者都能逐位复算。修正量与平差后分量恒在
 * 安全整数范围内（|分量|≤10⁶，|修正量|≤2×10⁸），可安全解析为 number。
 */
export function stringifyResult(result: AdjustmentResult): string {
  const totalW = result.totalWeight;
  const totalWSafe =
    totalW <= BigInt(Number.MAX_SAFE_INTEGER) &&
    totalW >= BigInt(Number.MIN_SAFE_INTEGER);

  const tree: JsonValue = {
    schema: 'traverse-adjustment/1',
    closure: { x: rawBigInt(result.closureX), y: rawBigInt(result.closureY) },
    // 安全范围内给数值；超出时为 null，请使用 totalWeightExact
    totalWeight: totalWSafe ? Number(totalW) : null,
    totalWeightExact: totalW.toString(),
    edges: result.edges.map((e) => ({
      id: e.id,
      dx: e.dx,
      dy: e.dy,
      weight: e.weight,
      corrX: rawBigInt(e.corrX),
      corrY: rawBigInt(e.corrY),
      adjustedDx: rawBigInt(BigInt(e.dx) + e.corrX),
      adjustedDy: rawBigInt(BigInt(e.dy) + e.corrY),
    })),
  };

  return encode(tree, '  ', 0);
}

/** 触发浏览器下载文本/二进制内容（纯前端、离线可用） */
export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 给浏览器留出消费对象 URL 的时间后再回收
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadResultJson(result: AdjustmentResult): void {
  downloadBlob(stringifyResult(result), 'traverse-adjustment.json', 'application/json');
}

/**
 * 下载画布 PNG。返回是否真正触发了下载：
 * 画布编码为空（toBlob 回调 null，例如零尺寸/空白画布）时不产生任何下载，
 * 调用方必须依据返回值给出准确提示，不得谎报成功。
 */
export function downloadCanvasPng(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      downloadBlob(blob, 'traverse-chart.png', 'image/png');
      resolve(true);
    }, 'image/png');
  });
}

interface ShareableNavigator {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

/** 画布共享结果：四种结局一一对应可观察状态，互不混淆 */
export type ShareOutcome =
  | 'shared' // 系统分享面板确认交付
  | 'downloaded' // 环境不支持分享，已降级为下载 PNG
  | 'cancelled' // 用户取消了系统分享面板，未产生任何文件
  | 'failed'; // 画布编码失败或分享/下载过程出错

/**
 * 画布共享：支持 Web Share（含文件）时走系统分享面板，
 * 否则降级为下载 PNG。保证离线环境下也有可用出口。
 *
 * 用户取消分享（AbortError）返回 'cancelled' 且不会补发下载——
 * 取消就是取消，页面不得提示“已改为下载”。
 */
export async function shareOrDownloadCanvas(
  canvas: HTMLCanvasElement,
): Promise<ShareOutcome> {
  const nav = navigator as ShareableNavigator;
  let blob: Blob | null;
  try {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
  } catch {
    return 'failed';
  }
  if (!blob) return 'failed';

  if (nav.canShare && nav.share) {
    const file = new File([blob], 'traverse-chart.png', { type: 'image/png' });
    let shareable = false;
    try {
      shareable = nav.canShare({ files: [file] });
    } catch {
      shareable = false;
    }
    if (shareable) {
      try {
        await nav.share({ files: [file], title: '闭合导线平差结果' });
        return 'shared';
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') {
          return 'cancelled';
        }
        return 'failed';
      }
    }
  }

  try {
    downloadBlob(blob, 'traverse-chart.png', 'image/png');
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
