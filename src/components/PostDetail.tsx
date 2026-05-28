import { useQuery } from "@apollo/client";
import { Link, useParams } from "react-router-dom";
import { POST_QUERY } from "../domain/posts";

export function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useQuery(POST_QUERY, { variables: { id } });

  if (loading) return <p>Loading…</p>;
  if (!data?.post) return <p>Not found</p>;

  return (
    <div>
      <Link to="/" style={{ color: "#0366d6" }}>
        ← Back
      </Link>
      <h1>{data.post.title}</h1>
      <p style={{ lineHeight: 1.7 }}>{data.post.body}</p>
    </div>
  );
}
