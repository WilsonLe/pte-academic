import { cp, rm, access } from "node:fs/promises";
const destination = process.argv[2] || "dist";
if (!["dist", "dist-subpath"].includes(destination))
  throw new Error("Unknown static output directory");
// Start's server exists only to prerender the public SPA shell at build time.
// Deployment and offline precaching receive exclusively the client output.
await access(".start/client/index.html");
await rm(destination, { recursive: true, force: true });
await cp(".start/client", destination, { recursive: true });
console.log(`Published static client to ${destination}`);
