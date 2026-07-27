import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const marker = "--viewer";
const markerIndex = process.argv.indexOf(marker);
const source = resolve(
  markerIndex === -1
    ? "../viewer-ts/dist"
    : (process.argv[markerIndex + 1] ?? ""),
);
const destination = resolve("viewer");

try {
  const info = await stat(`${source}/index.html`);
  if (!info.isFile()) throw new Error("index.html is not a file");
} catch (error) {
  throw new Error(
    `viewer source ${source} is not a built viewer: ${error.message}`,
  );
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`Staged viewer from ${source}`);
