import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), svgr()],
  // Capacitor Android WebView 实际运行在 https://localhost/，使用绝对 base
  // 避免 React Router 7 SPA 模式下动态路由模块被解析为 /assets/assets/ 的重复路径
  base: "/",
});
