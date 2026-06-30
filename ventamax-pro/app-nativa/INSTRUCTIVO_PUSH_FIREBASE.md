# Notificaciones PUSH al celular (Firebase Cloud Messaging)
## Para que las notificaciones lleguen al teléfono aunque la app esté cerrada

El código (backend, frontend y registro del token) ya está listo. Faltan 3 cosas que se
hacen una sola vez: crear el proyecto Firebase, conectar la app y recompilar el APK.

> Costo: **gratis** (Firebase/FCM no cobra por esto).

---

## 1) Crear el proyecto en Firebase y conectar la app Android
1. Entra a https://console.firebase.google.com → **Agregar proyecto** (nómbralo "VentaMax").
2. Dentro del proyecto, ícono de **Android** → "Agregar app":
   - **Nombre del paquete:** `com.ventamax.app`  (¡exacto!)
   - Registra la app.
3. Descarga el archivo **`google-services.json`** que te ofrece.
4. Cópialo dentro del proyecto en:  `frontend/android/app/google-services.json`

## 2) Credenciales del servidor (para que el backend pueda enviar)
1. En Firebase → ⚙ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. Botón **Generar nueva clave privada** → descarga un archivo **JSON**.
3. En **Render** (servicio ventamax-pro) → **Environment** → agrega una variable:
   - **Nombre:** `FIREBASE_SERVICE_ACCOUNT`
   - **Valor:** pega **TODO el contenido** del JSON descargado (en una sola línea o tal cual; debe ser el JSON completo).
4. Guarda. Render reinicia el servicio. (Si esta variable falta, el push simplemente no se envía; no rompe nada.)

## 3) Agregar el plugin y recompilar el APK (en tu PC)
En la carpeta `frontend`:
```bash
npm install @capacitor/push-notifications
npx cap sync
```
Luego configura Gradle para Firebase (Android lo exige):
- En `frontend/android/build.gradle` (el del proyecto), dentro de `buildscript { dependencies { ... } }` agrega:
  ```
  classpath 'com.google.gms:google-services:4.4.2'
  ```
- En `frontend/android/app/build.gradle`, al **final del archivo**, agrega:
  ```
  apply plugin: 'com.google.gms.google-services'
  ```
Abre y compila:
```bash
npx cap open android
```
En Android Studio: deja que sincronice Gradle y genera/instala el APK (Run ▶ o Build → APK),
igual que la primera vez. Reinstala la app en los celulares.

## 4) Permiso en el celular
Al abrir la app e iniciar sesión, pedirá permiso de **notificaciones** → **Permitir**.
(En Android 13+ es obligatorio aceptar para que lleguen.)

---

## ¿Qué llega como push?
- **Inicio de ruta** (al supervisor, cuando se cumple la auditoría de ubicación).
- **Inventario cargado** (al supervisor, vendedores de la regional y administradores).
Estas mismas notificaciones siguen apareciendo en la campana 🔔 dentro de la app; ahora
además llegan al teléfono aunque la app esté cerrada.

## Despliegue
- Backend: `subir2.bat` (aplica la tabla de dispositivos e instala firebase-admin en Render).
- Frontend: `subir-frontend.bat` (publica el registro del token).
- APK: recompilar como en el paso 3 (la parte nativa cambió: nuevo plugin).

## Nota
Mientras no esté `google-services.json` + el plugin en el APK + `FIREBASE_SERVICE_ACCOUNT`
en Render, todo sigue funcionando con la campana dentro de la app; el push al teléfono se
activa cuando se completen esos 3 pasos.
