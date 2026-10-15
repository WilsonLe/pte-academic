import { useCallback, useEffect, useState } from "react";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function usePwa() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [ready, setReady] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const online = () => setOffline(!navigator.onLine);
    const offer = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", offer);
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((reg) => {
          if (disposed) return navigator.serviceWorker.ready;
          if (reg.waiting && navigator.serviceWorker.controller) setUpdate(reg);
          const observeInstalling = () => {
            const worker = reg.installing;
            if (!worker) return;
            const changed = () => {
              if (
                !disposed &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(reg);
            };
            worker.addEventListener("statechange", changed);
            cleanups.push(() =>
              worker.removeEventListener("statechange", changed),
            );
            changed();
          };
          reg.addEventListener("updatefound", observeInstalling);
          cleanups.push(() =>
            reg.removeEventListener("updatefound", observeInstalling),
          );
          observeInstalling();
          return navigator.serviceWorker.ready;
        })
        .then(() => {
          if (!disposed) setReady(true);
        })
        .catch(() => {
          if (!disposed)
            setError(
              "Offline setup failed. Keep an internet connection and reload to retry.",
            );
        });
    }
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", offer);
    };
  }, []);
  const applyUpdate = useCallback(() => {
    if (!update?.waiting) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
    update.waiting.postMessage("ACTIVATE_UPDATE");
  }, [update]);
  return {
    offline,
    ready,
    error,
    canInstall: !!install,
    install: async () => {
      if (install) {
        await install.prompt();
        await install.userChoice;
        setInstall(null);
      } else
        return "Use your browser’s Install option, or Share → Add to Home Screen on iPhone/iPad.";
    },
    update: update ? applyUpdate : null,
  };
}
