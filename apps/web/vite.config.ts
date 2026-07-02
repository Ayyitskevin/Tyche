import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Internal @tyche/* packages resolve to TypeScript source (no build step); Vite
// transforms them on the fly, so exclude them from dependency pre-bundling.
const tychePackages = [
  '@tyche/contracts',
  '@tyche/terminal-kernel',
  '@tyche/module-sdk',
  '@tyche/ui',
];

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the framework in its own long-cacheable chunk; module panels
        // are code-split via React.lazy in modules/components.ts.
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: tychePackages,
  },
  server: {
    port: 5173,
    strictPort: false,
    fs: {
      // Allow importing source from sibling workspace packages.
      allow: ['../..'],
    },
  },
  preview: {
    port: 5173,
  },
});
