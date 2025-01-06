import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import dts from 'vite-plugin-dts';
// https://vitejs.dev/config/
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    sourcemap:'hidden',
    lib: {
      entry: 'package/index.tsx',
      name: 'just-draw-it'
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        dir: 'lib',
        globals: {
          vue: 'Vue'
        }
      }
    }
  },
  plugins: [vue(), vueJsx(), 
    dts()
  ]
});
