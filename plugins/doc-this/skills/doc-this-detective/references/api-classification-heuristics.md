# API Classification Heuristics — Public vs. Private

Detective uses these heuristics to decide whether each HTTP/gRPC/WebSocket endpoint in `external-surface.json` is `public` (external contract) or `private` (internal implementation detail).

## The principle

**Public** = part of the contract with an external caller (other teams, customers, partner systems, mobile apps, public clients). Consumed across the team's deployment-perimeter boundary.

**Private** = implementation detail of how the team wires its own components (BFF for own UI, internal microservice-to-microservice, sidecar admin endpoints). Consumed only within the team's deployment perimeter.

The reason this matters: only `public` endpoints get `@api` ATDD scenarios with their own protocol drivers. **Private APIs are covered transitively via `@browser` scenarios** of the UI that consumes them. This avoids duplicate coverage and prevents specs from coupling to internal contracts.

## Strong signals → 🟢 confidence

Apply in order; first match wins.

| Signal | Implication |
|--------|-------------|
| Route prefix `/api/internal/`, `/internal/`, `/private/`, `/admin/internal/` | private |
| Route prefix `/api/v1/public/`, `/api/public/`, `/v1/`, `/v2/` (versioned root) | public |
| OpenAPI annotation `x-internal: true` or `x-visibility: internal` | private |
| OpenAPI annotation `x-public: true`, `tags: [public-api]` | public |
| Controller class name `Internal*Controller`, `Admin*Controller` not exposed externally, `*PrivateController` | private |
| Controller class name `Public*Controller`, `Api*Controller` (when sibling Internal exists) | public |
| Authentication scheme: distinct internal-only auth (mTLS between services, internal JWT issuer, basic auth for admin) | private |
| Authentication scheme: API key for external clients, OAuth2 with public registration, JWT from end-user identity provider | public |
| Network exposure: documented as not reachable from public internet (internal load balancer, VPC-only, mesh-only) | private |
| Network exposure: behind public load balancer, CDN, or API gateway with public egress | public |
| Documentation: linked from customer/partner docs, has external SLA, listed in developer portal | public |
| Documentation: not in customer docs, internal wiki only | private |

## Call-graph observations (auxiliary, NOT visibility evidence)

When no strong signal in the table above applies, the agent may **record** call-graph observations in the endpoint's `rationale` field, but those observations alone do **not** establish visibility under the describe-only pact. "Called only from this repo's own UI" is an observation about consumers, not an explicit declaration of contract status — the absence of a strong signal means the visibility is **🔴 GAP** for human resolution.

| Observation (record in rationale, do NOT auto-classify) |
|--------------------------------------------------------|
| Endpoint is called only from this repo's own UI / mobile / services |
| Endpoint is called from an SDK published to a public package registry |
| Endpoint is called from another repo owned by a different team |
| Endpoint has rate limits configured (record the configured value with citation) |
| Endpoint has no rate limits configured |

These observations help the human resolve the 🔴, but the classifier never promotes them to 🟢 on their own.

## Cannot determine → 🔴

Flag for human review when:
- Multiple signals contradict each other
- Call graph cannot be resolved (dynamic dispatch, reflection-based routing)
- Codebase has no documentation, no auth distinction, no OpenAPI annotations
- Endpoint exists but has no observable callers in the analyzed code

Document in `gaps.md`: "Endpoint X — visibility undetermined; needs human classification before parity scenarios can be authored."

## Edge cases

- **Mobile app endpoints**: even if served by a BFF, treat as `public` if mobile is an external client (apps in app stores). The BFF itself, however, may be private (app-internal, not consumed by other teams).
- **Webhook receivers**: if the webhook is invoked by a third-party SaaS (Stripe, GitHub, Slack), treat as `public`. If invoked by internal cron jobs only, `private`.
- **Internal microservice-to-microservice**: when both services are owned by the same team, classify as `private`. When the consumer is owned by a different team, classify as `public` (it's the team's contract with that team).
- **Health check / metrics / readiness endpoints** (`/healthz`, `/metrics`, `/readyz`): always `private` — they're operational concerns, not feature contracts. Do not generate `@api` parity scenarios for these.

## Persistence

Write the result back to `external-surface.json` per endpoint:

```json
{
  "kind": "http",
  "path": "/api/orders",
  "method": "POST",
  "controller": "OrdersController.cs:42",
  "visibility": "public",
  "confidence": "confirmed",
  "rationale": "Listed in developer portal; OpenAPI annotation tags: [public-api]; OAuth2 with public registration."
}
```

For private:

```json
{
  "kind": "http",
  "path": "/internal/sync/orders",
  "method": "POST",
  "controller": "InternalSyncController.cs:18",
  "visibility": "private",
  "confidence": "confirmed",
  "rationale": "Route prefix /internal/; called only from src/jobs/SyncJob.cs (call graph analysis); behind internal mesh."
}
```
