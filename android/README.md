# App Android (APK) de PokéTCG

La app Android es una **Trusted Web Activity**: un envoltorio oficial de Chrome que abre https://poketcg.pe a
pantalla completa, con icono, pantalla de inicio y accesos directos. Todo lo que cambia en la web cambia en la
app sin volver a instalarla.

- `twa-manifest.json`: configuración (nombre, colores, icono, versión). Para publicar una versión nueva, sube
  `appVersionCode` (+1) y `appVersionName` y haz push: el flujo `.github/workflows/android.yml` construye el APK
  con Bubblewrap, lo firma y lo deja en `public/descargas/poketcg.apk` (con `public/descargas/android.json`).
- La clave de firma (`poketcg-android.keystore`) **no está en el repositorio**: vive en los secretos de GitHub
  (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`) y en la carpeta privada del administrador.
- `public/.well-known/assetlinks.json` enlaza la web con la app (huella SHA-256 del certificado); sin él, la app
  mostraría la barra de direcciones de Chrome.
