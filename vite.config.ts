import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely: separate files stay cached across app updates.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion';
          if (id.includes('dexie')) return 'data';
          if (id.includes('@dnd-kit')) return 'dnd';
          return undefined;
        },
      },
    },
  },
  server: { port: 5191, strictPort: false },
  test: { environment: 'node' },
} as any);
