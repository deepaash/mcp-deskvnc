# mcp-deskvnc

DeskVNC MCP discovery and configuration for AI agents.

`mcp-deskvnc` is the installable discovery surface for the DeskVNC `dvv` MCP
server. It carries the full tool manifest, the observe-then-act loop, the
verified DeskVNC facts, and paste-ready configuration blocks for every common
MCP client. The `dvv` binary itself ships inside the DeskVNC application, and
this package is the bridge that wires the DeskVNC MCP server into any agent
runtime that knows how to read a package by name.

## What this is

- A Node ESM package with zero runtime dependencies.
- A `dvv-mcp` CLI for inspecting the manifest and printing config blocks.
- A stdio MCP server (`dvv-mcp serve`) that answers `initialize` and
  `tools/list` directly and proxies `tools/call` through `dvv` when it is on
  the host.
- A programmatic API for embedding DeskVNC discovery into agent runtimes.

## What this is not

- It is not the `dvv` binary. The `dvv` MCP server is installed by the
  DeskVNC app and lives at the documented platform paths below. The
  `mcp-deskvnc` package is the discovery layer that names `dvv`, lists its
  tools, and configures the wire.

## Install

```sh
npm install -g mcp-deskvnc
```

That places the `dvv-mcp` command on the path.

## Quick start for an MCP client

Pick your client and print a paste-ready config block:

```sh
dvv-mcp config claude-desktop
dvv-mcp config claude-code
dvv-mcp config cursor
dvv-mcp config codex
dvv-mcp config windsurf
dvv-mcp config generic
```

Each command prints an object you can drop into the matching MCP client
config file. The default command path is the documented `dvv` location for
the current platform. Override with `--binary`:

```sh
dvv-mcp config claude-code --binary /opt/deskvnc/dvv
```

After saving the config, your client will load the DeskVNC MCP server at
startup and your agent will see every `dvv_*` tool.

## The observe-then-act loop

Drive one machine end to end with the four-call pattern: open, acquire the
lease, read the screen, click. Every call uses the real argument names from
the `dvv` server.

```jsonc
dvv_hosts   {}
dvv_open    {"hostId": "<id>", "perceive": true}
dvv_control {"limbId": "<limbId>", "action": "acquire"}
dvv_screen  {"limbId": "<limbId>", "form": "full", "scale": 0.25}
dvv_click   {"limbId": "<limbId>", "x": 700, "y": 400, "generation": 1}
dvv_screen  {"limbId": "<limbId>", "form": "damage-crop"}
dvv_type    {"limbId": "<limbId>", "text": "notepad", "wpm": 3000}
dvv_key     {"limbId": "<limbId>", "keys": "meta+r"}
```

`dvv-mcp loop` prints the same loop as a JSON array you can paste into a
script.

## The verified numbers

All numbers below are taken from the project README, measured on a real
1920x1080 Windows desktop over LAN with `dvv_open`, `dvv_click`, `dvv_screen`
and `dvv_type`.

| Operation                       | Result                    |
| ------------------------------- | ------------------------- |
| observe-then-act cycle          | 19 ms (about 52 actions/s)|
| `dvv_open` and attach           | 4 ms                      |
| `dvv_control` acquire           | under 1 ms                |
| `dvv_screen` at scale 0.25      | 25 ms                     |
| `dvv_type` throughput           | 447 characters per second |

Run `dvv-mcp facts` to print the same table from the package.

## The generation fence

`dvv_screen` returns an `imageSpace` line and a `generation` for the picture
it just read. A `dvv_click` carries that `generation` along with its `x` and
`y`. A click computed against a stale screen is refused rather than landing
in the wrong place. `dvv_type` and `dvv_key` are also refused until the
screen has been read since it last changed significantly.

This is a safety feature. The fence keeps the agent from acting on a picture
that no longer matches the desktop in front of the person, and it keeps
typed input from racing the layout. The agent treats `SCREEN_CHANGED` as
"read again, then retry" and proceeds.

## Real error codes

The codes an agent should handle, taken from the `dvv` server:

| Code             | What it means                                              |
| ---------------- | ---------------------------------------------------------- |
| `LIMB_GONE`      | The limb has closed. List limbs and reopen the machine.    |
| `SCREEN_CHANGED` | The screen changed under you. Read it again, then retry.   |
| `LEASE_REVOKED`  | A person or another holder revoked the lease. Re-acquire.  |

## Where `dvv` lives

| Platform | Path                                                                  |
| -------- | --------------------------------------------------------------------- |
| macOS    | `/Applications/DeskVNCViewer.app/Contents/MacOS/dvv`                  |
| Windows  | `%LOCALAPPDATA%\DeskVNCViewer\dvv.exe` or `C:\Program Files\DeskVNCViewer\dvv.exe` |
| Linux    | `/usr/bin/dvv`                                                        |

Run `dvv-mcp binaryLocations` from Node for the same list as an object.

## Programmatic API

```js
import {
  serverManifest,
  toolReference,
  agentLoop,
  facts,
  mcpConfig,
  binaryLocations,
} from "mcp-deskvnc";

serverManifest();   // MCP server manifest with the full tool list
toolReference();    // every dvv tool and what it does
agentLoop();        // ordered observe-then-act calls
facts();            // the verified numbers
mcpConfig({ client: "claude-code" });
binaryLocations();  // real paths per platform
```

## Running the stdio server

```sh
dvv-mcp serve
```

Reads JSON-RPC over stdin and writes responses to stdout. `initialize` and
`tools/list` are answered from the in-package manifest. `tools/call` is
forwarded to the real `dvv` binary if it is on the host, or answered with a
clear error if not. Pipe a request:

```sh
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
  | dvv-mcp serve
```

## Other commands

```sh
dvv-mcp manifest
dvv-mcp tools
dvv-mcp loop
dvv-mcp facts
dvv-mcp config <client> [--binary <path>]
dvv-mcp serve [--binary <path>]
dvv-mcp version
```

## Links

- Project: <https://github.com/psmux/DeskVNC>
- Hub: <https://deskvnc-hub.pages.dev/>
- Hosted MCP endpoint: <https://deskvnc-mcp.deepika-aaish.workers.dev/mcp>
- This package: <https://github.com/deepaash/mcp-deskvnc>
- jsDelivr CDN: <https://cdn.jsdelivr.net/gh/deepaash/mcp-deskvnc@main/>

## License

MIT.
