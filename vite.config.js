import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite"; // Add this

// const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), solid()],

  // Compile-time constants for edition gating.
  //  * __PRO_EDITION__ is the edition flag (streaming and other paid features).
  //  * __E2EE_ENABLED__ is the crypto flag (chat/file encryption only).
  define: {
    __PRO_EDITION__: JSON.stringify(process.env.VITE_EDITION === "pro"),
    __E2EE_ENABLED__: JSON.stringify(process.env.VITE_ENABLE_E2EE === "true"),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    // host: host ||  "0.0.0.0",   // 👈 Allow access from other devices
    // hmr: host
    //   ? {
    //       protocol: "ws",
    //       host,
    //       port: 1420,
    //     }
    //   : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
