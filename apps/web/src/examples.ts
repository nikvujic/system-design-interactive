import { type Design, parseDesign } from "@sdi/schema";
import twoServersJson from "../../../examples/two-servers.json";

function load(name: string, json: unknown): Design {
  const parsed = parseDesign(json);
  if (!parsed.ok) throw new Error(`examples/${name} is invalid:\n${parsed.errors.join("\n")}`);
  return parsed.design;
}

/** The example designs bundled with the app, validated when the app loads. */
export const twoServers = load("two-servers.json", twoServersJson);
