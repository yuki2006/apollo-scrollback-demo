import { Outlet, ScrollRestoration } from "react-router-dom";
import { NavKindProvider } from "./hooks/useNavKind";

export function RootLayout() {
  return (
    <NavKindProvider>
      <ScrollRestoration />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: 16,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <Outlet />
      </div>
    </NavKindProvider>
  );
}
