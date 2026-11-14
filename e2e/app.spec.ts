import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, test } from '@playwright/test';
import { carolMotif, cMajorExercise, hedwigMotif } from './synthPiano';

test('transcribe un piano sintético y muestra la partitura', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'ejercicio.wav', mimeType: 'audio/wav', buffer: cMajorExercise() });

  await expect(page.locator('#summary')).toContainText('Do mayor', { timeout: 120_000 });
  await expect(page.locator('#summary')).toContainText('compases');
  await expect(page.locator('#score svg')).toBeVisible();
  expect(await page.locator('#score svg path').count()).toBeGreaterThan(50);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-xml').click()]);
  expect(download.suggestedFilename()).toBe('ejercicio.musicxml');

  // Cambiar el compás rearma la partitura sin volver a procesar el audio.
  await page.locator('#beats').selectOption('3');
  await expect(page.locator('#first-beat option')).toHaveCount(3);
  await expect(page.locator('#score svg')).toBeVisible();

  expect(errors).toEqual([]);
});

test('reproduce la partitura con el cursor siguiendo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const samples: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/piano/')) samples.push(response.status());
  });

  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'ejercicio.wav', mimeType: 'audio/wav', buffer: cMajorExercise() });
  await expect(page.locator('#summary')).toContainText('compases', { timeout: 120_000 });
  await expect(page.locator('#play-time')).toHaveText(/^0:00 \/ 0:\d\d$/);

  const play = page.locator('#play');
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Pausa');
  expect(samples).toHaveLength(30);
  expect(samples.every((status) => status === 200)).toBe(true);

  // El cursor aparece y el tiempo avanza.
  const cursor = page.locator('#score img[id^="cursorImg"]').first();
  await expect(cursor).toBeVisible();
  const startX = await cursor.evaluate((img) => img.getBoundingClientRect().x);
  await expect(page.locator('#play-time')).toHaveText(/^0:0[2-9] \//, { timeout: 10_000 });
  const laterX = await cursor.evaluate((img) => img.getBoundingClientRect().x);
  expect(laterX).not.toBe(startX);

  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Reproducir');
  const pausedAt = await page.locator('#play-time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#play-time')).toHaveText(pausedAt ?? '');

  // Cambiar una opción frena, rearma la partitura y vuelve al inicio.
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Pausa');
  await page.locator('#sensitivity').fill('0.9');
  await expect(play).toHaveAttribute('aria-label', 'Reproducir');
  await expect(page.locator('#play-time')).toHaveText(/^0:00 \//);

  expect(errors).toEqual([]);
});

test('sugiere duplicar el tempo y deja volver atrás', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'carol.wav', mimeType: 'audio/wav', buffer: carolMotif() });
  await expect(page.locator('#summary')).toContainText('compases', { timeout: 120_000 });

  const hint = page.locator('#tempo-hint');
  const action = page.locator('#tempo-hint-action');
  await expect(hint).toBeVisible();
  await expect(action).toHaveText(/^Probar ♩ = 15\d$/);
  const suggested = (await action.textContent())!.replace(/\D/g, '');
  await page.screenshot({ path: `test-results/tempo-hint-${test.info().project.name}.png` });

  // Aplicar: el tempo queda escrito y el aviso ofrece volver.
  await action.click();
  await expect(page.locator('#bpm')).toHaveValue(suggested);
  await expect(page.locator('#summary')).toContainText(`♩ = ${suggested}`);
  await expect(action).toHaveText(/^Volver a ♩ = 7\d$/);
  await expect(page.locator('#tempo-hint-text')).toContainText('3/4');
  await page.screenshot({ path: `test-results/tempo-hint-applied-${test.info().project.name}.png` });

  // Volver: el tempo vuelve a automático y la sugerencia reaparece.
  await action.click();
  await expect(page.locator('#bpm')).toHaveValue('');
  await expect(action).toHaveText(/^Probar ♩ = /);

  // Si se escribe un tempo a mano, el aviso desaparece.
  await page.locator('#bpm').fill('100');
  await expect(hint).toBeHidden();

  expect(errors).toEqual([]);
});

test('sugiere el triple en 3/4 y al volver restaura tempo y compás', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'hedwig.wav', mimeType: 'audio/wav', buffer: hedwigMotif() });
  await expect(page.locator('#summary')).toContainText('compases', { timeout: 120_000 });

  const action = page.locator('#tempo-hint-action');
  await expect(action).toHaveText(/^Probar ♩ = 1[67]\d en 3\/4$/);
  await action.click();
  await expect(page.locator('#beats')).toHaveValue('3');
  await expect(page.locator('#first-beat')).toHaveValue('3');
  await expect(page.locator('#summary')).toContainText(/♩ = 1[67]\d/);
  await expect(action).toHaveText(/^Volver a ♩ = 5\d en 4\/4$/);
  await page.screenshot({ path: `test-results/tempo-hint-triple-${test.info().project.name}.png` });

  await action.click();
  await expect(page.locator('#bpm')).toHaveValue('');
  await expect(page.locator('#beats')).toHaveValue('4');
  await expect(page.locator('#first-beat')).toHaveValue('1');
  await expect(action).toHaveText(/^Probar ♩ = /);

  expect(errors).toEqual([]);
});

test('avisa si el archivo no es audio', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'nota.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('esto no es audio') });
  await expect(page.locator('#error')).toContainText('No pude leer ese archivo');
  await expect(page.locator('label[for="file"]')).toHaveAttribute('aria-disabled', 'false');
});

// Prueba opcional con una grabación real (no se versiona): SAMPLE_AUDIO="/ruta/al/audio.mp3" npm run test:e2e
const sample = process.env.SAMPLE_AUDIO;
test('transcribe una grabación real', async ({ page }) => {
  test.skip(!sample, 'Definí SAMPLE_AUDIO para correr esta prueba');
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: basename(sample!), mimeType: 'audio/mpeg', buffer: readFileSync(sample!) });
  await expect(page.locator('#summary')).toContainText('compases', { timeout: 9 * 60_000 });
  await expect(page.locator('#score svg')).toBeVisible();
  await page.screenshot({ path: `test-results/real-${test.info().project.name}.png`, fullPage: true });
});
