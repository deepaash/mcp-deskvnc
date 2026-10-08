#!/usr/bin/env node
// dvv-mcp CLI
// Carries the DeskVNC MCP discovery surface: manifest, tool list, observe-then-act
// loop, verified facts, paste-ready client configs, and a stdio MCP server.
//
// The dvv binary itself ships inside the DeskVNC app. When dvv is available
// on the host, the `serve` subcommand proxies tools/call through it. When it
// is not, the server still answers initialize and tools/list, and returns a
// clear JSON-RPC error for tools/call.

import {
  serverManifest,
  toolReference,
  agentLoop,
  facts,
  binaryLocations,
  defaultBinaryPath,
  mcpConfig,
  VERSION,
} from "../src/index.js";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);

const USAGE = `dvv-mcp ${VERSION}

Usage:
  dvv-mcp manifest
  dvv-mcp tools
  dvv-mcp loop
  dvv-mcp facts
  dvv-mcp config <client> [--binary <path>]
  dvv-mcp serve [--binary <path>]

Clients supported by 'config':
  claude-desktop, claude-code, cursor, codex, windsurf, generic
`;

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function cmdManifest() {
  printJson(serverManifest());
}

function cmdTools() {
  const rows = toolReference();
  for (const row of rows) {
    process.stdout.write(`${row.name}\n  ${row.what}\n\n`);
  }
}

function cmdLoop() {
  const steps = agentLoop();
  printJson(steps);
}

function cmdFacts() {
  const f = facts();
  const binary = defaultBinaryPath();
  process.stdout.write("Verified DeskVNC dvv benchmarks (1920x1080 Windows desktop, LAN)\n\n");
  process.stdout.write(`  observe-then-act cycle:  ${f.cycleMs} ms  (about ${f.actionsPerSecond} actions per second)\n`);
  process.stdout.write(`  dvv_open and attach:     ${f.openMs} ms\n`);
  process.stdout.write(`  dvv_control acquire:     under ${f.acquireMs} ms\n`);
  process.stdout.write(`  dvv_screen @ 0.25:       ${f.screenAtScaleQuarterMs} ms\n`);
  process.stdout.write(`  dvv_type throughput:     ${f.typeCharsPerSecond} characters per second\n\n`);
  process.stdout.write(`  notes: ${f.notes}\n\n`);
  process.stdout.write(`  dvv binary (this host):  ${binary}\n`);
}

function parseArgs(argv) {
  const out = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function cmdConfig(positional, flags) {
  const client = positional[0] || "generic";
  const binaryPath = flags.binary || defaultBinaryPath();
  const cfg = mcpConfig({ client, binaryPath });
  printJson(cfg);
}

// --- stdio MCP server ---------------------------------------------------

function makeRpcId() {
  return Math.random().toString(36).slice(2, 10);
}

function rpcOk(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: "2.0", id, error: err };
}

// JSON-RPC error codes used by the dvv-mcp server.
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;
const ERR_DVV_UNAVAILABLE = -32010;

function writeMessage(message) {
  const body = JSON.stringify(message);
  process.stdout.write(body + "\n");
}

// Read line-delimited JSON-RPC from stdin.
function readLines(onLine) {
  let buf = "";
  const decoder = new (await_import_text_decoder())();
  process.stdin.on("data", (chunk) => {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.length > 0) onLine(line);
    }
  });
  process.stdin.on("end", () => {
    const tail = decoder.decode();
    if (tail.trim().length > 0) onLine(tail.trim());
  });
}

function await_import_text_decoder() {
  // Avoid top-level await for older runtimes; use the built-in TextDecoder.
  return class {
    decode(chunk, opts) {
      return new TextDecoder().decode(chunk, opts);
    }
  };
}

function handleRequest(req, ctx) {
  const id = req.id !== undefined ? req.id : null;
  const method = req.method;
  const params = req.params || {};

  if (method === "initialize") {
    const manifest = serverManifest();
    return rpcOk(id, {
      protocolVersion: manifest.protocolVersion,
      serverInfo: {
        name: manifest.name,
        version: manifest.version,
        vendor: manifest.vendor,
      },
      capabilities: manifest.capabilities,
    });
  }

  if (method === "notifications/initialized") {
    // Notification, no response.
    return null;
  }

  if (method === "tools/list") {
    const manifest = serverManifest();
    return rpcOk(id, { tools: manifest.tools });
  }

  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments || {};
    if (typeof name !== "string" || name.length === 0) {
      return rpcError(id, ERR_INVALID_PARAMS, "tools/call requires params.name");
    }
    if (!ctx.dvvAvailable) {
      return rpcError(id, ERR_DVV_UNAVAILABLE, "dvv binary not found", {
        binaryPath: ctx.binaryPath,
        hint: "Install DeskVNC so dvv is on the host, then start dvv-mcp again.",
      });
    }
    return proxyDvvCall(id, name, args, ctx);
  }

  if (method === "ping") {
    return rpcOk(id, {});
  }

  return rpcError(id, ERR_METHOD_NOT_FOUND, `Method not found: ${method}`);
}

function proxyDvvCall(id, name, args, ctx) {
  // We delegate the real call to dvv by passing the call as JSON over stdin
  // and reading the JSON response. The dvv binary speaks MCP, so the simplest
  // path is to spawn it as an MCP server and forward a single tools/call.
  return new Promise((resolve) => {
    const child = spawnDvv(ctx.binaryPath);
    if (!child) {
      resolve(
        rpcError(id, ERR_DVV_UNAVAILABLE, "failed to spawn dvv", {
          binaryPath: ctx.binaryPath,
        })
      );
      return;
    }
    let buf = "";
    const decoder = new TextDecoder();
    let responded = false;
    const requestId = makeRpcId();
    const request = {
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name, arguments: args },
    };
    child.stdin.write(JSON.stringify(request) + "\n");
    child.stdin.end();
    child.stdout.on("data", (chunk) => {
      buf += decoder.decode(chunk, { stream: true });
      const idx = buf.indexOf("\n");
      if (idx >= 0 && !responded) {
        responded = true;
        const line = buf.slice(0, idx).trim();
        try {
          const parsed = JSON.parse(line);
          resolve(parsed);
        } catch (err) {
          resolve(
            rpcError(id, ERR_INTERNAL, "dvv returned invalid JSON", {
              raw: line,
            })
          );
        }
        child.kill();
      }
    });
    child.on("error", () => {
      if (!responded) {
        responded = true;
        resolve(
          rpcError(id, ERR_DVV_UNAVAILABLE, "dvv could not be started", {
            binaryPath: ctx.binaryPath,
          })
        );
      }
    });
    child.on("close", () => {
      if (!responded) {
        responded = true;
        resolve(
          rpcError(id, ERR_INTERNAL, "dvv closed without responding", {
            binaryPath: ctx.binaryPath,
          })
        );
      }
    });
  });
}

function spawnDvv(binaryPath) {
  try {
    return spawn(binaryPath, ["mcp"], { stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

function findDvv(explicit) {
  if (explicit) return explicit;
  const locations = binaryLocations();
  const fs = require("node:fs");
  for (const p of locations[process.platform] || []) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      // not here, keep looking
    }
  }
  return null;
}

async function cmdServe(flags) {
  const explicit = flags.binary;
  const binaryPath = findDvv(explicit);
  const ctx = {
    binaryPath: binaryPath || explicit || defaultBinaryPath(),
    dvvAvailable: binaryPath !== null,
  };

  process.stderr.write(
    `dvv-mcp ${VERSION} (stdio MCP server, discovery layer)\n`
  );
  if (!ctx.dvvAvailable) {
    process.stderr.write(
      `dvv binary not found on this host. initialize and tools/list will work, tools/call will return a clear error.\n`
    );
    process.stderr.write(
      `expected one of: ${binaryLocations()[process.platform].join(", ")}\n`
    );
  } else {
    process.stderr.write(`dvv found at ${ctx.binaryPath}\n`);
  }

  readLines(async (line) => {
    let req;
    try {
      req = JSON.parse(line);
    } catch (err) {
      writeMessage(rpcError(null, -32700, "Parse error", { raw: line }));
      return;
    }
    const response = await handleRequest(req, ctx);
    if (response !== null) writeMessage(response);
  });
}

// --- entry --------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(USAGE);
    return;
  }

  const parsed = parseArgs(argv);
  const [subcommand, ...rest] = parsed.positional;

  switch (subcommand) {
    case "manifest":
      return cmdManifest();
    case "tools":
      return cmdTools();
    case "loop":
      return cmdLoop();
    case "facts":
      return cmdFacts();
    case "config":
      return cmdConfig(rest, parsed.flags);
    case "serve":
      return cmdServe(parsed.flags);
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return;
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n\n`);
      process.stderr.write(USAGE);
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`dvv-mcp: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
