import { Route, Routes } from "react-router-dom";
import { NavKindProvider } from "./hooks/useNavKind";
import { ScrollManager } from "./components/ScrollManager";
import { PostList } from "./components/PostList";
import { PostDetail } from "./components/PostDetail";

export function App() {
  return (
    <NavKindProvider>
      <ScrollManager />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: 16,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <Routes>
          <Route path="/" element={<PostList />} />
          <Route path="/posts/:id" element={<PostDetail />} />
        </Routes>
      </div>
    </NavKindProvider>
  );
}
