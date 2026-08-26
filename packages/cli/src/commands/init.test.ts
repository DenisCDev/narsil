import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseInitArgs } from "./init.js";
import { scaffoldAxum } from "./scaffold-axum.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("parseInitArgs", () => {
  it("defaults to typescript", () => {
    expect(parseInitArgs([])).toEqual({ runtime: "typescript", help: false });
  });

  it("keeps bun and elysia as typescript aliases", () => {
    expect(parseInitArgs(["--runtime", "bun"]).runtime).toBe("typescript");
    expect(parseInitArgs(["--runtime", "elysia"]).runtime).toBe("typescript");
  });

  it("selects axum", () => {
    expect(parseInitArgs(["--runtime", "axum"])).toEqual({ runtime: "axum", help: false });
  });

  it("accepts rust as an axum alias", () => {
    expect(parseInitArgs(["--runtime=rust"]).runtime).toBe("axum");
  });

  it("rejects an unknown runtime", () => {
    expect(() => parseInitArgs(["--runtime", "fastapi"])).toThrow(/typescript \(default\) or axum/);
  });

  it("rejects a missing runtime value", () => {
    expect(() => parseInitArgs(["--runtime"])).toThrow(/Missing value/);
  });
});

describe("scaffoldAxum", () => {
  it("writes a Cargo backend that depends on narsil-axum, not drizzle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "narsil-axum-"));
    dirs.push(dir);
    await scaffoldAxum(dir);

    const cargo = readFileSync(join(dir, "backend", "Cargo.toml"), "utf8");
    expect(cargo).toContain("narsil-axum");
    expect(cargo).toContain('path = "crates/narsil-axum"');

    const main = readFileSync(join(dir, "backend", "src", "main.rs"), "utf8");
    expect(main).toContain("App::postgres");
    expect(main).toContain("SUPABASE_JWT_SECRET");

    const crate = readFileSync(join(dir, "backend", "crates", "narsil-axum", "Cargo.toml"), "utf8");
    expect(crate).toContain('name = "narsil-axum"');
    expect(crate).toContain("axum");

    const contract = readFileSync(join(dir, "backend", "narsil-contract.ts"), "utf8");
    expect(contract).toContain("export type AppType");

    expect(() => readFileSync(join(dir, "backend", "drizzle.config.ts"))).toThrow();
  });
});
