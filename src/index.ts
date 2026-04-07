#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { StripeService } from './services/stripe.service.js';
import http from 'http';

async function main() {
  // Redirect console.log to stderr to prevent corrupting MCP JSON-RPC on stdout
  console.log = (...args: unknown[]) => console.error('[LOG]', ...args);

  const apiKey = process.env['STRIPE_API_KEY'] ?? '';
  const stripeService = apiKey ? new StripeService(apiKey) : null;

  const port = process.env['PORT'];

  if (port) {
    // HTTP mode for hosted deployment
    // In stateless mode, each request needs a fresh transport + server pair
    const serverCard = {
      name: 'mcp-stripe-bi',
      description:
        'Stripe Business Intelligence MCP server — MRR, churn, cohorts, LTV, and SaaS revenue analytics. 20 tools.',
      version: '0.1.0',
      tools: 20,
      homepage: 'https://github.com/vic08/mcp-stripe-bi',
      transport: { type: 'streamable-http', url: '/mcp' },
    };

    const httpServer = http.createServer(async (req, res) => {
      if (req.url === '/mcp' || req.url === '/') {
        try {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          const server = createServer(stripeService);
          res.on('close', () => transport.close());
          await server.connect(transport);
          await transport.handleRequest(req, res);
        } catch {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
      } else if (req.url === '/.well-known/mcp/server-card.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(serverCard));
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    httpServer.listen(parseInt(port, 10), '0.0.0.0', () => {
      console.error(`MCP server listening on port ${port} (HTTP mode)`);
    });
  } else {
    // stdio mode for local usage (Claude Desktop, Cline, etc.)
    const mcpServer = createServer(stripeService);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
