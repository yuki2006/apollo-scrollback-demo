import { createContext, useContext, useRef, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export type NavKind = "POP" | "PUSH" | "REPLACE" | "RELOAD";

const bootKind: NavKind = (() => {
  if (typeof performance === "undefined") return "PUSH";
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return nav?.type === "reload" ? "RELOAD" : "PUSH";
})();

const NavKindCtx = createContext<NavKind>(bootKind);

export function NavKindProvider({ children }: { children: ReactNode }) {
  const t = useNavigationType();
  const location = useLocation();
  const initialKeyRef = useRef<string | null>(null);
  const consumedRef = useRef(false);

  if (initialKeyRef.current === null) {
    initialKeyRef.current = location.key;
  }
  if (!consumedRef.current && initialKeyRef.current !== location.key) {
    consumedRef.current = true;
  }

  const kind: NavKind = consumedRef.current ? (t as NavKind) : bootKind;
  return <NavKindCtx.Provider value={kind}>{children}</NavKindCtx.Provider>;
}

export const useNavKind = (): NavKind => useContext(NavKindCtx);
