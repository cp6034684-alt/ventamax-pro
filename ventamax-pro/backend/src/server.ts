import { crearApp } from './app';
import { env } from './config/env';

const app = crearApp();
app.listen(env.PORT, () => {
  console.log(`✅ VentaMax API escuchando en http://localhost:${env.PORT}`);
});
