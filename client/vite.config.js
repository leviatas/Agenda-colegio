import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

// createRequire en vez de `import ... with { type: 'json' }`: los import
// attributes necesitan Node 20.10+, y este archivo lo corre el Node que haya
// en la imagen del build.
const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  plugins: [react()],
  // La versión que muestra el footer sale del package.json en tiempo de build:
  // no hay endpoint que la devuelva ni configuración de runtime para la SPA
  // (mismo criterio que VITE_GOOGLE_CLIENT_ID).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
  },
});
