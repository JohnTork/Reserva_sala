import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        painel: resolve(__dirname, "painel.html"),
        recuperarSenha: resolve(__dirname, "recuperar-senha.html"),
        termosPrivacidade: resolve(__dirname, "termos-privacidade.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
});
