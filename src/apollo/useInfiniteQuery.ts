import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import {
  NetworkStatus,
  useApolloClient,
  useQuery,
  type ApolloCache,
  type StoreObject,
  type TypedDocumentNode,
  type WatchQueryFetchPolicy,
} from "@apollo/client";
import { useLocation } from "react-router-dom";
import { useNavKind } from "../hooks/useNavKind";
import {
  evictRegisteredPaginations,
  registerPagination,
} from "./paginationRegistry";

type Edge<TNode> = { cursor: string; node: TNode };
type Connection<TNode> = {
  edges: Edge<TNode>[];
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
};

function walk(data: unknown, path: readonly string[]): unknown {
  let node: unknown = data;
  for (const seg of path) {
    if (node && typeof node === "object" && seg in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return node;
}

function getEvictArgs(
  data: unknown,
  paginationPath: readonly string[],
  cache: ApolloCache<unknown>
): { id?: string; fieldName: string } | null {
  const fieldName = paginationPath[paginationPath.length - 1];
  if (paginationPath.length === 1) return { fieldName };
  const parent = walk(data, paginationPath.slice(0, -1));
  if (!parent || typeof parent !== "object") return null;
  const id = cache.identify(parent as StoreObject);
  return id ? { id, fieldName } : null;
}

export type InfiniteQueryVars = {
  first?: number;
  after?: string | null;
};

export type InfiniteQueryOptions<TVars extends InfiniteQueryVars> = {
  variables?: Omit<TVars, "first" | "after">;
  /**
   * data 内の Connection の位置を明示。
   * 例: top-level なら ["posts"]、nested なら ["collection", "collectionItems"]。
   */
  paginationPath: readonly string[];
  pageSize?: number;
  skip?: boolean;
  /**
   * 戻る (POP) 時のフェッチポリシー。
   * - "cache-first" (default): 同期返却のみ。スクロール復元が安定。
   * - "cache-and-network": キャッシュ即時表示 + バックグラウンドで先頭ページを再取得。
   *   累積された 2 ページ目以降には触れないので、頻繁に更新されるドメインで
   *   「戻った瞬間の見た目はキャッシュ、その後silentに先頭が最新化」を狙える。
   *   行高が変動する UI では復元位置がズレる可能性あり。
   */
  popFetchPolicy?: "cache-first" | "cache-and-network";
};

export type InfiniteQueryResult<TData, TNode> = {
  data: TData | undefined;
  nodes: TNode[];
  hasNextPage: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  error: unknown;
};

export function useInfiniteQuery<TData, TVars extends InfiniteQueryVars, TNode>(
  query: TypedDocumentNode<TData, TVars>,
  options: InfiniteQueryOptions<TVars>
): InfiniteQueryResult<TData, TNode> {
  const {
    paginationPath,
    pageSize = 20,
    skip = false,
    variables,
    popFetchPolicy = "cache-first",
  } = options;
  const navKind = useNavKind();
  const location = useLocation();
  const { cache } = useApolloClient();

  const fetchPolicy: WatchQueryFetchPolicy =
    navKind === "POP" ? popFetchPolicy : "cache-and-network";

  const queryVars = useMemo(
    () => ({ first: pageSize, ...(variables ?? {}) }) as unknown as TVars,
    [pageSize, variables]
  );

  const { data, fetchMore, refetch, networkStatus, error } = useQuery(query, {
    variables: queryVars,
    fetchPolicy,
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
    skip,
  });

  // POP 以外で着地したら累積を捨てる。
  // 1. 自分の Connection field を evict
  // 2. registry に積まれた他の pagination field も evict
  //    (ユーザがこれまでに訪れた他リストの古い tail を残さない)
  // nested の場合 data から親エンティティを引いて identify。
  useLayoutEffect(() => {
    if (navKind === "POP") return;
    const args = getEvictArgs(data, paginationPath, cache);
    if (args) cache.evict(args);
    evictRegisteredPaginations(cache, args ? { except: args } : {});
    // 依存は location.key と navKind のみ。data 変化での再 evict は意図しない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navKind]);

  // data が確定したら自分の evict 記述子を registry に積む。
  // 次回以降の PUSH/RELOAD で他の pagination からも掃除対象になる。
  useEffect(() => {
    const args = getEvictArgs(data, paginationPath, cache);
    if (args) registerPagination(args);
  }, [data, paginationPath, cache]);

  const connection = walk(data, paginationPath) as Connection<TNode> | undefined;
  const nodes = useMemo(() => connection?.edges.map((e) => e.node) ?? [], [connection]);

  const loadMore = useCallback(async () => {
    const pi = connection?.pageInfo;
    if (!pi?.hasNextPage || !pi.endCursor) return;
    await fetchMore({
      variables: { after: pi.endCursor } as unknown as Partial<TVars>,
    });
  }, [connection, fetchMore]);

  const refresh = useCallback(async () => {
    const args = getEvictArgs(data, paginationPath, cache);
    if (args) {
      cache.evict(args);
      cache.gc();
    }
    await refetch();
  }, [cache, data, paginationPath, refetch]);

  return {
    data,
    nodes,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
    loading: networkStatus === NetworkStatus.loading,
    loadingMore: networkStatus === NetworkStatus.fetchMore,
    loadMore,
    refresh,
    error,
  };
}
