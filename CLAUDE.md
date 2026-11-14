# sound-2-sheet

Web app que transcribe grabaciones de piano a partitura. Ver @README.md para el flujo y la estructura.

## Restricciones que no se negocian
- Todo corre en el navegador: nada de servidor, APIs externas, cuentas ni variables de entorno. El audio nunca sale del dispositivo. De ser necesario cambiar esto, consultarlo primero.
- Tiene que andar en Safari de iPhone (WebKit). Antes de usar cualquier API web nueva, revisar que exista en iOS 17.
- Las rutas a recursos son relativas (`base: './'`). Armar las URLs con `new URL('...', document.baseURI)`, nunca con `/` al principio.

## Código
- `src/music/` es lógica pura: sin DOM ni Web Audio, porque Vitest corre en entorno `node`. Todo cambio ahí lleva su `*.test.ts` al lado.
- Las versiones de las dependencias van exactas en `package.json`, sin `^`.
- `public/model/` se genera en `npm install` (scripts/copy-model.mjs): no se edita ni se versiona.
- No versionar audios de prueba (derechos de autor). La única excepción son las muestras de `public/piano/`.

## Verificar un cambio
1. `npm test` y `npm run typecheck`, siempre.
2. `npm run test:e2e` solo cuando el cambio pueda romperlos: si toca el flujo completo (subir o grabar audio → partitura → reproducir/exportar), el HTML o la carga del modelo y las muestras. Son muy lentos, así que si el cambio no afecta nada de eso, no se corren.
3. Para probar la transcripción con un archivo real: `npm run transcribe -- archivo.mp3`. Guarda en `out/` un caché de la salida del modelo, así que la segunda corrida es instantánea.

## Publicar
- `npm run deploy` buildea y sube `dist/` a Cloudflare Pages (`sound-2-sheet.pages.dev`). Publica en internet: no correrlo sin que lo pidan.

## Idioma
- La interfaz, los mensajes de error, los comentarios y el README van en español.
- Los mensajes de commit van en inglés, con Conventional Commits (`feat:`, `fix:`…).
