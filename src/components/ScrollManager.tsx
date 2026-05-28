import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { useNavKind } from "../hooks/useNavKind";

const positions = new Map<string, number>();

function throttle<T extends (...args: unknown[]) => void>(fn: T, wait: number): T {
  let last = 0;
  let timer: number | null = null;
  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      last = now;
      fn(...args);
    } else if (timer === null) {
      timer = window.setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

export function ScrollManager() {
  const location = useLocation();
  const navKind = useNavKind();

  useEffect(() => {
    const save = () => {
      positions.set(location.key, window.scrollY);
    };
    const throttled = throttle(save, 150);
    window.addEventListener("scroll", throttled, { passive: true });
    return () => {
      save();
      window.removeEventListener("scroll", throttled);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    if (navKind !== "POP") {
      window.scrollTo(0, 0);
      return;
    }
    const y = positions.get(location.key) ?? 0;
    // 2フレーム待ってデータ描画後の位置に当てる
    const handles: number[] = [];
    handles.push(
      requestAnimationFrame(() => {
        handles.push(
          requestAnimationFrame(() => window.scrollTo(0, y))
        );
      })
    );
    return () => handles.forEach(cancelAnimationFrame);
  }, [location.key, navKind]);

  return null;
}
