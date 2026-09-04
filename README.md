# mcp-unitconv

An MCP server that exposes unit conversion as a tool, so an assistant can convert
between units without guessing arithmetic.

Supports length, mass, time, temperature, volume and angle.

## Install

```bash
npm install
npm run build
```

## Use with an MCP client

```json
{
  "mcpServers": {
    "unitconv": { "command": "node", "args": ["dist/server.js"] }
  }
}
```

## Tool

`convert(value, from, to)` returns the converted value, or an error when the two
units belong to different dimensions.

```
100 C  -> F   =>  212
1 km   -> m   =>  1000
1 km   -> kg  =>  error: dimension mismatch
```

## JSON-RPC methods

The server speaks newline-delimited JSON-RPC 2.0 over stdio (one request or
response per line, no framing headers). It implements:

- `initialize` — returns the protocol version, declared capabilities, and
  server info. Send this first.
- `notifications/initialized` — notification (no `id`, no reply) a client
  sends after `initialize` to signal it's ready.
- `tools/list` — returns the single `convert` tool and its input schema.
- `tools/call` — invokes a tool. Only `name: "convert"` is supported, with
  `arguments: { value, from, to }`. Returns a result whose `content` is a
  one-element array of `{ type: "text", text }`; conversion errors come back
  as `isError: true` rather than a JSON-RPC error, since the tool ran, it
  just couldn't produce a value.
- `ping` — returns an empty result, useful for liveness checks.

Any other method returns a JSON-RPC error with code `-32601` (method not
found). Malformed JSON on a line returns code `-32700` (parse error) with a
null `id`, since the request couldn't be parsed to find one.

## Test

```bash
npm test
```

## License

MIT
