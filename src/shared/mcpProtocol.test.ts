import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalStdioClientConfig,
  buildOnlineHttpClientConfig,
  getAllowedMcpTools,
  isMcpToolAllowed,
} from './mcpProtocol';

test('getAllowedMcpTools enforces read_only vs read_save permission modes', () => {
  const readOnly = getAllowedMcpTools('read_only').map((t) => t.name);
  assert.ok(readOnly.includes('search_arxiv'));
  assert.ok(readOnly.includes('read_paper'));
  assert.ok(!readOnly.includes('save_paper'));

  const readSave = getAllowedMcpTools('read_save').map((t) => t.name);
  assert.ok(readSave.includes('save_paper'));

  assert.equal(isMcpToolAllowed('save_paper', 'read_only'), false);
  assert.equal(isMcpToolAllowed('save_paper', 'read_save'), true);
});

test('MCP client config builders produce valid JSON configs', () => {
  const localJson = JSON.parse(buildLocalStdioClientConfig('/home/user/arxivlab'));
  assert.equal(localJson.mcpServers.arxivlab.command, 'npx');
  assert.equal(localJson.mcpServers.arxivlab.args[1], '/home/user/arxivlab/mcp-stdio.ts');

  const onlineJson = JSON.parse(
    buildOnlineHttpClientConfig('https://example.run.app/', {
      transportMode: 'online_http',
      permissionMode: 'read_save',
      requireBearerToken: true,
      bearerToken: 'secret-token-123',
      allowZoteroPushFromAgent: true,
      cacheFullTextOnAgentRead: true,
    })
  );
  assert.equal(onlineJson.mcpServers.arxivlab_remote.url, 'https://example.run.app/mcp');
  assert.equal(
    onlineJson.mcpServers.arxivlab_remote.headers.Authorization,
    'Bearer secret-token-123'
  );
});
