import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CliIo, EXIT_FAILED, EXIT_OK, EXIT_USAGE, runCli } from "./cli";

const EXAMPLES_DIR = join(import.meta.dirname, "../../../examples");

/** Runs the CLI against in-memory files and captures what it prints. */
function cli(args: string[], files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    cwd: "/work",
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error("ENOENT");
      return content;
    },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    now: () => 0,
  };
  const code = runCli(args, io);
  return { code, stdout: out.join("\n"), stderr: err.join("\n") };
}

const example = (name: string) => readFileSync(join(EXAMPLES_DIR, name), "utf8");

describe("sim run", () => {
  it("simulates a design and prints a report", () => {
    const result = cli(["run", "two-servers.json", "--duration", "20"], {
      "/work/two-servers.json": example("two-servers.json"),
    });
    expect(result.code).toBe(EXIT_OK);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatchSnapshot();
  });

  it("reports rejections for an overloaded design", () => {
    const result = cli(["run", "overloaded.json", "--duration", "20"], {
      "/work/overloaded.json": example("one-server-overloaded.json"),
    });
    expect(result.code).toBe(EXIT_OK);
    expect(result.stdout).not.toMatch(/error rate 0\.00%/);
  });

  it("lists the validation problems and exits with 1", () => {
    const design = JSON.parse(example("two-servers.json"));
    design.nodes[2].cores = "four";
    design.nodes[3].queueCapacity = -1;
    const result = cli(["run", "bad.json"], { "/work/bad.json": JSON.stringify(design) });
    expect(result.code).toBe(EXIT_FAILED);
    expect(result.stderr).toContain("bad.json is not a valid design:");
    expect(result.stderr).toContain("nodes[2].cores");
    expect(result.stderr).toContain("nodes[3].queueCapacity");
  });

  it("reports graph problems once every field is valid", () => {
    const design = JSON.parse(example("two-servers.json"));
    design.edges.push({ from: "lb", to: "ghost" });
    const result = cli(["run", "bad.json"], { "/work/bad.json": JSON.stringify(design) });
    expect(result.code).toBe(EXIT_FAILED);
    expect(result.stderr).toContain('Unknown node "ghost"');
  });

  it("exits with 1 for a missing file or invalid JSON", () => {
    expect(cli(["run", "missing.json"]).code).toBe(EXIT_FAILED);
    const broken = cli(["run", "broken.json"], { "/work/broken.json": "{ not json" });
    expect(broken.code).toBe(EXIT_FAILED);
    expect(broken.stderr).toMatch(/not valid JSON/);
  });

  it("exits with 2 and shows usage for invalid arguments", () => {
    for (const args of [
      [],
      ["walk", "x.json"],
      ["run"],
      ["run", "x.json", "--unknown"],
      ["run", "x.json", "--duration", "abc"],
      ["run", "x.json", "--duration", "10", "--warmup", "10"],
      ["run", "x.json", "--seed", "1.5"],
    ]) {
      const result = cli(args);
      expect(result.code, args.join(" ")).toBe(EXIT_USAGE);
      expect(result.stderr).toContain("Usage: sim run");
    }
  });

  it("prints help", () => {
    const result = cli(["--help"]);
    expect(result.code).toBe(EXIT_OK);
    expect(result.stdout).toContain("Usage: sim run");
  });
});

describe("examples/", () => {
  const files = readdirSync(EXAMPLES_DIR).filter((name) => name.endsWith(".json"));

  it("has example designs", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`${name} is a valid design that runs`, () => {
      const result = cli(["run", name, "--duration", "5", "--warmup", "1"], {
        [`/work/${name}`]: example(name),
      });
      expect(result.stderr).toBe("");
      expect(result.code).toBe(EXIT_OK);
    });
  }
});
