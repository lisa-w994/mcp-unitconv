import { createInterface } from 'node:readline';
import { convert, supportedUnits } from './units.ts';

/**
 * Minimal MCP stdio server: newline-delimited JSON-RPC 2.0, no framing
 * headers. This is the transport MCP clients speak over stdio, hand-rolled
 * here so the package has zero runtime dependencies.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: number | string | null; result: unknown }
  | { jsonrpc: '2.0'; id: number | string | null; error: { code: number; message: string } };

const PROTOCOL_VERSION = '2024-11-05';

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

// A request without "id" is a notification: no response is expected or sent.
function reply(id: number | string | null | undefined, result: unknown): JsonRpcResponse | null {
  if (id === undefined) return null;
  return { jsonrpc: '2.0', id, result };
}

function replyError(
  id: number | string | null | undefined,
  code: number,
  message: string,
): JsonRpcResponse | null {
  if (id === undefined) return null;
  return { jsonrpc: '2.0', id, error: { code, message } };
}

const CONVERT_TOOL = {
  name: 'convert',
  description:
    'Convert a numeric value between units of the same dimension (length, mass, time, temperature, volume, angle).',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'number', description: 'The numeric value to convert.' },
      from: { type: 'string', description: `Source unit. One of: ${supportedUnits().join(', ')}` },
      to: { type: 'string', description: `Target unit. One of: ${supportedUnits().join(', ')}` },
    },
    required: ['value', 'from', 'to'],
  },
};

export interface ToolCallResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export function handleToolsCall(params: Record<string, unknown> | undefined): ToolCallResult {
  const name = params?.name;
  if (name !== 'convert') {
    return { content: [{ type: 'text', text: `unknown tool: ${String(name)}` }], isError: true };
  }
  const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
  try {
    const result = convert(Number(args.value), String(args.from), String(args.to));
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
}

// Handles one already-parsed request and returns the response to send, or
// null for notifications (which get no reply).
export function handleRequest(req: JsonRpcRequest): JsonRpcResponse | null {
  switch (req.method) {
    case 'initialize':
      return reply(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-unitconv', version: '0.1.0' },
      });
    case 'notifications/initialized':
      return null;
    case 'tools/list':
      return reply(req.id, { tools: [CONVERT_TOOL] });
    case 'tools/call':
      return reply(req.id, handleToolsCall(req.params));
    case 'ping':
      return reply(req.id, {});
    default:
      return replyError(req.id, -32601, `method not found: ${req.method}`);
  }
}

// Parses one line of input and returns the response to send, or null.
export function handleLine(line: string): JsonRpcResponse | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return replyError(null, -32700, 'parse error');
  }

  try {
    return handleRequest(req);
  } catch (err) {
    return replyError(req.id, -32603, err instanceof Error ? err.message : String(err));
  }
}

// Only wire up stdin when run directly, not when imported (e.g. by tests).
const isMain = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const response = handleLine(line);
    if (response) send(response);
  });
}
