import { ApolloClient, InMemoryCache } from "@apollo/client";
import { relayStylePagination } from "@apollo/client/utilities";
import { mockLink } from "./mockLink";

export const client = new ApolloClient({
  link: mockLink,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          posts: relayStylePagination(),
        },
      },
    },
  }),
});
