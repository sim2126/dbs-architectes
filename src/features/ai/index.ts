/**
 * AI feature — agent runtime + Aria assistant UI.
 *
 * server/agent/ holds the agent runtime (artifacts, blocks, prompt,
 * tools, context reconstruction). It is server-only and deep-imported
 * by route handlers — NOT re-exported here, so it can't be pulled
 * into a client bundle by accident.
 *
 * Public surface (re-exported below): the client AgentBlocks renderer
 * and domain-level AI flags.
 */
export * from "./client/agent-blocks";
export * from "./domain/ai-flags";
