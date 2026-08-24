/**
 * Bench Narsil (Elysia/Node) vs Axum vs Next.js 16.3.2 in production (`next start`).
 * Usage: node bench/run.mjs
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signToken } from "./shared.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const NEXT = "http://127.0.0.1:3016";
const NARSIL = "http://127.0.0.1:3017";
const AXUM = "http://127.0.0.1:3018";
const N = 200;
const WARM = 30;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function start(cmd, args, cwd, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  child.stdout.on("data", (d) => process.stdout.write(`[${cmd}] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[${cmd} err] ${d}`));
  return child;
}

async function waitFor(url, tries = 240) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (res.status > 0) return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`timeout waiting for ${url}`);
}

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function fmt(ms) {
  return `${ms.toFixed(2)} ms`;
}

async function measure(label, fn) {
  for (let i = 0; i < WARM; i++) await fn();
  const times = [];
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  return { label, n: N, p50: pct(times, 50), p95: pct(times, 95), p99: pct(times, 99), mean };
}

async function getOk(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  await res.arrayBuffer();
}

async function postOk(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${url} POST -> ${res.status}`);
  await res.arrayBuffer();
}

const token = signToken();
const auth = { Authorization: `Bearer ${token}` };

const nextProc = start("npx", ["next", "start", "-H", "127.0.0.1", "-p", "3016"], join(here, "next16"));
const narsilProc = start("node", ["bench/narsil-server.mjs"], root, { PORT: "3017" });
const axumProc = start("cargo", ["run", "--release", "-p", "axum-bench"], root, {
  PORT: "3018",
  HOST: "127.0.0.1",
});

const kill = () => {
  nextProc.kill();
  narsilProc.kill();
  axumProc.kill();
};
process.on("exit", kill);
process.on("SIGINT", () => {
  kill();
  process.exit(1);
});

try {
  await waitFor(`${NEXT}/feed`);
  await waitFor(`${NARSIL}/api/users`);
  await waitFor(`${AXUM}/api/users`);

  const rows = [];
  rows.push(await measure("Next 16.3.2 GET /api/users + JWT", () => getOk(`${NEXT}/api/users`, auth)));
  rows.push(await measure("Narsil GET /api/users + JWT", () => getOk(`${NARSIL}/api/users`, auth)));
  rows.push(await measure("Axum GET /api/users + JWT", () => getOk(`${AXUM}/api/users`, auth)));
  rows.push(
    await measure("Next 16.3.2 POST /api/users + JWT", () =>
      postOk(`${NEXT}/api/users`, auth, JSON.stringify({ name: "Ada" })),
    ),
  );
  rows.push(
    await measure("Narsil POST /api/users + JWT", () =>
      postOk(`${NARSIL}/api/users`, auth, JSON.stringify({ name: "Ada" })),
    ),
  );
  rows.push(
    await measure("Axum POST /api/users + JWT", () =>
      postOk(`${AXUM}/api/users`, auth, JSON.stringify({ name: "Ada" })),
    ),
  );
  rows.push(await measure("Next 16.3.2 RSC /feed (db in-process)", () => getOk(`${NEXT}/feed`)));
  rows.push(await measure("Next 16.3.2 RSC /feed-via-api (Route Handler)", () => getOk(`${NEXT}/feed-via-api`)));

  const out = [
    "",
    "# bench vs Next.js 16.3.2 (production `next start`) + Narsil + Axum",
    "",
    `Node ${process.version} · ${N} pedidos após ${WARM} warmup · sequencial · 127.0.0.1`,
    "",
    "| cenário | p50 | p95 | p99 | média |",
    "|---------|-----|-----|-----|-------|",
    ...rows.map((r) => `| ${r.label} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.mean)} |`),
    "",
  ].join("\n");
  // smaug-ignore console-log: bench CLI prints the measured table
  process.stdout.write(out);
} finally {
  kill();
}
