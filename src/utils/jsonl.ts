import fs from 'node:fs';
import path from 'node:path';

/** Agrega un registro a un archivo JSON Lines (cada worker escribe su propio archivo). */
export function appendJsonLine(file: string, record: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

/** Lee todos los registros de los archivos `<prefix>*.jsonl` de una carpeta. */
export function readJsonLines<T>(directory: string, prefix: string): T[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((file) => file.startsWith(prefix) && file.endsWith('.jsonl'))
    .flatMap((file) => fs.readFileSync(path.join(directory, file), 'utf8').split('\n'))
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}
