# Atlas direct MCP

Phase 1: anonymous static spec probe only. No Atlas user data, frontend bundle, database, OAuth credentials, protected tools, or model API. The existing Atlas Site is unchanged.

Start: `npm install && npm start`. MCP: `/mcp`; health: `/health`.

Protected bridge integration is intentionally not implemented until the live probe render passes and a supported OAuth delegation to the existing Atlas backend is available. This service never trusts caller-supplied identity headers.
