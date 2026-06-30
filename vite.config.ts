import { defineConfig } from "vite";

// GitHub Pages project sites are served from a subpath: https://user.github.io/repo-name/
// Set at build time, e.g. GITHUB_PAGES_BASE=/my-repo/ (leading and trailing slashes)
// For local dev and user sites at domain root, omit or use "/".
const base =
  process.env.GITHUB_PAGES_BASE?.replace(/\/?$/, "/").replace(/^(?!\/)/, "/") ?? "/";

export default defineConfig({
  base,
  server: {
    port: 5173
  }
});
