#!/usr/bin/env node

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistryConfig } from "./config";

interface CliOptions {
  command: "validate" | "prepare";
  config: string;
  out: string;
  viewer?: string;
}

function usage(): never {
  console.error(`Usage:
  khb-cf-registry validate [khb-registry.yml]
  khb-cf-registry prepare [khb-registry.yml] [--out DIR] [--viewer DIR]`);
  process.exit(2);
}

function takeValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage();
  args.splice(index, 2);
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const command = args.shift();
  if (command !== "validate" && command !== "prepare") usage();
  const out = takeValue(args, "--out") ?? ".khb-registry";
  const viewer = takeValue(args, "--viewer");
  if (args.some((arg) => arg.startsWith("--"))) usage();
  const config = args.shift() ?? "khb-registry.yml";
  if (args.length) usage();
  return { command, config, out, viewer };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const configPath = resolve(options.config);
  const config = await readRegistryConfig(configPath);
  if (options.command === "validate") {
    console.log(`Valid registry configuration: ${configPath}`);
    return;
  }

  const out = resolve(options.out);
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const viewer = resolve(options.viewer ?? `${packageRoot}/viewer`);
  const publicDir = `${out}/public`;
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  try {
    await cp(viewer, publicDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `could not copy the packaged viewer from ${viewer}: ${(error as Error).message}`,
    );
  }
  await writeFile(`${out}/config.json`, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Prepared registry assets in ${out}`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
