# Changelog

## 1.0.0

Initial release.

- ESM module `@deepaash/mcp-deskvnc` exposing `serverManifest`,
  `toolReference`, `agentLoop`, `facts`, `mcpConfig`, `binaryLocations`,
  `defaultBinaryPath` and the frozen constants (`TOOLS`, `TOOL_REFERENCE`,
  `AGENT_LOOP`, `FACTS`, `ERROR_CODES`, `BINARY_LOCATIONS`).
- `dvv-mcp` CLI with subcommands `manifest`, `tools`, `loop`, `facts`,
  `config <client>`, `serve`, `version`.
- stdio MCP server (`dvv-mcp serve`) implementing `initialize`,
  `tools/list`, `tools/call`, `ping` and the `notifications/initialized`
  notification. `tools/call` is forwarded to the real `dvv` binary when it
  is on the host.
- Verified DeskVNC facts: 19 ms cycle (about 52 actions per second), 4 ms
  open, under 1 ms acquire, 25 ms screen at scale 0.25, 447 characters per
  second.
- Real error codes: `LIMB_GONE`, `SCREEN_CHANGED`, `LEASE_REVOKED`.
- Real binary locations for macOS, Windows and Linux.
- `server.json` at the repo root for the Model Context Protocol registry.
- Published to GitHub Packages as `@deepaash/mcp-deskvnc` (the scope is
  required by the GitHub Packages npm registry).
