# Permisos para Android — AndroidManifest.xml

Agregar dentro de `<manifest>` (archivo `android/app/src/main/AndroidManifest.xml`):

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

Notas:
- `ACCESS_BACKGROUND_LOCATION` = el famoso "Permitir siempre". El plugin lo solicita en 2 pasos (primero mientras se usa, luego siempre).
- En Android 13+ se necesita `POST_NOTIFICATIONS` para la notificación fija del servicio.
- El plugin libre crea automáticamente el servicio en primer plano y la notificación.
