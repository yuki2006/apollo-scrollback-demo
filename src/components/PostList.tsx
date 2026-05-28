import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { usePostsList } from "../domain/posts";

export function PostList() {
  const { posts, loadMore, loading, loadingMore, hasNextPage, refresh } =
    usePostsList();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h1 style={{ marginTop: 0 }}>
          Posts{" "}
          <span style={{ fontWeight: "normal", color: "#888" }}>
            ({posts.length} loaded)
          </span>
        </h1>
        <button onClick={() => refresh()} style={{ padding: "4px 12px" }}>
          refresh
        </button>
      </div>
      {loading && posts.length === 0 && <p>Loading…</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {posts.map((post) => (
          <li
            key={post.id}
            style={{ padding: "16px 0", borderBottom: "1px solid #eee" }}
          >
            <Link
              to={`/posts/${post.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <h3 style={{ margin: "0 0 8px" }}>{post.title}</h3>
              <p style={{ margin: 0, color: "#666" }}>{post.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && (
        <p style={{ textAlign: "center", color: "#888" }}>loading more…</p>
      )}
      {!hasNextPage && posts.length > 0 && (
        <p style={{ textAlign: "center", color: "#aaa" }}>— end —</p>
      )}
    </div>
  );
}
