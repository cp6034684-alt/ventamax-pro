# VentaMax Pro — App nativa Android con rastreo en segundo plano
## Instructivo de construcción (Opción A · plugin libre, sin costo)

Este documento deja todo listo para generar el **APK** de VentaMax Pro que rastrea la
ubicación **aunque la app esté cerrada o minimizada**. La app web actual **no se toca**:
la versión nativa carga la web en vivo, así que tus cambios diarios siguen igual (mismo
repositorio, mismo `subir-frontend.bat`) y aparecen solos en la app, sin reinstalar.

> El APK se compila en un PC con Android Studio (no se puede en la nube). Aquí están todos
> los pasos; te puedo acompañar en vivo cuando lo hagas.

---

## 0) Requisitos (instalar una sola vez en el PC)
- **Node.js** (ya lo usas para la web).
- **Android Studio** (gratis) → incluye el **SDK de Android**. https://developer.android.com/studio
- **JDK 17** (Android Studio lo trae).
- Un **celular Android** (versión 9+) con cable USB y "Depuración USB" activada, para probar.

---

## 1) Instalar Capacitor en el proyecto `frontend`
Abre una terminal en la carpeta `frontend` del proyecto y ejecuta:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor-community/background-geolocation
```

## 2) Configuración de Capacitor
Copia el archivo **`app-nativa/capacitor.config.ts`** a la carpeta `frontend/` (raíz del
frontend). Ya viene configurado:
- `appId`: `com.ventamax.app`
- carga la web en vivo desde `https://ventamax-frontend.pages.dev`

## 3) Agregar el código de rastreo
1. Copia **`app-nativa/rastreoNativo.ts`** a `frontend/src/api/rastreoNativo.ts`.
2. Inícialo cuando un rol de campo entra. En `frontend/src/auth/AuthContext.tsx`,
   dentro de `iniciarSesion`, agrega:
   ```ts
   import { iniciarRastreoNativo, detenerRastreoNativo } from '../api/rastreoNativo';
   // ...al iniciar sesión un VENDEDOR o SUPERVISOR:
   if (u.rol === 'VENDEDOR' || u.rol === 'SUPERVISOR') iniciarRastreoNativo();
   ```
   Y en `cerrarSesion`: `detenerRastreoNativo();`
   (En navegador normal estas funciones no hacen nada; solo actúan en la app nativa.)

## 4) Generar el proyecto Android
En la carpeta `frontend`:
```bash
npm run build            # genera dist (respaldo local)
npx cap add android      # crea la carpeta android/ (proyecto nativo)
npx cap sync             # sincroniza plugins y config
```

## 5) Permisos
Abre `frontend/android/app/src/main/AndroidManifest.xml` y agrega los permisos del
archivo **`app-nativa/permisos-android.md`** (ubicación fina + en segundo plano +
servicio en primer plano + notificaciones).

## 6) Abrir en Android Studio y compilar
```bash
npx cap open android
```
En Android Studio:
1. Espera a que termine "Gradle sync".
2. Conecta el celular y prueba: botón **Run** ▶ (instala la app de prueba).
3. Para el **APK definitivo (release)**:
   - Menú **Build → Generate Signed Bundle / APK → APK**.
   - Crea una **clave (keystore)** la primera vez (guárdala bien; sirve para todas las
     futuras actualizaciones). **Si la pierdes, no podrás actualizar la app.**
   - Elige **release** y genera. El APK queda en
     `android/app/release/app-release.apk`.

## 7) Instalar en los celulares de los vendedores
- Pásales el `app-release.apk` (WhatsApp, USB o un enlace).
- Al instalar, Android pedirá permitir "instalar apps de origen desconocido" (normal para
  APK directo, sin tienda).
- **Muy importante**, al abrir la app por primera vez:
  1. Permiso de ubicación → elegir **"Permitir siempre"** (no solo "mientras se usa").
  2. Permitir **notificaciones** (para la notificación de rastreo activo).
  3. En **Ajustes → Batería**, quitar la app de la **optimización/ahorro de batería**
     (en Xiaomi/Huawei/Samsung esto es clave para que no la cierren).

## 8) Publicar en Google Play (opcional)
- Solo si quieres tienda. Cuenta de **Google Play Developer: USD$25 (pago único)**.
- Si no, el APK directo (paso 7) funciona sin costo.

---

## Mantenimiento y actualizaciones
- **Cambios de la app (pantallas, arreglos, dashboard, etc.):** se siguen haciendo igual,
  con `subir-frontend.bat`. **Aparecen solos en la app**, sin recompilar ni reinstalar.
- **Recompilar el APK** solo si cambia la capa nativa: el plugin de rastreo, los permisos
  o la configuración de Android (poco frecuente). Recuerda usar **el mismo keystore**.

## Subir a Opción B (rastreo profesional) más adelante
- Se reemplaza el plugin libre por `@transistorsoft/capacitor-background-geolocation`
  (licencia única USD$399, solo para la versión release; debug es gratis).
- Cambia el archivo `rastreoNativo.ts` por la versión del plugin profesional y se recompila.
- El resto (config, permisos, proceso) es igual.

## Límites honestos
- Ningún sistema rastrea si el vendedor **apaga el GPS**, **niega el permiso** o el sistema
  operativo cierra la app por batería. El plugin minimiza esto; la Opción B lo minimiza más.
- iPhone (iOS) es un proceso aparte (requiere Mac + cuenta Apple Developer USD$99/año).
