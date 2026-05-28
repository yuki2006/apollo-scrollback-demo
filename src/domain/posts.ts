import { gql, type TypedDocumentNode } from "@apollo/client";
import {
  useInfiniteQuery,
  type InfiniteQueryVars,
} from "../apollo/useInfiniteQuery";

export type Post = {
  __typename?: "Post";
  id: string;
  title: string;
  body: string;
};

type PostsData = {
  posts: {
    edges: { cursor: string; node: Post }[];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
};

type PostsVars = InfiniteQueryVars;

export const POSTS_QUERY: TypedDocumentNode<PostsData, PostsVars> = gql`
  query Posts($first: Int!, $after: String) {
    posts(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          body
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export const POST_QUERY = gql`
  query Post($id: ID!) {
    post(id: $id) {
      id
      title
      body
    }
  }
`;

export function usePostsList() {
  const result = useInfiniteQuery<PostsData, PostsVars, Post>(POSTS_QUERY, {
    paginationPath: ["posts"],
  });
  return {
    posts: result.nodes,
    hasNextPage: result.hasNextPage,
    loading: result.loading,
    loadingMore: result.loadingMore,
    loadMore: result.loadMore,
    refresh: result.refresh,
  };
}
