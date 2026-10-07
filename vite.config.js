import { defineConfig } from "vite";
import { resolve } from "node:path";
const root = import.meta.dirname;

// GitHub Pages(하위 경로)에서도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        student: resolve(root, "student.html"),
        professor: resolve(root, "professor.html")
      }
    }
  }
});
