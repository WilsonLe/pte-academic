import { useEffect } from "react";

/** Browser menus and OS accessibility zoom remain under the user's control. */
export function useViewportLock() {
  useEffect(() => {
    const preventGesture = (event: Event) => event.preventDefault();
    const preventWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    const preventKeyboardZoom = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        ["+", "=", "-", "0"].includes(event.key)
      )
        event.preventDefault();
    };
    const options = { passive: false, capture: true };
    document.addEventListener("wheel", preventWheelZoom, options);
    document.addEventListener("keydown", preventKeyboardZoom, true);
    // Safari exposes trackpad pinch through these nonstandard gesture events.
    document.addEventListener("gesturestart", preventGesture, options);
    document.addEventListener("gesturechange", preventGesture, options);
    return () => {
      document.removeEventListener("wheel", preventWheelZoom, true);
      document.removeEventListener("keydown", preventKeyboardZoom, true);
      document.removeEventListener("gesturestart", preventGesture, true);
      document.removeEventListener("gesturechange", preventGesture, true);
    };
  }, []);
}
