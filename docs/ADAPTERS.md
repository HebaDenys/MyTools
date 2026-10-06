# MyTools from an MCP client or a local HTTP API

The UI, MCP and API use the same existing tool engines. These adapters add no
third-party runtime dependency and start only when you explicitly launch them.
Node.js 22+ is required. Use a repository checkout or the separate server ZIP;
the two standalone HTML files alone do not contain the Node server.

**Private personal use remains free. Business/professional use requires a paid
license from Denys Heba, including internal use, freelance work and AI workflows.**
The root LICENSE and COMMERCIAL.md are unchanged; no activation or payment service.

## MCP (stdio)

Launch directly, without an npm banner on stdout:

```sh
node /absolute/path/MyTools/adapters/local/mcp.mjs
```

For clients using the `mcpServers` configuration convention:

```json
{
  "mcpServers": {
    "mytools": {
      "command": "node",
      "args": ["/absolute/path/MyTools/adapters/local/mcp.mjs"]
    }
  }
}
```

Replace the absolute path; on Windows use escaped backslashes or forward slashes.
Your client's configuration format may differ. No client account or configuration
has been changed by this repository. The client starts/stops its own subprocess.

This is a tools-only implementation of **MCP revision 2025-11-25**: initialization,
version negotiation, initialized notification, ping, tools/list and tools/call.
Responses include text plus structuredContent. Unknown methods are errors;
notifications do not invoke tools. There is no sampling, elicitation, resources,
shell execution, filesystem access, task support or HTTP MCP transport. This is
not a claim of complete MCP conformance or support for the newer 2026 revision.
The bounded stdio implementation is original code, not the official SDK.

## HTTP API (opt-in, loopback only)

Supply a random access token at runtime; never put a real token in Git or URLs.
An access token authenticates a local client, not a commercial license.

POSIX shell:

```sh
export MYTOOLS_API_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
node adapters/local/http.mjs
```

PowerShell:

```powershell
$env:MYTOOLS_API_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
node adapters/local/http.mjs
```

The server binds only `127.0.0.1:4174`. Optional `MYTOOLS_API_PORT` changes the port,
not the address. A 32–256 character base64url/hex-style token is mandatory. Keep it
in the client environment too; rotate it by restarting the server with a new one.

Every route requires `Authorization: Bearer <token>`:

| Route | Result |
| --- | --- |
| `GET /v1/tools` | Ten tools and their JSON input schemas |
| `GET /openapi.json` | Generated OpenAPI 3.1 contract |
| `POST /v1/tools/<name>` | JSON arguments in; `{ "result": ... }` out |

Example from a separate terminal with the same token in its environment:

```sh
node --input-type=module -e '
const r = await fetch("http://127.0.0.1:4174/v1/tools/trueflow_compare", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.MYTOOLS_API_TOKEN },
  body: JSON.stringify({
    before: { text: "id,status\n001,pending\n002,active" },
    after: { text: "id,status\n001,active\n003,active" },
    keys: ["id"]
  })
});
console.log(r.status, await r.json());'
```

This produces one addition, one removal and one change. The token does not appear
in the command-line arguments or output. HTTP is ordinary JSON REST, **not** MCP
Streamable HTTP; `/mcp` is deliberately absent. Requests with any Origin header,
untrusted Host or forwarding headers are rejected. There is no CORS, cookie,
GET-based execution, compressed input, remote bind option or reverse-proxy mode.
Do not publish it through a tunnel, port-forward or reverse proxy.

## Tools and data semantics

`truescrub`, `json_format`, `base64`, `clean_link`, `text`, `password`, `sha256`,
`trueflow_profile`, `trueflow_run`, `trueflow_compare` are available over both
transports. `tools/list` or `GET /v1/tools` is the authoritative argument catalog;
OpenAPI is generated from those same contracts, not a separately maintained list.

Pass literal text, never a filename or URL to read. For SHA-256, supply either
`text` or `base64Bytes` (canonical padded Base64), not both. The client can read a
file with its own permissions and pass its bytes; the server cannot open paths.
TrueFlow sources contain `text`, optional `format` (csv/tsv/json) and optional
`delimiter` (comma/semicolon/tab). `trueflow_run` returns actual output in `text`,
with profile, journal and warnings. `trueflow_compare` accepts composite `keys`
and returns counts and source-record locations. Inputs are not mutated or saved.

Recipes follow TrueFlow's existing typed format. No arbitrary expressions or
new transformations were introduced. Every original data boundary remains:
JSON numbers become exact text; null/absent values become empty cells; CSV formula
guards change values; duplicates/missing comparison keys are errors. Full details
are in `projects/trueflow/README.md` in the source repository.

## Bounds, privacy and failures

Adapters intentionally have smaller limits than the desktop/browser workbench:
256 KiB UTF-8 per utility text/Base64 argument, 512 KiB per dataset text,
2 MiB per entire JSON request/frame, 512 KiB serialized result. Existing engine
row/column/step limits also apply. No silent truncation; oversized results fail.
MCP emits a text rendering alongside structured output, so its wire response may
be larger than the serialized-result bound. HTTP permits at most 16 concurrent
connections, with bounded headers and timeouts. Processing is in-memory and
sequential per MCP stream; this is not a public/multi-tenant workload server.

A local adapter does NOT make the AI client private. That client may send inputs
and tool results to a cloud model, save chat history or log protocol traffic.
In particular, a password returned to an AI client may enter its history. Prefer
the standalone offline UI for real passwords or data you must not give a model.
These adapters themselves do not make outbound requests, log payloads/tokens,
write user files, or upload data. The local HTTP transfer is explicitly initiated
by the client. Error text contains stable codes and sometimes record numbers,
not source values. Successful tool results can contain the requested data.

There is no UI review checkbox in an API invocation: the caller is responsible
for review before saving or sharing output. Redaction remains best effort and
reports are not proof of anonymization. Column names/filter literals can also be
sensitive. Host processes, environment inspection, browser extensions and the OS
are outside the server's security boundary. No certified memory erasure.

## Tests and references

`node --test test/adapters.test.mjs` exercises every tool, real stdio subprocesses,
actual loopback HTTP requests, UTF-8/framing failures, authentication, Origin/Host,
unsafe paths/expressions and request/output limits. `npm run validate` includes
these Node tests. After building, `npm run package && python3 test/server_package.py`
checks hashes and executes MCP/HTTP from the extracted server ZIP (Python 3 needed). These are project regression tests, not a certification by
an external client or the MCP conformance suite.

Protocol references checked on 6 October 2026:
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools

## Comparing renamed columns (v0.4.0)

`trueflow_compare` accepts optional `mapping`, with this closed schema:

```json
{
  "before": {"text":"id,name\n001, A \n002,B"},
  "after": {"text":"key,label\n001,A\n003,C"},
  "keys": ["id"],
  "mapping": {"format":"mytools.trueflow.mapping","version":1,"columns":[
    {"before":"id","after":"key"},{"before":"name","after":"label"}
  ]},
  "recipe": {"format":"mytools.trueflow.recipe","version":1,"steps":[
    {"type":"trim","columns":["name"]}
  ]}
}
```

Pass this object as MCP `tools/call.arguments` for `trueflow_compare`, or as the
body of `POST /v1/tools/trueflow_compare`. The result has one addition, one removal
and one unchanged row. Mapping aligns original B headers to A **before** recipes.
Exactly identical unclaimed names match automatically; all other pairs must be
explicit. All original columns must be accounted for. No column dropping, fuzzy
matching or value conversion occurs. Keys refer to the resulting canonical names.
Without `mapping`, old calls behave exactly as before. The tool count stays ten.

`SCHEMA_UNMAPPED`, `AMBIGUOUS_SCHEMA_MAPPING`, `UNKNOWN_MAPPING_COLUMN` and
`INVALID_SCHEMA_MAPPING` are stable data-error codes, without source values.
Malformed contract shapes return `INVALID_ARGUMENTS`. Use `trueflow_profile` to
inspect header names when diagnosing a mismatch. Both transports and OpenAPI use
the existing shared registry; no second registry or protocol revision was added.
The local-execution/client-privacy and paid-business-license boundaries above apply.
