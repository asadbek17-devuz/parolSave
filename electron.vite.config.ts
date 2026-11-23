import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), 'electron/main/index.ts'),
        external: ['electron', 'pg', 'embedded-postgres']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), 'electron/preload/index.ts'),
        external: ['electron']
      }
    }
  },
  renderer: {
    root: resolve(process.cwd(), 'src'),
    build: {
      rollupOptions: {
        input: resolve(process.cwd(), 'src/index.html')
      }
    },
    plugins: [react()]
  }
})
