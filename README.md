# @pipeworx/cro-ireland

Ireland's statutory company register -- name/number/status/type/address/
incorporation date for every registered company -- published as open data by
the CRO (Companies Registration Office). Filings/submissions history is
covered separately, live, against the CRO's own API (BYO key).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1854+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

Fleet #3346, filling the one EU-register gap we didn't cover (Companies
House, Brønnøysund, Estonia, Latvia, GLEIF already shipped). Loaded live
2026-10-19: 827,248 `ie_companies` rows, verified table-count-matched against
the ingest manifest.

## Tools

- `ie_search_companies(name, status?, limit?)` -- prefix search on a
  company's current registered name (e.g. `"Ryanair"` finds "RYANAIR
  DESIGNATED ACTIVITY COMPANY" and "RYANAIR HOLDINGS PUBLIC LIMITED
  COMPANY"). Returns each match's CRO number, status, type, registered
  address, eircode and incorporation date. `status` filters to one of the
  register's own status TEXT values ("Normal", "Dissolved", "Liquidation",
  etc.) -- there are 30+ codes and the open data already carries a human
  label per row, so this filters on that label rather than the numeric code.
- `ie_get_company(cro_number)` -- one company by its CRO number: current
  name, status, type, registered address, eircode, incorporation date,
  last/next annual-return dates, last accounts date, and dissolution date
  when applicable. A number with no match answers `found: false,
  reason: "not_held"`, not a bare error.
- `ie_get_filings(cro_number, _apiKey, _apiSecret)` -- an Irish company's
  filing/submission history (annual returns, accounts, charges, etc.), live
  from the CRO's own Open Services REST API. **Requires your own CRO Open
  Services credentials** (see Auth) -- this is not in the open-data snapshot
  the other two tools read, only in the CRO's live, access-controlled API.

## Auth

Mixed. `ie_search_companies` and `ie_get_company` are **keyless** -- they
answer only through the Pipeworx gateway, which holds the D1 mirror; a
standalone `npm install` has no data to read, and the tools throw a clear
"not bound in this runtime" error there instead of returning an empty list.

`ie_get_filings` is **BYO key, no platform key exists.** The CRO's Open
Services API (`services.cro.ie`) requires a CustomerKey the CRO issues only
after a signed Open Services Terms & Conditions submission -- verified live
2026-10-19: every endpoint returns `401 Access denied. Invalid API
credentials in Header.` with no credential at all. That is a contractual
step (CLAUDE.md "What we will source" -- vendor terms you actually accept
are Bruce's call, not an agent's), so this tool is BYOK: pass your own
registered account email as `_apiKey` and the API key the CRO issued you as
`_apiSecret`. Without both it refuses in words -- "CRO Open Services
requires an API key" -- rather than guessing or substituting other data. A
Needs Bruce item is filed for whether to pursue a platform key.

## Data sources

- CRO (Companies Registration Office), Company Records open data. Licence:
  Creative Commons Attribution 4.0 (CC BY 4.0), published by the CRO on its
  own open-data portal as a daily snapshot, designated a "high-value
  dataset" under Ireland's Open Data Directive. The exact download route
  lives only in `scripts/cro-ireland/refresh.sh` (CLAUDE.md step 9b).
- CRO (Companies Registration Office), Open Services REST API
  (`services.cro.ie`) -- live, for filings/submissions only. BYO credential;
  no platform key.

## Refreshing the mirror

```
bash scripts/cro-ireland/refresh.sh build   # download + build local SQLite; no remote writes
bash scripts/cro-ireland/refresh.sh load    # the above, then replace the D1 tables and verify
```

The CRO republishes the Company Records snapshot daily; run this on the same
cadence (by hand, or via a scheduled workflow once one is applied).

## Schema

`scripts/cro-ireland/schema.sql`: `ie_companies` (one row per company) +
`ie_meta` (key/value: `data_as_of`, `source`, `licence`). Must stay in sync
with `src/store.ts`'s `CompanyRow`.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "cro-ireland": {
      "url": "https://gateway.pipeworx.io/cro-ireland/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/cro-ireland/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1854+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/ie_search_companies \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ryanair"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/ie_search_companies`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "cro-ireland": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-cro-ireland"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-cro-ireland
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Cro Ireland data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
