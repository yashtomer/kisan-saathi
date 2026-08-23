/**
 * Minimal MCP (Model Context Protocol) server over Streamable HTTP.
 *
 * Agora's Conversational AI Engine calls this from its cloud when the agent
 * decides to use a tool — see `llm.mcp_servers[].transport: "streamable_http"`
 * in the agent config. Only the handful of JSON-RPC methods the engine needs
 * are implemented; this is a tool endpoint, not a general MCP implementation.
 */

/** Latest protocol revision we understand; we echo the client's if it sends one. */
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const SERVER_INFO = { name: 'kisan-saathi-tools', version: '1.0.0' };

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the arguments the model must supply. */
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
};

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

const result = (id: JsonRpcRequest['id'], value: unknown) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  result: value,
});

const failure = (id: JsonRpcRequest['id'], code: number, message: string) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code, message },
});

/**
 * Handles one JSON-RPC message. Returns null for notifications, which take no
 * response body (the caller answers 202).
 */
export async function handleMcpMessage(
  request: JsonRpcRequest,
  tools: ToolDefinition[],
): Promise<Record<string, unknown> | null> {
  const { method, id, params } = request;

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      return result(id, {
        protocolVersion:
          typeof requested === 'string' ? requested : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    }

    // Notifications carry no id and expect no result.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return result(id, {});

    case 'tools/list':
      return result(id, {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });

    case 'tools/call': {
      const name = params?.name;
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) return failure(id, -32602, `Unknown tool: ${String(name)}`);

      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      console.log(`[mcp] tools/call ${tool.name}`, JSON.stringify(args));

      try {
        const text = await tool.handler(args);
        return result(id, { content: [{ type: 'text', text }], isError: false });
      } catch (error) {
        // Surfaced to the model as tool output so it can recover in
        // conversation rather than failing the turn.
        const message =
          error instanceof Error ? error.message : 'Tool execution failed';
        console.error(`[mcp] ${tool.name} failed:`, message);
        return result(id, {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      return failure(id, -32601, `Method not found: ${method}`);
  }
}
