import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// The other server tests call handleLine/handleRequest in-process, which
// never exercises src/server.ts's isMain bootstrap (the readline wiring on
// real stdin/stdout). These tests spawn the server as a real child process
// to cover that path end to end.

const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));

interface TestServer {
  send(message: unknown): void;
  sendRaw(line: string): void;
  nextLine(timeoutMs?: number): Promise<string>;
  request(message: unknown): Promise<unknown>;
  stop(): void;
}

function startServer(): TestServer {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const rl = createInterface({ input: child.stdout, terminal: false });
  const lines: string[] = [];
  const waiters: ((line: string) => void)[] = [];

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else lines.push(line);
  });

  function nextLine(timeoutMs = 5000): Promise<string> {
    const queued = lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for server output')), timeoutMs);
      waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  function sendRaw(line: string): void {
    child.stdin.write(`${line}\n`);
  }

  function send(message: unknown): void {
    sendRaw(JSON.stringify(message));
  }

  async function request(message: unknown): Promise<unknown> {
    send(message);
    return JSON.parse(await nextLine());
  }

  function stop(): void {
    rl.close();
    child.kill();
  }

  return { send, sendRaw, nextLine, request, stop };
}

test('server integration: initialize, list, and call convert over real stdio', async () => {
  const server = startServer();
  try {
    const init = (await server.request({ jsonrpc: '2.0', id: 1, method: 'initialize' })) as {
      result: { serverInfo: { name: string }; protocolVersion: string };
    };
    assert.equal(init.result.serverInfo.name, 'mcp-unitconv');
    assert.equal(init.result.protocolVersion, '2024-11-05');

    // A notification (no id) must produce no reply on the wire.
    server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const list = (await server.request({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as {
      result: { tools: { name: string }[] };
    };
    assert.equal(list.result.tools[0].name, 'convert');

    const call = (await server.request({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'convert', arguments: { value: 100, from: 'C', to: 'F' } },
    })) as { result: { content: { text: string }[] } };
    assert.deepEqual(JSON.parse(call.result.content[0].text), {
      value: 212,
      from: 'C',
      to: 'F',
      dimension: 'temperature',
    });
  } finally {
    server.stop();
  }
});

test('server integration: malformed JSON on the wire gets a parse-error response', async () => {
  const server = startServer();
  try {
    server.sendRaw('not json');
    const response = JSON.parse(await server.nextLine()) as { error: { code: number }; id: unknown };
    assert.equal(response.error.code, -32700);
    assert.equal(response.id, null);
  } finally {
    server.stop();
  }
});

test('server integration: blank lines on the wire produce no response', async () => {
  const server = startServer();
  try {
    server.sendRaw('');
    const pong = (await server.request({ jsonrpc: '2.0', id: 9, method: 'ping' })) as { id: unknown };
    // If the blank line had produced a reply, it would have been read here
    // instead of the ping response.
    assert.equal(pong.id, 9);
  } finally {
    server.stop();
  }
});
