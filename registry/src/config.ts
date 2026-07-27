import type { ErrorObject } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import schema from "../schema/khb-registry.schema.json";
import type { RegistryConfig } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile<RegistryConfig>(schema);

function describeError(error: ErrorObject): string {
  const path = error.instancePath || "/";
  if (error.keyword === "additionalProperties") {
    const property = (error.params as { additionalProperty: string })
      .additionalProperty;
    return `${path}: unknown property ${JSON.stringify(property)}`;
  }
  return `${path}: ${error.message ?? "invalid value"}`;
}

/** Validate an already-parsed registry configuration. */
export function validateRegistryConfig(value: unknown): RegistryConfig {
  if (validate(value)) return value;
  const details = (validate.errors ?? []).map(describeError).join("\n");
  throw new Error(`invalid registry configuration:\n${details}`);
}

/** Parse and validate a khb-registry.yml file. */
export async function readRegistryConfig(
  filename: string,
): Promise<RegistryConfig> {
  let parsed: unknown;
  try {
    parsed = parse(await readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(
      `could not read ${filename}: ${(error as Error).message}`,
    );
  }
  return validateRegistryConfig(parsed);
}
