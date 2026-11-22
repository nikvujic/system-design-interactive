import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { runCli } from "./cli";

// When run through `pnpm sim` from the repository root, pnpm changes the working directory to
// this package; INIT_CWD is the directory the command was typed in, so paths resolve from there.
process.exitCode = runCli(process.argv.slice(2), {
  cwd: process.env.INIT_CWD ?? process.cwd(),
  readFile: (path) => readFileSync(path, "utf8"),
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
  now: () => performance.now(),
});
