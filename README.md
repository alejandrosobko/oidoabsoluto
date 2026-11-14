# Sound 2 Sheet

**sound-2-sheet** es una web app que escucha la grabación de un piano y arma la partitura (clave de sol y de fa). Todo corre en el navegador: el audio no sale del dispositivo, no hay servidor, no hay cuentas ni claves, y no tiene costo.

Funciona en Safari del iPhone y en cualquier navegador moderno.

## Cómo funciona

1. **Notas:** el modelo [Basic Pitch](https://github.com/spotify/basic-pitch-ts) de Spotify (código abierto, Apache 2.0) detecta qué notas suenan y cuándo. Corre en el navegador con TensorFlow.js y usa la GPU si hay.
2. **Pulso:** se sigue el tempo del intérprete aunque acelere o frene, y cada nota se lleva a la figura más cercana (semicorchea o corchea).
3. **Manos:** las notas que suenan juntas se reparten entre clave de sol y de fa según la extensión y la zona del teclado.
4. **Tonalidad:** se elige la armadura más probable y las notas se escriben con sostenidos o bemoles según corresponda.
5. **Partitura:** se genera MusicXML y se dibuja con [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/).
6. **Reproducción:** suena exactamente lo escrito (con muestras de un piano de cola real) y un cursor marca el acorde que está sonando.

El resultado es un **borrador**: las notas suelen estar bien, pero el ritmo y el reparto de manos conviene revisarlos en [MuseScore](https://musescore.org) (gratis) importando el MusicXML.

## Requisitos

- Node 20 o más nuevo (`.nvmrc` pide 22).
- Para el script de terminal (opcional): `ffmpeg`.

## Uso

```bash
npm install          # también copia el modelo a public/model
npm run dev          # http://localhost:5173
```

### Abrirlo desde el iPhone (misma red Wi-Fi)

```bash
npm run serve:lan
```

Muestra una dirección `Network: http://192.168.x.x:4173/`. Abrila en Safari del iPhone. La Mac tiene que quedar prendida con el comando corriendo.

### Instalarla en el celular

La app se puede instalar como PWA (queda con su ícono en la pantalla de inicio y funciona sin internet). La primera vez que se abre en el celular aparece un aviso arriba:

- **Android (Chrome):** botón **Instalar**, que abre el diálogo del navegador. El navegador no deja abrirlo sin que la persona toque algo, por eso es un botón.
- **iPhone / iPad:** botón **Ver cómo**, con los pasos (Compartir → Agregar a inicio).
- **Samsung Internet:** pide abrir la página en Chrome, con un botón que la abre ahí.

Si se cierra el aviso, no vuelve a aparecer por 14 días. Ya instalada, no aparece.

Para que funcione sin conexión, `public/sw.js` (service worker) guarda la página, el código, el modelo y las muestras de piano. Al buildear, `vite.config.ts` le agrega la lista de archivos y una versión nueva: después de cada deploy, el teléfono baja la versión nueva la próxima vez que abre la app con internet. En `npm run dev` no se registra.

### En la app

1. **Elegir audio o video:** MP3, M4A, WAV, o un video MP4/MOV (por ejemplo, desde Fotos o Archivos).
2. Esperar mientras procesa (hay barra de progreso). Dejar la pantalla abierta.
3. Ajustar si hace falta; la partitura se rearma al instante, sin volver a procesar:
   - **Tempo:** vacío = automático. Si sale el doble o la mitad de lo esperado, escribí el valor correcto. Si el tempo parece haberse detectado a la mitad (muchas notas encimadas) o a un tercio (notas que se agrupan de a 3), aparece un aviso con un botón para probar el doble, o el triple en 3/4, y otro para volver a como estaba.
   - **Compás:** 4/4, 3/4 o 2/4.
   - **Figura más corta:** corchea (por defecto) da una lectura más limpia; semicorchea es más fiel pero muestra cada pequeño rubato como figuras con puntillo.
   - **Primer sonido en el tiempo:** si la música arranca con anacrusa, corre las barras de compás.
   - **Armadura:** automática, o elegila a mano si la detectada no te convence (por ejemplo, entre Fa menor y Si♭ mayor).
   - **Sensibilidad:** menos = solo notas claras; más = también las suaves (y alguna fantasma).
4. **▶ Reproducir** toca la partitura tal como se ve, con un cursor que avanza y la página que se desplaza sola. Si cambiás una opción (por ejemplo, la sensibilidad), se frena y la próxima vez suena la versión nueva. ⏮ vuelve al inicio. En el iPhone suena aunque la llave de silencio esté puesta (iOS 17 o más nuevo).
5. Exportar:
   - **MusicXML:** para abrir y corregir en MuseScore, Finale, Sibelius, etc.
   - **MIDI:** las notas tal como se tocaron, para escuchar el resultado.
   - **Imprimir / PDF:** en el iPhone, Compartir → Imprimir → pellizcar la vista previa → Guardar en Archivos.

## Desde la terminal

Útil para probar con un archivo sin abrir el navegador:

```bash
npm run transcribe -- "/ruta/al/audio.mp3" [--bpm 80] [--beats 4] [--sub 2] [--first 1] [--key -4] [--sensitivity 0.5]
```

Deja en `out/` el `.musicxml`, el `.mid` y un caché de la salida del modelo (las corridas siguientes con el mismo archivo son instantáneas). En Node el modelo corre sin GPU: tarda ~1,5 s por segundo de audio.

## Publicar

La app es un sitio estático y se publica en Cloudflare Pages: `https://sound-2-sheet.pages.dev`. Hace falta HTTPS para que el botón Grabar pueda usar el micrófono en el iPhone.

```bash
npx wrangler login   # solo la primera vez
npm run deploy       # buildea y sube dist/ a Cloudflare
```

El deploy es manual: hacer push a GitHub no cambia el sitio publicado.

## Tests

```bash
npm test             # lógica musical (Vitest)
npm run typecheck
npm run test:e2e     # app compilada en Chromium y en WebKit emulando un iPhone 13 (Playwright)
```

La primera vez, `npx playwright install chromium webkit`. Los tests de punta a punta usan un piano sintético generado en el momento. Para probar además con una grabación real (no se versiona):

```bash
SAMPLE_AUDIO="/ruta/al/audio.mp3" npm run test:e2e
```

## Estructura

```
src/
  main.ts                  pantalla y flujo
  audio/decode.ts          archivo → audio mono 22050 Hz
  transcription/basicPitch.ts   modelo → notas
  music/
    beats.ts               tempo y seguimiento del pulso
    quantize.ts            notas → grilla rítmica
    hands.ts               reparto entre manos
    key.ts                 tonalidad y nombres de notas
    musicxml.ts            partitura en MusicXML
    midi.ts                exportación MIDI
    tempoSuggestion.ts     sugiere el doble o el triple del tempo detectado
    score.ts               une todo lo anterior
  playback/
    samples.ts             muestras de piano y transporte
    pianoPlayer.ts         reproducción con Web Audio
  ui/playbackControls.ts   botón de reproducir y cursor sincronizado
  ui/installBanner.ts      aviso para instalar la app (Android, iPhone, Samsung)
  ui/installPlatform.ts    detecta el navegador para ese aviso
public/piano/              muestras de piano (Salamander Grand Piano, CC-BY 3.0, ver ATTRIBUTION.md)
public/icons/              íconos de la app (icon.svg es el original)
public/manifest.webmanifest   datos para instalarla como app
public/sw.js               service worker: la app sin internet
scripts/
  copy-model.mjs           copia el modelo de node_modules a public/model (corre en npm install)
  transcribe-file.ts       transcripción desde la terminal
e2e/                       tests de punta a punta
```

## Límites conocidos

- Pensado para **piano solo**. Con voz u otros instrumentos aparecen notas de más.
- No escribe tresillos, dinámicas, pedal ni digitación.
- Las notas que arrancan con menos de 80 ms de diferencia se escriben como un solo acorde (los arpegios rápidos se "aplastan").
- Cada mano se escribe en una sola voz: si una nota larga sigue sonando mientras la misma mano toca otras, se corta en el siguiente ataque.
- Grabaciones con eco o tomadas con el micrófono desde un parlante dan peores resultados que el archivo original.

## Créditos

- Transcripción: [Basic Pitch](https://github.com/spotify/basic-pitch-ts) (Spotify, Apache 2.0).
- Sonido de piano: Salamander Grand Piano V3, de Alexander Holm (CC-BY 3.0). Detalle en `public/piano/ATTRIBUTION.md`.

## Licencia

Código bajo licencia [MIT](LICENSE). Las muestras de piano mantienen su licencia CC-BY 3.0 (ver `public/piano/ATTRIBUTION.md`).

## Secretos y configuración

La app no usa variables de entorno, claves ni servicios externos. `.gitignore` igual excluye `.env*`, los audios (salvo las muestras de piano de `public/piano/`) y las salidas locales (`out/`, `test-results/`), y el modelo copiado (`public/model/`, se regenera con `npm install`).
