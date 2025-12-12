import { defineConfig } from "electrobun";

export default defineConfig({
  name: "Autonoma",
  version: "0.1.0",
  identifier: "com.autonoma.desktop",

  build: {
    outDir: "dist",
    minify: true,
  },

  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Autonoma",
    titleBarStyle: "hiddenInset",
  },

  // Platform-specific settings
  mac: {
    icon: "public/icon.icns",
    category: "public.app-category.developer-tools",
  },

  win: {
    icon: "public/icon.ico",
  },

  linux: {
    icon: "public/icon.png",
    category: "Development",
  },
});
