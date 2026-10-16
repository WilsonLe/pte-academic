import { createFileRoute } from "@tanstack/react-router";
import App from "../App";
// The shared layout survives screen navigation; browser state never prerenders.
export const Route = createFileRoute("/_workspace")({
  component: App,
  ssr: false,
});
