import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const analyze = process.env.ANALYZE === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(analyze
        ? [
            visualizer({
              filename: 'bundle-stats.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
            visualizer({
              filename: 'bundle-stats.json',
              template: 'raw-data',
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : []),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    build: {
      copyPublicDir: false,
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'vendor-firebase',
                test: /node_modules[\\/](firebase|@firebase)[\\/]/,
                priority: 25,
              },
              {
                name: 'vendor-three',
                test: /node_modules[\\/]three[\\/]/,
                priority: 25,
              },
              {
                name: 'vendor-charts',
                test: /node_modules[\\/](recharts|d3-[^\\/]+|@reduxjs[\\/]toolkit|victory-vendor)[\\/]/,
                priority: 25,
              },
              {
                name: 'vendor-motion',
                test: /node_modules[\\/](motion|motion-dom|framer-motion)[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor-maps',
                test: /node_modules[\\/]@vis\.gl[\\/]react-google-maps[\\/]/,
                priority: 20,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
