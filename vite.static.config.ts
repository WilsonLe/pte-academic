import { defineConfig } from "vite";
// Preview exactly the published static files, with no Start runtime server.
export default defineConfig({ base: process.env.BASE_PATH || "/" });
