import { useEffect, useState } from "react";
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
          if (reg.waiting) setUpdate(reg);
          reg.addEventListener("updatefound", () => {
            reg.installing?.addEventListener("statechange", () => {
              if (
                reg.installing?.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(reg);
            });
          });
          return navigator.serviceWorker.ready;
        })
        .then(() => setReady(true))
        .catch(() =>
          setError(
            "Offline setup failed. Keep an internet connection and reload to retry.",
          ),
        );
    }
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", offer);
    };
  }, []);
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
        alert(
          "To install: open your browser menu and choose Install app, or use Share → Add to Home Screen on iPhone/iPad.",
        );
    },
    update: update
      ? () => {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => location.reload(),
            { once: true },
          );
          update.waiting?.postMessage("ACTIVATE_UPDATE");
        }
      : null,
  };
}
