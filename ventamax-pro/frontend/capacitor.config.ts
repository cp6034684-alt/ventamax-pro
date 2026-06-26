import type { CapacitorConfig } from '@capacitor/cli';

// Configuración de la app nativa VentaMax Pro.
// Estrategia: la app nativa CARGA la web en vivo (server.url), así cualquier
// cambio que publiques con subir-frontend.bat aparece solo, sin recompilar el APK.
// Solo se recompila el APK cuando cambie la capa nativa (rastreo/permisos).
const config: CapacitorConfig = {
  appId: 'com.ventamax.app',
  appName: 'VentaMax Pro',
  webDir: 'dist', // copia local de respaldo (no se usa si server.url está activo)
  server: {
    url: 'https://ventamax-frontend.pages.dev', // tu frontend en producción
    cleartext: false,
  },
  plugins: {
    // Notificación fija obligatoria de Android para rastrear en segundo plano.
    // (La maneja el plugin de geolocalización.)
  },
};

export default config;
