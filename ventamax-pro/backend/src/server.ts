// Zona horaria de Colombia (UTC-5, sin horario de verano): el "día" del
// negocio corta a medianoche local. Así un vendedor puede facturar hasta
// las 12 de la noche y al cambiar el día se reinician ruta y colores.
process.env.TZ = process.env.TZ || 'America/Bogota';

import { crearApp } from './app';
import { env } from './config/env';

const app = crearApp();
app.listen(env.PORT, () => {
  console.log(`✅ VentaMax API escuchando en http://localhost:${env.PORT}`);
});
