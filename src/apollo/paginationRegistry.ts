import type { ApolloCache } from "@apollo/client";

export type EvictKey = { id?: string; fieldName: string };

// モジュールスコープのレジストリ。
// SPA 内で訪れた pagination field を蓄積し、PUSH/RELOAD 時に
// 「いま画面に出ていない」ものも含めて tail を捨てるために使う。
const descriptors = new Map<string, EvictKey>();

function keyOf(k: EvictKey): string {
  return `${k.id ?? "ROOT_QUERY"}::${k.fieldName}`;
}

export function registerPagination(d: EvictKey): void {
  descriptors.set(keyOf(d), d);
}

export function evictRegisteredPaginations(
  cache: ApolloCache<unknown>,
  opts: { except?: EvictKey } = {}
): void {
  const exceptKey = opts.except ? keyOf(opts.except) : null;
  for (const [key, d] of descriptors) {
    if (key === exceptKey) continue;
    cache.evict(d);
  }
  cache.gc();
}

// テスト等で全消ししたい場合用。
export function _clearPaginationRegistry(): void {
  descriptors.clear();
}
