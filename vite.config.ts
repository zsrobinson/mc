import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const panel = resolve(import.meta.dirname, "panel");

export default defineConfig({
  root: panel,
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: resolve(panel, "src/routes"),
      generatedRouteTree: resolve(panel, "src/routeTree.gen.ts"),
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": resolve(panel, "src") },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // The shell ships TypeScript source. Serve it as source so its root and
    // ui/* entry points share one module graph (one React context each), and
    // pre-bundle the CommonJS shim Base UI reaches through it.
    exclude: ["@zsrobinson/shell"],
    include: [
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
    ],
  },
  server: {
    proxy: { "/api": `http://127.0.0.1:${process.env.API_PORT ?? 8787}` },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Stable vendor chunks stay cached across app deploys.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@base-ui") || id.includes("@floating-ui"))
            return "base-ui";
          if (id.includes("@tanstack")) return "tanstack";
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
            return "react";
        },
      },
    },
  },
});
