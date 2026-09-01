import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleLine, handleRequest, handleToolsCall, type JsonRpcResponse } from '../src/server.ts';

function expectResult(response: JsonRpcResponse | null): { result: unknown; id: unknown } {
  if (!response || !('result' in response)) throw new Error('expected a result response');
  return response;
}

function expectError(response: JsonRpcResponse | null): { error: { code: number; message: string }; id: unknown } {
  if (!response || !('error' in response)) throw new Error('expected an error response');
  return response;
}

test('initialize returns protocol info and echoes id', () => {
  const response = expectResult(handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
  assert.equal(response.id, 1);
  const result = response.result as { protocolVersion: string; serverInfo: { name: string } };
  assert.equal(result.protocolVersion, '2024-11-05');
  assert.equal(result.serverInfo.name, 'mcp-unitconv');
});

test('notifications/initialized produces no response', () => {
  const response = handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(response, null);
});

test('a request without an id is treated as a notification', () => {
  const response = handleRequest({ jsonrpc: '2.0', method: 'ping' });
  assert.equal(response, null);
});

test('tools/list advertises the convert tool', () => {
  const response = expectResult(handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
  const { tools } = response.result as { tools: { name: string }[] };
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'convert');
});

test('ping replies with an empty result', () => {
  const response = handleRequest({ jsonrpc: '2.0', id: 3, method: 'ping' });
  assert.deepEqual(response, { jsonrpc: '2.0', id: 3, result: {} });
});

test('unknown method returns method-not-found error', () => {
  const response = expectError(handleRequest({ jsonrpc: '2.0', id: 4, method: 'bogus' }));
  assert.equal(response.error.code, -32601);
  assert.match(response.error.message, /bogus/);
});

test('tools/call with convert returns the conversion as text', () => {
  const response = expectResult(
    handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'convert', arguments: { value: 1, from: 'km', to: 'm' } },
    }),
  );
  const result = response.result as { content: { type: string; text: string }[]; isError?: boolean };
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), {
    value: 1000,
    from: 'km',
    to: 'm',
    dimension: 'length',
  });
});

test('tools/call with an unsupported tool name is an error result, not a protocol error', () => {
  const result = handleToolsCall({ name: 'nope', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /unknown tool: nope/);
});

test('tools/call with mismatched dimensions is an error result', () => {
  const result = handleToolsCall({ name: 'convert', arguments: { value: 1, from: 'km', to: 'kg' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /量纲不匹配/);
});

test('tools/call with no arguments still returns an error result rather than throwing', () => {
  const result = handleToolsCall({ name: 'convert' });
  assert.equal(result.isError, true);
});

test('handleLine ignores blank lines', () => {
  assert.equal(handleLine(''), null);
  assert.equal(handleLine('   \n'), null);
});

test('handleLine returns a parse error for invalid JSON', () => {
  const response = expectError(handleLine('not json'));
  assert.equal(response.error.code, -32700);
  assert.equal(response.id, null);
});

test('handleLine round-trips a full JSON-RPC request', () => {
  const response = handleLine(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }));
  assert.deepEqual(response, { jsonrpc: '2.0', id: 7, result: {} });
});
