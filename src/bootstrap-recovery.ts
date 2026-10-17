/** Runs in the public document before any hashed app script can fail. */
export function bootstrapRecovery(base: string) {
  let ready = false;
  let panel: HTMLElement | undefined;
  const show = () => {
    if (ready || panel || !document.body) return;
    panel = document.createElement("section");
    panel.setAttribute("role", "alert");
    panel.id = "bootstrap-recovery";
    panel.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:#f8f7fc;color:#25233b;display:grid;place-content:center;gap:16px;padding:32px;font:18px system-ui";
    const heading = document.createElement("h1");
    heading.textContent = "Let’s reopen your practice";
    const text = document.createElement("p");
    text.textContent =
      "The app could not finish loading. Your saved sessions and recordings are kept on this device.";
    const button = document.createElement("button");
    button.textContent = "Reload app";
    button.style.cssText =
      "font:inherit;padding:16px;border:0;border-radius:16px;background:#6939ed;color:white;cursor:pointer";
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = "Reopening…";
      try {
        const scope = new URL(base, location.origin).href;
        const reg = await navigator.serviceWorker?.getRegistration(scope);
        // A failed bootstrap cannot use React's update control. Remove only this
        // registration; learner/model caches and IndexedDB remain untouched.
        if (reg && reg.scope === scope) await reg.unregister();
        const url = new URL(location.href);
        url.searchParams.set("app-recovery", String(Date.now()));
        location.replace(url);
      } catch {
        button.disabled = false;
        button.textContent = "Retry reload";
      }
    };
    panel.append(heading, text, button);
    document.body.append(panel);
  };
  const failure = (event: Event) => {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === "SCRIPT" || tag === "LINK") setTimeout(show, 0);
  };
  const timer = setTimeout(show, 15000);
  window.addEventListener("error", failure, true);
  window.addEventListener(
    "pte-workspace-ready",
    () => {
      ready = true;
      clearTimeout(timer);
      window.removeEventListener("error", failure, true);
      panel?.remove();
    },
    { once: true },
  );
  // Registration must also happen when no app JavaScript can run. A coherent
  // existing worker still waits for the normal user-controlled update action.
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    void navigator.serviceWorker
      .register(base + "sw.js")
      .then((reg) => reg.update())
      .catch(() => {});
}
