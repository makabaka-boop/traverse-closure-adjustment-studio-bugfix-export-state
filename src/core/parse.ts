import type { RawEdge } from './types';

export type ParseOutcome =
  | { ok: true; edges: RawEdge[] }
  | { ok: false; error: string };

export const MIN_EDGES = 3;
export const MAX_EDGES = 200;
const COORD_LIMIT = 1_000_000;
const REQUIRED_KEYS = ['dx', 'dy', 'id', 'weight'].join(',');

function isSafeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

/**
 * 解析并严格校验输入。任何一条边非法（或 id 重复）即拒绝整份数据，
 * 由调用方保留上次有效图形。
 */
export function parseTraverseInput(text: string): ParseOutcome {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${(e as Error).message}` };
  }

  if (!Array.isArray(data)) {
    return { ok: false, error: '顶层数据必须是顺序边组成的 JSON 数组' };
  }
  if (data.length < MIN_EDGES || data.length > MAX_EDGES) {
    return {
      ok: false,
      error: `边数必须在 ${MIN_EDGES} 至 ${MAX_EDGES} 条之间，当前为 ${data.length} 条`,
    };
  }

  const seenIds = new Set<string>();
  const edges: RawEdge[] = [];

  for (let i = 0; i < data.length; i++) {
    const label = `第 ${i + 1} 条边`;
    const item = data[i] as unknown;

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { ok: false, error: `${label}：必须是 JSON 对象` };
    }
    const rec = item as Record<string, unknown>;
    const keys = Object.keys(rec).sort().join(',');
    if (keys !== REQUIRED_KEYS) {
      return {
        ok: false,
        error: `${label}：字段必须恰好为 id、dx、dy、weight（缺漏或额外字段均拒绝）`,
      };
    }

    const { id, dx, dy, weight } = rec;

    if (typeof id !== 'string' || id.length === 0) {
      return { ok: false, error: `${label}：id 必须是非空字符串` };
    }
    const isAscii = [...id].every((ch) => (ch.codePointAt(0) ?? 0) < 0x80);
    if (!isAscii) {
      return { ok: false, error: `${label}：id「${id}」含非 ASCII 字符` };
    }
    if (seenIds.has(id)) {
      return { ok: false, error: `${label}：id「${id}」重复，整份数据已拒绝` };
    }

    if (!isSafeInteger(dx) || Math.abs(dx) > COORD_LIMIT) {
      return {
        ok: false,
        error: `${label}：dx 必须是绝对值不超过 10^6 的整数`,
      };
    }
    if (!isSafeInteger(dy) || Math.abs(dy) > COORD_LIMIT) {
      return {
        ok: false,
        error: `${label}：dy 必须是绝对值不超过 10^6 的整数`,
      };
    }
    if (!isSafeInteger(weight) || weight < 1) {
      return {
        ok: false,
        error: `${label}：weight 必须是不小于 1 的正整数（且不超过 2^53-1 以保证整数精度）`,
      };
    }

    seenIds.add(id);
    edges.push({ id, dx, dy, weight });
  }

  return { ok: true, edges };
}
