import { ApolloLink, Observable } from "@apollo/client";

type Post = { __typename: "Post"; id: string; title: string; body: string };

const TOTAL = 200;
const KINDS = ["最新ニュース", "更新情報", "記事", "お知らせ", "レポート"];
const POSTS: Post[] = Array.from({ length: TOTAL }, (_, i) => ({
  __typename: "Post",
  id: String(i + 1),
  title: `Post #${i + 1} — ${KINDS[i % KINDS.length]}`,
  body: `これは投稿 ${i + 1} の本文です。スクロール復元の挙動を確かめるためのダミー本文を少し長めに書いています。${"あいうえお".repeat(8)}`,
}));

export const mockLink = new ApolloLink((operation) => {
  return new Observable((observer) => {
    const delay = 250 + Math.random() * 350;
    const timer = setTimeout(() => {
      const opName = operation.operationName;
      const vars = operation.variables;

      if (opName === "Posts") {
        const first = (vars.first as number) ?? 20;
        const after = vars.after as string | null | undefined;
        const startIndex = after ? Number(after) : 0;
        const slice = POSTS.slice(startIndex, startIndex + first);
        const endIndex = startIndex + slice.length;

        observer.next({
          data: {
            posts: {
              __typename: "PostConnection",
              edges: slice.map((node, i) => ({
                __typename: "PostEdge",
                cursor: String(startIndex + i + 1),
                node,
              })),
              pageInfo: {
                __typename: "PageInfo",
                endCursor: endIndex > 0 ? String(endIndex) : null,
                hasNextPage: endIndex < POSTS.length,
              },
            },
          },
        });
      } else if (opName === "Post") {
        const id = vars.id as string;
        const post = POSTS.find((p) => p.id === id) ?? null;
        observer.next({ data: { post } });
      } else {
        observer.next({ data: null });
      }
      observer.complete();
    }, delay);

    return () => clearTimeout(timer);
  });
});
