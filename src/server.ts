import { createInterface } from 'node:readline';
import { convert, supportedUnits } from './units.ts';

/**
 * Minimal MCP stdio server: newline-delimited JSON-RPC 2.0, no framing
 * headers. This is the transport MCP clients speak over stdio, hand-rolled
 * here so the package has zero runtime dependencies.
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

const PROTOCOL_VERSION = '2024-11-05';

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

// A request without "id" is a notification: no response is expected or sent.
function reply(id: number | string | null | undefined, result: unknown): void {
  if (id === undefined) return;
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id: number | string | null | undefined, code: number, message: string): void {
  if (id === undefined) return;
  send({ jsonrpc: '2.0', id, error: { code, message } });
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

interface ToolCallResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

function handleToolsCall(params: Record<string, unknown> | undefined): ToolCallResult {
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

function handleRequest(req: JsonRpcRequest): void {
  switch (req.method) {
    case 'initialize':
      reply(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-unitconv', version: '0.1.0' },
      });
      break;
    case 'notifications/initialized':
      break;
    case 'tools/list':
      reply(req.id, { tools: [CONVERT_TOOL] });
      break;
    case 'tools/call':
      reply(req.id, handleToolsCall(req.params));
      break;
    case 'ping':
      reply(req.id, {});
      break;
    default:
      replyError(req.id, -32601, `method not found: ${req.method}`);
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed);
  } catch {
    replyError(null, -32700, 'parse error');
    return;
  }

  try {
    handleRequest(req);
  } catch (err) {
    replyError(req.id, -32603, err instanceof Error ? err.message : String(err));
  }
});
