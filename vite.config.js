import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset paths relative so the build works on GitHub Pages
// subpaths, Netlify, Vercel, etc. without extra config.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true, // expose on LAN so you can test the camera from a phone
    allowedHosts: true, // accept tunnel hostnames (ngrok / cloudflared)
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
