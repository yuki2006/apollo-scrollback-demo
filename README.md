# apollo-scrollback-demo

Apollo Client + React Router で「**戻るときはキャッシュから即時表示・スクロール位置も維持**」「**新規遷移／リロード時は cache-and-network で最新化**」を両立する設計の参考実装。

無限スクロールにも対応します。

```bash
npm install
npm run dev
```

`http://localhost:5173/` で起動。投稿一覧で下まで何度かスクロール → 投稿をクリック → 戻る、で挙動を確認できます。

---

## 解決したい問題

SPA でリスト + 詳細の典型的な画面を作ると、4つの要求が衝突します：

1. **戻ったときに即時表示したい** — ネットワーク待ちで一瞬白くなるのは UX が悪い
2. **戻ったときにスクロール位置を維持したい** — 「どこまで読んだか」が消えるのは致命的
3. **新規遷移／リロードでは最新データが見たい** — 古い状態を引きずると意図しない表示になる
4. **無限スクロールで読み込んだページもまとめて戻りたい** — 1ページ目だけ復元されても意味がない

Apollo Client のデフォルト挙動（`cache-first`）だと 1,2,4 は満たせるが 3 が満たせない。`cache-and-network` だと 3 が満たせる代わりに 1,2 がブレる（再フェッチで行高が変わってスクロール位置がズレる）。`network-only` だと 1,2,4 が全て崩れる。

つまり**遷移の種類によって fetch ポリシーを切り替える**必要があります。それがこのリポジトリの中心テーマです。

---

## 設計の核

### 遷移種別 × fetchPolicy

| 遷移種別 | 検出方法 | fetchPolicy | 累積キャッシュ |
|---|---|---|---|
| **POP**（戻る / 進む） | `useNavigationType()` | `cache-first`（default）／ opt-in で `cache-and-network` | 常に保持 |
| **PUSH** / **REPLACE** | `useNavigationType()` | `cache-and-network` | evict してリセット |
| **RELOAD**（ブラウザリロード） | `performance.getEntriesByType("navigation")` | `cache-and-network` | （メモリ揮発なので自然消滅） |

ポイントは **「POP で着地したときの累積は絶対に evict しない」**。これが守られていれば、`cache-first` でも `cache-and-network` でも初回レンダはキャッシュから同期返却され、スクロール復元が成立します。違いはその後にバックグラウンド fetch を出すかどうかだけです。

`popFetchPolicy: "cache-and-network"` を選ぶと、戻った瞬間はキャッシュで即時表示しつつ、裏で**先頭ページだけを silent に最新化**します。`relayStylePagination` のマージで先頭ページが更新されるだけなので、累積した 2 ページ目以降は触られません。頻繁に更新されるドメインで「戻ったときに古い」を許容できないケースに有効です。

行高が大きく変動する UI（本文長が可変、画像読み込み等）では、最新化のレンダで復元位置が数十 px ズレる可能性があるので、デフォルトは安全側の `cache-first` にしてあります。

### なぜ累積を evict するか

`relayStylePagination` を使うと、`fetchMore` で読んだ追加ページが Apollo cache 上の Connection に**マージされて蓄積**されます。これは POP 復帰で再描画する時には不可欠（5ページ目まで読んだ状態がそのまま戻る）ですが、PUSH/RELOAD で再訪するときには：

- 1ページ目だけ最新化される
- 2ページ目以降は古いまま、見えない場所に潜在
- ユーザが下にスクロールして初めて「あれ？2ページ目だけ古い」と気付く

この**ハイブリッドに古いキャッシュ**を避けるため、PUSH/RELOAD では累積部分を `cache.evict` して 1ページ目だけ最新化された状態にリセットします。POP の時だけは evict しない（蓄積を残す）ことで戻り時の即時表示と復元が成立します。

---

## レイヤ構造

```
┌──────────────────────────────────────────┐
│ UI: PostList.tsx                          │  "posts" という文字列を持たない
│  └─ usePostsList() を呼ぶだけ            │
├──────────────────────────────────────────┤
│ Domain: domain/posts.ts                   │  POSTS_QUERY を持つ
│  └─ useInfiniteQuery を thin wrap         │  整形・ドメイン固有の引数を吸収
├──────────────────────────────────────────┤
│ 汎用: apollo/useInfiniteQuery.ts          │  paginationPath を受け取る
│  └─ fetchPolicy + 累積 evict + loadMore  │  ドメイン非依存
│       + refresh() + nodes 抽出           │
├──────────────────────────────────────────┤
│ 横串: hooks/useNavKind.tsx                │  POP/PUSH/REPLACE/RELOAD を返す
│       <ScrollRestoration />               │  react-router の標準。RootLayout で 1 度
├──────────────────────────────────────────┤
│ 通信: apollo/client.ts, mockLink.ts       │  relayStylePagination 登録 + mock
└──────────────────────────────────────────┘
```

**画面コードに `posts` という文字列は登場しません**。`usePostsList()` を呼ぶだけです。GraphQL のフィールド名や cache.evict の引数は domain 層と汎用層に閉じ込めています。

別ドメイン（users 等）を追加する時は `domain/users.ts` に `USERS_QUERY` と `useUsersList` を書くだけで、汎用層には触れません。

---

## 主要な設計判断

### 1. `paginationPath` を明示する（AST 自動抽出をしない）

```ts
useInfiniteQuery(POSTS_QUERY, {
  paginationPath: ["posts"],
});
```

クエリから自動で root field を抽出する実装も書けますが、現実のクエリは以下のような形を取り得ます：

```graphql
query CollectionDetail($collectionId: ID!) {
  collection(id: $collectionId) {
    id
    title              # スカラ
    userCollection {   # ネストエンティティ
      ownedItems       # 配列だが pagination ではない
    }
    collectionItems(   # ← これが pagination 対象
      pageInput: $pageInput
    ) {
      edges { ... }
      pageInfo { ... }
    }
  }
}
```

複数 pagination フィールドが混在したり、ネストの奥にあったりするので **AST だけでは「どれが pagination 対象か」を確実に決められない**。明示すれば曖昧さがなく、テストもしやすい。

### 2. nested pagination の auto evict は `cache.identify` で

`paginationPath: ["collection", "collectionItems"]` のような場合、`fieldName: "collectionItems"` を ROOT_QUERY に対して evict しても意味がない（実際は `Collection:X` 配下にある）。

そこで `refresh()` および PUSH/RELOAD 時の auto evict では、現在の data をたどって親エンティティを取り、`cache.identify` で正規化キー（`Collection:X`）を得てから evict します：

```ts
const parent = paginationPath.slice(0, -1)
  .reduce((acc, key) => acc?.[key], data);
const parentId = cache.identify(parent); // "Collection:42"
cache.evict({ id: parentId, fieldName: "collectionItems" });
```

`cache.identify` は `__typename` + keyFields から ID を組み立ててくれるので、**ドメイン側に追加情報を持たせる必要がありません**。

制約：data が確定する前（初回ロード中）は親 entity を特定できない。これは `refresh()` が必ず UI イベント由来で呼ばれること、PUSH/RELOAD 時の auto evict は「前回訪問時のキャッシュが残っているなら data は既に存在」という性質を使って実害なし、と判断しています。

### 3. 汎用フックを肥大化させない

`useInfiniteQuery` がカバーする責務は最小限に絞っています：

```
汎用フックの責務:
  ✓ 遷移種別に応じた fetchPolicy 決定
  ✓ paginationPath から edges / pageInfo を抽出
  ✓ loadMore (cursor 計算と fetchMore 呼び出し)
  ✓ refresh (累積を捨てて再 fetch)
  ✗ filter / sort 切替    → variables 経由でドメインに残す
  ✗ optimistic update     → ドメインに残す
  ✗ ScrollRestoration     → 横串で別レイヤ
  ✗ エラー UI / Empty UI   → コンポーネントに残す
```

ドメインごとの変奏（ログイン状態で別クエリ、ページサイズ可変、フィルタ多種、等）は **composition で外**に出します。フックを options 漬けにして表現するのは肥大化のもと。

### 4. スクロール復元は React Router の `<ScrollRestoration />` に委譲

```tsx
// RootLayout
<NavKindProvider>
  <ScrollRestoration />
  <Outlet />
</NavKindProvider>
```

スクロール位置の保存・復元は自前実装の必要がなく、`<ScrollRestoration />` を root layout に 1 度置くだけで成立します（POP で復元・PUSH/REPLACE でトップへ）。sessionStorage に保存されるので**リロード跨ぎでも位置が残ります**。

この置換が成立する前提：

- **Data Router 構成にする必要がある**（`createBrowserRouter` + `<RouterProvider>`）。`<BrowserRouter>` では `<ScrollRestoration />` は使えません
- **POP 着地時にデータが同期的に揃っている必要がある**。`useInfiniteQuery` が `cache-first` を返している間はこれが保証されます。Suspense bound query 等で非同期になる場合は復元タイミングと噛み合わなくなる可能性があります

`<ScrollRestoration />` は内部で `useLayoutEffect` 相当のタイミングで `scrollTo` を呼びます。`useInfiniteQuery` 側で POP のときは累積データをキャッシュから同期的に返すので、レイアウトは既に完了しており復元位置がそのまま当たります。

**仮想化リストを使う場合は `<ScrollRestoration />` では救えません**。px ベース固定なので、インデックス／アイテム ID で保存して `scrollToIndex` する独自実装が必要です。その場合は `<ScrollRestoration />` を外して自前のコンポーネントに差し替える、という分離になっています。

### 5. `nextFetchPolicy: "cache-first"` は必須

これを書き忘れると、state 更新の度に `cache-and-network` が再評価されて延々と再フェッチが走ります。`useInfiniteQuery` 内で必ず指定しています。

### 6. `useNavKind` の boot 判定

`useNavigationType()` は初回ロード時に `"POP"` を返します。これをそのまま受け取ると「初回ロードなのに POP 扱いで cache-first」になり、空キャッシュを読みに行って空表示になります。

そこで Performance API で `navigation.type === "reload"` を判定し、初回ロード時のみ `bootKind`（RELOAD or PUSH）を返すよう Provider を介して上書きしています。

```ts
const bootKind = nav.type === "reload" ? "RELOAD" : "PUSH";
// 最初の location.key 変更まで bootKind を返す
// それ以降は useNavigationType の値をそのまま返す
```

---

## 動作確認シナリオ

| シナリオ | 期待 |
|---|---|
| トップ → スクロール → 投稿クリック → 戻る | スクロール位置と累積データが両方復元される。ネットワークリクエストは発生しない |
| 詳細 → ヘッダーのリンクでトップへ（PUSH） | 累積 evict → 1ページ目だけ最新化（cache-and-network） |
| ブラウザリロード | RELOAD として判定 → cache-and-network |
| トップで refresh ボタン | tail も含めて evict → refetch（プルダウンリフレッシュ相当） |
| 無限スクロール | IntersectionObserver で 20件ずつ追加読み込み、`relayStylePagination` で累積 |

mock link（`src/apollo/mockLink.ts`）に 250-600ms のランダム遅延を入れています。本物の挙動と区別がつくよう確認してください。

---

## 既存のライブラリで代替できないか

「戻りでキャッシュ + 進みで最新化 + スクロール復元 + 無限スクロール」を**一括で**提供するライブラリは（私の調べた範囲では）存在しません。最も近いのは TanStack Router + TanStack Query の組み合わせで、Apollo を使わない判断ができるなら検討の価値があります。

Apollo を維持する前提では、本リポジトリ程度の薄い実装（合計 200 行未満）が現実解だと考えています。設計判断が UX 仕様に強く依存する（古いデータの許容範囲、リロードの扱い、仮想化の有無）ため、ライブラリ化しても結局のところオプション漬けになる、というのが一括提供品が育っていない理由だと思われます。

---

## ファイル構成

```
src/
├── App.tsx                       # RootLayout (ScrollRestoration + Outlet)
├── main.tsx                      # ApolloProvider + createBrowserRouter
├── apollo/
│   ├── client.ts                 # InMemoryCache + relayStylePagination 登録
│   ├── mockLink.ts               # フェイクのページネーション付き ApolloLink
│   └── useInfiniteQuery.ts       # 中心となる汎用フック
├── hooks/
│   └── useNavKind.tsx            # 遷移種別 + boot 判定
├── components/
│   ├── PostList.tsx              # UI（"posts" を知らない）
│   └── PostDetail.tsx            # 戻り検証用の詳細ページ
└── domain/
    └── posts.ts                  # GraphQL ドキュメント + thin wrapper
```

---

## ライセンス

MIT
