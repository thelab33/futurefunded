"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { nextLoadedPhoto, shouldRotatePhotos } from "./campaign-photo-policy";

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverNotReady = () => false;
function subscribeMotion(change: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const motionReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverReduced = () => true;
function subscribeVisibility(change: () => void) {
  document.addEventListener("visibilitychange", change);
  document.addEventListener("toggle", change, true);
  return () => {
    document.removeEventListener("visibilitychange", change);
    document.removeEventListener("toggle", change, true);
  };
}
const pageInteractive = () => !document.hidden && !document.querySelector("dialog[open]");

export function useCampaignPhotoRotation(count: number, root: RefObject<HTMLElement | null>) {
  const [frame, setFrame] = useState({ active: 0, previous: null as number | null });
  const [requested, setRequested] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(true);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const pointerIntent = useRef<boolean | null>(null);
  const hydrated = useSyncExternalStore(subscribeHydration, clientReady, serverNotReady);
  const reduced = useSyncExternalStore(subscribeMotion, motionReduced, serverReduced);
  const interactive = useSyncExternalStore(subscribeVisibility, pageInteractive, serverNotReady);
  const running = hydrated && shouldRotatePhotos({ requested, reduced, interactive, hovered, inView, readyCount: loaded.size });

  useEffect(() => {
    const element = root.current;
    if (!element || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => {
      setInView(entries.some(entry => entry.isIntersecting));
    }, { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setFrame(current => {
        const next = nextLoadedPhoto(current.active, count, loaded, 1);
        return next === null || next === current.active ? current : { active: next, previous: current.active };
      });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [running, count, loaded]);

  const onLoad = useCallback((index: number) => {
    setLoaded(current => current.has(index) ? current : new Set([...current, index]));
    setFrame(current => failed.has(current.active) ? { active: index, previous: null } : current);
  }, [failed]);
  const onError = useCallback((index: number) => {
    setFailed(current => new Set([...current, index]));
    const available = new Set(loaded); available.delete(index);
    setLoaded(available);
    setFrame(current => {
      if (current.active !== index) return current;
      const next = nextLoadedPhoto(index, count, available, 1);
      return next === null ? current : { active: next, previous: null };
    });
  }, [loaded, count]);
  function step(direction: 1 | -1) {
    setRequested(false);
    setFrame(current => {
      const next = nextLoadedPhoto(current.active, count, loaded, direction);
      return next === null || next === current.active ? current : { active: next, previous: current.active };
    });
  }
  return {
    ...frame, running, requested, reduced, hydrated, readyCount: loaded.size,
    onLoad, onError, step,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocusCapture: () => setRequested(false),
    onRotationPointerDown: () => { pointerIntent.current = !requested; },
    toggleRotation: (pointerClick: boolean) => {
      // Pointer focus pauses before click. Preserve the intent from pointerdown;
      // keyboard activation instead follows the currently displayed action.
      setRequested(pointerClick && pointerIntent.current !== null ? pointerIntent.current : !requested);
      pointerIntent.current = null;
    },
  };
}
