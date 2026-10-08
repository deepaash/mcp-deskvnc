// mcp-deskvnc
// Carries the DeskVNC MCP server manifest, the observe-then-act loop,
// the verified DeskVNC facts, and paste-ready MCP client configurations.
//
// The dvv binary itself ships inside the DeskVNC application. This package
// is the discovery and configuration surface that lets an agent runtime
// find and wire DeskVNC into its tool set.
//
// No runtime dependencies. The Node standard library is enough.

const VERSION = "1.0.1";
const PACKAGE_NAME = "@deepaash/mcp-deskvnc";
const SERVER_NAME = "deskvnc-dvv";
const SERVER_VERSION = "0.27.11";
const PROTOCOL_VERSION = "2024-11-05";

const REPO_URL = "https://github.com/psmux/DeskVNC";
const HUB_URL = "https://deskvnc-hub.pages.dev/";
const HOSTED_ENDPOINT = "https://deskvnc-mcp.deepika-aaish.workers.dev/mcp";

// Real binary locations. The dvv binary ships inside the DeskVNC app.
const BINARY_LOCATIONS = Object.freeze({
  darwin: ["/Applications/DeskVNCViewer.app/Contents/MacOS/dvv"],
  win32: [
    "%LOCALAPPDATA%\\DeskVNCViewer\\dvv.exe",
    "C:\\Program Files\\DeskVNCViewer\\dvv.exe",
  ],
  linux: ["/usr/bin/dvv"],
});

// Tool definitions. Names, arguments, and codes match the project exactly.
const TOOLS = Object.freeze([
  {
    name: "dvv_hosts",
    description:
      "List saved machines from the DeskVNC host library. Returns hostId, name, protocol (vnc/rdp/ssh) and address for each entry.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "dvv_limbs",
    description:
      "List currently open limbs (live connections) with their lease state. Each machine a session owns is one limb.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "dvv_open",
    description:
      "Open a saved host and, when perceive is true, capture an initial screen so the agent has a fresh generation to act against.",
    inputSchema: {
      type: "object",
      properties: {
        hostId: { type: "string", description: "Identifier from dvv_hosts" },
        perceive: {
          type: "boolean",
          default: true,
          description: "Capture the first screen at open time",
        },
      },
      required: ["hostId"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_wait",
    description:
      "Block until a limb reaches a named state, such as 'connected' or 'screen-stable'.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        until: {
          type: "string",
          enum: ["connected", "screen-stable"],
        },
        timeoutMs: { type: "number" },
      },
      required: ["limbId", "until"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_control",
    description:
      "Manage a limb lease. Use action 'acquire' to take control for the agent, 'release' to hand it back, and 'steal' to take it from another holder.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        action: {
          type: "string",
          enum: ["acquire", "release", "steal"],
        },
      },
      required: ["limbId", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_screen",
    description:
      "Read the screen. The response carries an imageSpace marker and a generation that subsequent input must reference.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        form: {
          type: "string",
          enum: ["full", "damage-crop"],
          default: "full",
        },
        scale: { type: "number", default: 0.25, minimum: 0.1, maximum: 1 },
      },
      required: ["limbId"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_click",
    description:
      "Click at a screen coordinate. The generation must match the screen the coordinates were read from.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        button: { type: "string", enum: ["left", "right", "middle"] },
        action: {
          type: "string",
          enum: ["click", "double", "down", "up"],
          default: "click",
        },
        generation: { type: "integer", minimum: 0 },
      },
      required: ["limbId", "x", "y", "generation"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_type",
    description:
      "Type a string at full keyboard speed. Refused until the screen has been read since it last changed significantly.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        text: { type: "string" },
        wpm: { type: "number", default: 3000 },
      },
      required: ["limbId", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_key",
    description:
      "Press a named key chord such as 'meta+r' or 'ctrl+shift+esc'.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        keys: { type: "string" },
      },
      required: ["limbId", "keys"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_reconnect",
    description: "Reattach to a limb after a drop.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
      },
      required: ["limbId"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_close",
    description: "Close a limb and release the lease.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
      },
      required: ["limbId"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_files",
    description:
      "Browse or transfer files over the SFTP channel of an SSH limb, or over the file channel of an RDP limb.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        action: { type: "string", enum: ["list", "get", "put"] },
        path: { type: "string" },
        destination: { type: "string" },
      },
      required: ["limbId", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_clipboard",
    description:
      "Read or write the remote clipboard. Use 'set' to push text, 'get' to pull it.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        action: { type: "string", enum: ["get", "set"] },
        text: { type: "string" },
      },
      required: ["limbId", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_term_read",
    description:
      "Read buffered output from an SSH terminal limb. Returns text and a cursor offset.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        since: { type: "integer" },
        maxBytes: { type: "integer" },
      },
      required: ["limbId"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_term_send",
    description:
      "Send a line to an SSH terminal limb, terminated with a chosen line ending.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        text: { type: "string" },
        ending: { type: "string", enum: ["lf", "crlf", "cr"] },
      },
      required: ["limbId", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_run",
    description:
      "Open a fresh shell on an SSH limb, run a command, capture stdout, stderr and exit code.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        command: { type: "string" },
        timeoutMs: { type: "integer" },
      },
      required: ["limbId", "command"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_group_open",
    description:
      "Opens several limbs at once and returns a groupId to address them together with dvv_group_run, or one at a time with any tool's groupId and member. Every member is a real connection that stays open until dvv_group_close, so prefer the smallest group the task needs. If any member fails to open, the ones this call opened are closed again, so a retry is not fighting a half open group.",
    inputSchema: {
      type: "object",
      properties: {
        hostIds: { type: "array", items: { type: "string" } },
        addresses: { type: "array", items: { type: "string" } },
        protocol: { type: "string", enum: ["vnc", "rdp", "ssh"] },
        perceive: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "dvv_group_list",
    description:
      "Open groups, or one group's members with their index, limbId, host and state. Cheap and local: reads this server's own registry, no round trip to any machine.",
    inputSchema: {
      type: "object",
      properties: { groupId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "dvv_group_run",
    description:
      "Runs one action on every member of a group at once, concurrently and not in a loop: every member starts before any finishes. One member failing is reported for that member alone and never stops the others. Action is wait, screen, status, signals, type, key, click or run. This is the tool to reach for when driving more than one machine.",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        action: { type: "string", enum: ["wait", "screen", "status", "signals", "type", "key", "click", "run"] },
        arguments: { type: "object" },
      },
      required: ["groupId", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_group_grow",
    description:
      "Opens more limbs and appends them to a group. New members get the next index; existing members are untouched.",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        hostIds: { type: "array", items: { type: "string" } },
        addresses: { type: "array", items: { type: "string" } },
        protocol: { type: "string", enum: ["vnc", "rdp", "ssh"] },
        perceive: { type: "boolean" },
      },
      required: ["groupId"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_group_shrink",
    description:
      "Closes the n most recently added members and drops them from the group. Fails rather than clamping if n is larger than the group holds, because a clamp would turn closing three into closing everything, silently.",
    inputSchema: {
      type: "object",
      properties: { groupId: { type: "string" }, n: { type: "number" } },
      required: ["groupId", "n"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_group_close",
    description:
      "Closes every limb in a group and forgets it. A member that has already gone is not an error.",
    inputSchema: {
      type: "object",
      properties: { groupId: { type: "string" } },
      required: ["groupId"],
      additionalProperties: false,
    },
  },
  {
    name: "dvv_status",
    description:
      "State, protocol, size, geometry generation, lease holder and the negotiated signals for one limb, as the full observation object. It does not clear the typing fence: it reads no pixels, and a call that told you nothing about what is on the screen must not be able to say you have looked at it. Cheapest call in the manifest, safe to call constantly, needs no lease. After a LEASE_REVOKED, read lease.human_took_over: true means a person is driving and the right move is to stop.",
    inputSchema: {
      type: "object",
      properties: { limbId: { type: "string" }, groupId: { type: "string" }, member: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "dvv_signals",
    description:
      "Which negotiated signals this session actually has, and what each absence means. Every entry is live, absent or unknown with a reason, and never a default: absent means we asked and the far side does not do it, unknown means nothing has arrived yet and may resolve. Read led_state before typing a password.",
    inputSchema: {
      type: "object",
      properties: { limbId: { type: "string" }, groupId: { type: "string" }, member: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "dvv_transfer",
    description:
      "Reports that there is no transfer queue on this surface, by design. dvv_files does not queue anything: a get or a put runs to completion inside its own tool call and answers with what it moved, so there is no transfer id to look up and nothing in flight to cancel. A transfer that failed part way said so in that call with the byte count, and the repair is to call dvv_files again.",
    inputSchema: {
      type: "object",
      properties: {
        limbId: { type: "string" },
        action: { type: "string", enum: ["status", "cancel"] },
        transferId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
]);

// Reference text for each tool. The README and the dvv-mcp tools subcommand
// render this so an agent can read what a call does in plain language.
const TOOL_REFERENCE = Object.freeze([
  ["dvv_hosts", "List saved machines from the DeskVNC host library."],
  [
    "dvv_limbs",
    "List currently open limbs with their lease state. Each machine is one limb.",
  ],
  [
    "dvv_open",
    "Open a saved host. Pass perceive: true to capture the first screen at open time.",
  ],
  [
    "dvv_wait",
    "Block until a limb reaches a named state, such as 'connected' or 'screen-stable'.",
  ],
  [
    "dvv_control",
    "Manage a limb lease. Use action 'acquire' to take control for the agent.",
  ],
  [
    "dvv_screen",
    "Read the screen. The response carries the generation that subsequent input must reference.",
  ],
  [
    "dvv_click",
    "Click at a screen coordinate. The generation must match the screen the coordinates were read from.",
  ],
  [
    "dvv_type",
    "Type a string at full keyboard speed. Refused until the screen has been read since it last changed.",
  ],
  [
    "dvv_key",
    "Press a named key chord such as 'meta+r' or 'ctrl+shift+esc'.",
  ],
  ["dvv_reconnect", "Reattach to a limb after a drop."],
  ["dvv_close", "Close a limb and release the lease."],
  [
    "dvv_files",
    "Browse or transfer files over SFTP (SSH) or the file channel of an RDP limb.",
  ],
  [
    "dvv_clipboard",
    "Read or write the remote clipboard with action 'get' or 'set'.",
  ],
  [
    "dvv_term_read",
    "Read buffered output from an SSH terminal limb.",
  ],
  [
    "dvv_term_send",
    "Send a line to an SSH terminal limb.",
  ],
  [
    "dvv_run",
    "Open a fresh shell on an SSH limb, run a command, capture stdout, stderr and exit code.",
  ],
  [
    "dvv_group_open",
    "Open several limbs at once and return a groupId to address them together.",
  ],
  [
    "dvv_group_list",
    "List open groups, or one group's members with their index, limbId, host and state.",
  ],
  [
    "dvv_group_grow",
    "Open more limbs and append them to a group. New members get the next index.",
  ],
  [
    "dvv_group_shrink",
    "Close the n most recently added members and drop them from the group.",
  ],
  [
    "dvv_status",
    "State, protocol, size, geometry generation, lease holder and signals for one limb. Reads no pixels and needs no lease.",
  ],
  [
    "dvv_signals",
    "Which negotiated signals this session has, and what each absence means.",
  ],
  [
    "dvv_transfer",
    "Reports that there is no transfer queue on this surface, by design.",
  ],
  [
    "dvv_group_run",
    "Run one action on every member of a group concurrently. Action is wait, screen, status, signals, type, key, click or run.",
  ],
  [
    "dvv_group_close",
    "Close every limb in a group and release every lease.",
  ],
]);

// The observe-then-act loop. Names and arguments match the project exactly.
const AGENT_LOOP = Object.freeze([
  {
    step: "list",
    tool: "dvv_hosts",
    args: {},
    note: "See what there is to open.",
  },
  {
    step: "open",
    tool: "dvv_open",
    args: { hostId: "<id>", perceive: true },
    note: "Returns limbId, screen size, and initial state.",
  },
  {
    step: "acquire",
    tool: "dvv_control",
    args: { limbId: "<limbId>", action: "acquire" },
    note: "Take the lease for the agent.",
  },
  {
    step: "observe",
    tool: "dvv_screen",
    args: { limbId: "<limbId>", form: "full", scale: 0.25 },
    note: "Read the screen, capture the generation.",
  },
  {
    step: "act-click",
    tool: "dvv_click",
    args: { limbId: "<limbId>", x: 700, y: 400, generation: 1 },
    note: "Click using the generation returned by dvv_screen.",
  },
  {
    step: "observe-again",
    tool: "dvv_screen",
    args: { limbId: "<limbId>", form: "damage-crop" },
    note: "Look again at the area that changed.",
  },
  {
    step: "act-type",
    tool: "dvv_type",
    args: { limbId: "<limbId>", text: "notepad", wpm: 3000 },
    note: "Type into the focused field.",
  },
  {
    step: "act-key",
    tool: "dvv_key",
    args: { limbId: "<limbId>", keys: "meta+r" },
    note: "Send a key chord.",
  },
]);

// Verified numbers, all from the project README. 1920x1080 Windows desktop
// over LAN, real machine, real timing.
const FACTS = Object.freeze({
  cycleMs: 19,
  actionsPerSecond: 52,
  openMs: 4,
  acquireMs: 1,
  screenAtScaleQuarterMs: 25,
  typeCharsPerSecond: 447,
  notes:
    "Measured on a real 1920x1080 Windows desktop over LAN, attached with dvv_open and acted on with dvv_click plus dvv_screen.",
});

// Real error codes an agent should handle. These are the codes the dvv
// server returns when a call cannot be honored.
const ERROR_CODES = Object.freeze({
  LIMB_GONE: "The limb has closed. List limbs and reopen the machine.",
  SCREEN_CHANGED:
    "The screen changed under you. Read the screen again, then retry the call.",
  LEASE_REVOKED:
    "A person at the remote machine, or another holder, revoked the lease. Re-acquire before retrying.",
});

function serverManifest() {
  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    description:
      "DeskVNC dvv MCP server. Drives real Windows, Linux and macOS desktops over VNC, RDP or SSH through DeskVNC.",
    vendor: "psmux",
    homepage: REPO_URL,
    transport: {
      stdio: {
        command: "dvv",
        args: ["mcp"],
      },
    },
    capabilities: {
      tools: {},
    },
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    metadata: {
      package: PACKAGE_NAME,
      packageVersion: VERSION,
      binaryLocations: { ...BINARY_LOCATIONS },
      hub: HUB_URL,
      hostedEndpoint: HOSTED_ENDPOINT,
      errorCodes: { ...ERROR_CODES },
    },
  };
}

function toolReference() {
  return TOOL_REFERENCE.map(([name, what]) => ({ name, what }));
}

function agentLoop() {
  return AGENT_LOOP.map((step) => ({ ...step }));
}

function facts() {
  return { ...FACTS };
}

function binaryLocations() {
  // Return a fresh object so callers cannot mutate the frozen source.
  return {
    darwin: BINARY_LOCATIONS.darwin.slice(),
    win32: BINARY_LOCATIONS.win32.slice(),
    linux: BINARY_LOCATIONS.linux.slice(),
  };
}

// Pick a sensible default binary path for the running platform.
function defaultBinaryPath(platform) {
  const p = platform || process.platform;
  if (p === "darwin") return BINARY_LOCATIONS.darwin[0];
  if (p === "win32") return BINARY_LOCATIONS.win32[0];
  return BINARY_LOCATIONS.linux[0];
}

// mcpConfig builds a ready-to-paste config object for a named MCP client.
// Supported clients: claude-desktop, claude-code, cursor, codex, windsurf,
// generic (stdio with command + args).
function mcpConfig(options) {
  const opts = options || {};
  const client = (opts.client || "generic").toLowerCase();
  const binaryPath = opts.binaryPath || defaultBinaryPath();

  if (client === "claude-desktop") {
    return {
      mcpServers: {
        deskvnc: {
          command: binaryPath,
          args: ["mcp"],
        },
      },
    };
  }

  if (client === "claude-code") {
    return {
      mcpServers: {
        deskvnc: {
          type: "stdio",
          command: binaryPath,
          args: ["mcp"],
        },
      },
    };
  }

  if (client === "cursor") {
    return {
      mcpServers: {
        deskvnc: {
          command: binaryPath,
          args: ["mcp"],
        },
      },
    };
  }

  if (client === "codex") {
    return {
      mcp_servers: {
        deskvnc: {
          command: binaryPath,
          args: ["mcp"],
        },
      },
    };
  }

  if (client === "windsurf") {
    return {
      mcpServers: {
        deskvnc: {
          command: binaryPath,
          args: ["mcp"],
        },
      },
    };
  }

  return {
    mcpServers: {
      deskvnc: {
        command: binaryPath,
        args: ["mcp"],
      },
    },
  };
}

export {
  VERSION,
  PACKAGE_NAME,
  SERVER_NAME,
  SERVER_VERSION,
  PROTOCOL_VERSION,
  REPO_URL,
  HUB_URL,
  HOSTED_ENDPOINT,
  BINARY_LOCATIONS,
  TOOLS,
  TOOL_REFERENCE,
  AGENT_LOOP,
  FACTS,
  ERROR_CODES,
  serverManifest,
  toolReference,
  agentLoop,
  facts,
  binaryLocations,
  defaultBinaryPath,
  mcpConfig,
};
