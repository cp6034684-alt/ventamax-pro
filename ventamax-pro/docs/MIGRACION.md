# Migración desde el sistema anterior (Supabase clave-valor)

## Qué hay en el sistema viejo

Una sola tabla `ventamax_data` con filas `(key, value)` donde `value` es un JSON con
TODO el contenido de cada entidad:

| key | contenido |
|---|---|
| `users` | array de usuarios con PIN en texto plano |
| `clientes` | array completo de clientes |
| `productos` | array completo de productos |
| `facturas` | array completo de TODAS las facturas |
| `gastos` | array de gastos |

## Pasos

1. **Congela el sistema viejo** (avisa a los vendedores una ventana de mantenimiento).
2. Configura en `backend/.env`:
   ```
   SUPABASE_URL=https://<tu-proyecto>.supabase.co
   SUPABASE_ANON_KEY=<tu-key>
   ```
3. Ejecuta:
   ```bash
   cd backend && npm run migrar:supabase
   ```
4. El script imprime una **muestra de cada entidad** antes de insertar — verifica que el
   mapeo de campos coincida con tus datos reales y ajusta `scripts/migrar-desde-supabase.ts`
   si algún nombre de campo difiere.
5. Verifica conteos: el script reporta facturas migradas y omitidas.
6. Los PIN antiguos se re-hashean con bcrypt automáticamente.

## Después de migrar — IMPORTANTE

- **Rota o elimina el proyecto Supabase viejo**: su API key quedó expuesta dentro del
  HTML que circuló entre los vendedores. Cualquiera que tenga ese archivo puede seguir
  accediendo a esos datos mientras el proyecto exista.
- Cambia los PIN de todos los usuarios desde el módulo de usuarios (los antiguos
  viajaron en texto plano durante años).
