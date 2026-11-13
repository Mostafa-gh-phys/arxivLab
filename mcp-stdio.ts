import readline from 'node:readline';
import { handleMcpJsonRpc, type JsonRpcRequest } from './src/server/mcpHandler';

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed) as JsonRpcRequest;
    const response = await handleMcpJsonRpc(req, 'stdio');
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  } catch (err: unknown) {
    const errRes = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: `Parse error: ${(err as Error).message}`,
      },
    };
    process.stdout.write(`${JSON.stringify(errRes)}\n`);
  }
});
