import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@ar-js-org/arjs-plugin-artoolkit'],
  },
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          // copy built ARToolKit JS files into Vite's served /assets
          src: 'node_modules/@ar-js-org/arjs-plugin-artoolkit/dist/assets/ARToolkit-*.js',
          dest: 'assets'
        }
      ]
    })
  ]
});