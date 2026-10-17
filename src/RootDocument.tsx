import { lazy, Suspense, type ReactNode } from "react";
import { ClientOnly, HeadContent, Scripts } from "@tanstack/react-router";
import { bootstrapRecovery } from "./bootstrap-recovery";
import "./style.css";
import "./screens.css";

const Devtools = import.meta.env.DEV ? lazy(() => import("./Devtools")) : null;

/** Only this public shell renders at build time; learner state is client-only. */
export function RootDocument({ children }: { children: ReactNode }) {
  const base = import.meta.env.BASE_URL;
  return (
    <html lang="en">
      <head>
        {import.meta.env.PROD && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(${bootstrapRecovery.toString()})(${JSON.stringify(base)})`,
            }}
          />
        )}
        <HeadContent />
        <link rel="manifest" href={`${base}manifest.webmanifest`} />
        <link rel="icon" type="image/svg+xml" href={`${base}icon.svg`} />
        <link rel="apple-touch-icon" href={`${base}icon-192.png`} />
      </head>
      <body>
        {children}
        <Scripts />
        {Devtools && (
          <ClientOnly>
            <Suspense fallback={null}>
              <Devtools />
            </Suspense>
          </ClientOnly>
        )}
      </body>
    </html>
  );
}
