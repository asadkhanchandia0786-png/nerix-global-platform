import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const hosts=[process.env.REPLIT_DEV_DOMAIN,process.env.APP_ORIGIN?new URL(process.env.APP_ORIGIN).hostname:undefined].filter((v):v is string=>!!v);
export default defineConfig({ plugins: [react()], build: { outDir: 'dist', sourcemap: false }, server: { allowedHosts: hosts } });
