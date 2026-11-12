#!/usr/bin/env node
// Crea un evento nuevo a partir de plantilla-evento/.
//
// Uso:
//   node scripts/nuevo-evento.mjs <Carpeta-del-evento> "<Nombres>" [ruta-corta] [dominio]
// Ejemplo:
//   node scripts/nuevo-evento.mjs Ana-15-Dic-2026 "Ana" /ana https://birthday-memories-blond.vercel.app
//
// Luego: revisa eventos/<Carpeta>/evento.config.js (textos, colores) y despliega.
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, nombres, rutaCortaArg = '', dominio = 'https://birthday-memories-blond.vercel.app'] = process.argv.slice(2);

if (!id || !nombres) {
  console.error('Uso: node scripts/nuevo-evento.mjs <Carpeta-del-evento> "<Nombres>" [ruta-corta] [dominio]');
  process.exit(1);
}
if (!/^[A-Za-z0-9-]+$/.test(id)) {
  console.error('El nombre de la carpeta solo puede tener letras sin tildes, números y guiones. Ej: Ana-15-Dic-2026');
  process.exit(1);
}

const destino = join(raiz, 'eventos', id);
if (existsSync(destino)) {
  console.error(`Ya existe eventos/${id}`);
  process.exit(1);
}

const rutaCorta = rutaCortaArg ? `/${rutaCortaArg.replace(/^\/+/, '')}` : '';
cpSync(join(raiz, 'plantilla-evento'), destino, { recursive: true });

const reemplazos = {
  __EVENTO_ID__: id,
  __NOMBRES__: nombres,
  __RUTA_CORTA__: rutaCorta,
  __DOMINIO__: dominio.replace(/\/$/, ''),
};
for (const archivo of readdirSync(destino)) {
  if (!/\.(html|js)$/.test(archivo)) continue;
  const ruta = join(destino, archivo);
  let texto = readFileSync(ruta, 'utf8');
  for (const [k, v] of Object.entries(reemplazos)) {
    const valor = archivo.endsWith('.js') ? v.replace(/'/g, "\\'") : v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    texto = texto.replaceAll(k, valor);
  }
  writeFileSync(ruta, texto);
}

if (rutaCorta) {
  const rutaVercel = join(raiz, 'vercel.json');
  const vercel = JSON.parse(readFileSync(rutaVercel, 'utf8'));
  vercel.redirects ??= [];
  if (!vercel.redirects.some((r) => r.source === rutaCorta)) {
    vercel.redirects.push({ source: rutaCorta, destination: `/eventos/${id}/`, permanent: false });
    writeFileSync(rutaVercel, `${JSON.stringify(vercel, null, 2)}\n`);
  }
}

console.log(`✔ Evento creado en eventos/${id}`);
console.log(`  Invitados: ${dominio}${rutaCorta || `/eventos/${id}/`}`);
console.log(`  Pantalla:  ${dominio}/eventos/${id}/pantalla`);
console.log(`  Panel:     ${dominio}/eventos/${id}/admin`);
