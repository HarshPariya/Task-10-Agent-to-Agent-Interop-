# Task 10 — Implementation Notes

## Agent-to-Agent Interoperability Across Trust Boundaries

---

## 1. Purpose

This document records important implementation decisions, security considerations, assumptions, and limitations for Task 10.

The main purpose is to make the implementation easy to review and explain why specific design choices were made.

---

## 2. Trust Model

The external agent is treated as an **untrusted peer**.

The primary agent does not assume that an external agent is trustworthy because:

- The HTTP connection succeeds.
- The agent advertises a capability.
- The response is valid JSON.
- The response contains the expected fields.
- The response appears semantically reasonable.

External data becomes trusted only after passing the verification pipeline.

```text
External Agent
      |
      v
Untrusted Data
      |
      v
Protocol Validation
      |
      v
Schema Validation
      |
      v
Injection Detection
      |
      v
Verified Result
```

---

## 3. Why Zero-Trust Between Agents Matters (Even When You Wrote Both Sides)

This exercise deliberately separates the primary agent and external agent into different processes with no shared code. The wire boundary is what matters, not who wrote the code.

**Key reasons:**

1. **Process isolation ≠ trust boundary** — Even if you wrote both agents, they run as separate processes. A bug, compromise, or version skew in one doesn't automatically affect the other *if* the boundary is verified. The verification layer is the contract that enforces this isolation.

2. **Version skew** — In real deployments, agents are updated independently. The external agent might be v1.2 while the primary expects v1.0. Capability discovery + schema validation catches this at runtime, not after corrupted data propagates.

3. **Supply chain risk** — The external agent might depend on a compromised library. Your primary agent shouldn't trust it just because "you wrote it."

4. **Behavioral drift** — An agent that was honest during testing might behave differently in production (e.g., new code path, feature flag, data corruption). The verification pipeline catches drift on every request.

5. **The "confused deputy" problem** — If the primary agent blindly accepts external results, an attacker who compromises the external agent can manipulate the primary agent's behavior. Verification limits the blast radius.

6. **Defense in depth** — Schema validation catches structural errors. Injection detection catches semantic attacks. Timeout handling catches availability attacks. Each layer addresses a different threat model.

---

## 4. Implementation Decisions

### 4.1 Protocol Version Hardcoded to `a2a/v1`

The protocol version is a literal string constant. No version negotiation. This prevents downgrade attacks and keeps the implementation simple. If the version changes, it's a breaking change requiring coordinated deployment.

### 4.2 JSON Schema as Strings (Not TypeScript Types)

Capability input/output schemas are stored as JSON strings. This allows:
- Dynamic schema validation at runtime via Zod
- Cross-language compatibility (JSON Schema is language-agnostic)
- Schemas published over HTTP without code sharing

Trade-off: No compile-time checking of schema conformance. Verified at runtime instead.

### 4.3 Injection Patterns Are Static Regexes

Patterns: `instruction-override`, `role-manipulation`, `prompt-extraction`, `instruction-execution`.

This is a pragmatic baseline. Production would need:
- Rule file external to code for updates without deploys
- Possibly LLM-based semantic detection for novel attacks

### 4.4 Timeout Uses AbortController (Not setTimeout Wrapper)

`AbortController` actually cancels the underlying HTTP request, not just the local promise. This prevents resource leaks on the external agent side too.

### 4.5 Golden Evaluation Uses Separate HTTP Server Per Scenario

Each scenario starts its own `ExternalAgentServer` on a unique port. This ensures:
- No cross-scenario state pollution
- Clean timeout testing (killing mid-request works reliably)
- Realistic network overhead per delegation

### 4.6 Metrics Are In-Memory Only

`MetricsCollector` accumulates in memory and exports a snapshot. No Prometheus/OpenTelemetry export. Sufficient for the evaluation; production would add exporters.

### 4.7 Three Agent Variants Match Golden Eval Exactly

| Variant | Golden Eval Count | Implemented |
|---------|-------------------|-------------|
| Honest | 6 | ✅ |
| Capability-lying | 2 | ✅ |
| Injection-embedding | 2 | ✅ |

The PDF's golden evaluation table specifies these three. The "malformed responses" variant mentioned in the general requirements was intentionally omitted from the golden eval and therefore not included in the final implementation (removed to match the PDF spec exactly).

---

## 5. Security Assumptions and Limitations

1. **No transport encryption** — HTTP over localhost. Production requires TLS termination at infrastructure layer (reverse proxy, service mesh).

2. **No agent identity** — No SPIFFE, OIDC, or signatures. Trust is behavioral, not cryptographic.

3. **No capability negotiation** — Exact version match required. Downgrade prevention via explicit pinning.

4. **Synchronous request/response only** — No streaming, no async callbacks.

5. **Single-hop delegation only** — No A→B→C chaining.

6. **In-memory metrics** — No persistence across runs.

7. **Static injection patterns** — Novel attacks may bypass until patterns updated.

8. **No schema migration** — Version pinning handles evolution explicitly.

---

## 6. Hard Parts Encountered (and Solutions)

| Hard Part | Solution |
|-----------|----------|
| Timeout too tight/loose | Default 3000ms, configurable per call, AbortController actually cancels HTTP |
| Injection in valid schema | Run injection detector *after* schema validation; scans all string values recursively |
| Honest agent edge cases not in tests | Golden eval has 6 diverse honest scenarios (different claims, repeated tasks) |
| Capability manifest misleading but valid | Validate structure at discovery; validate actual response at handoff |
| Reproducibility from fresh clone | Deterministic golden eval, no external dependencies, fixed ports, isolated servers |

---

## 7. Files Modified/Added Since Initial Scaffold

- `packages/a2a/src/agents/honest-agent.ts` — Honest external agent
- `packages/a2a/src/agents/capability-lying-agent.ts` — Lies about capabilities
- `packages/a2a/src/agents/injection-agent.ts` — Embeds injection in response
- `packages/a2a/src/client/capability-client.ts` — Fetches manifest
- `packages/a2a/src/client/handoff-client.ts` — Sends handoff with timeout
- `packages/a2a/src/orchestration/delegation-service.ts` — Orchestrates delegation + verification
- `packages/a2a/src/protocol/capability.ts` — Manifest types + Zod schemas
- `packages/a2a/src/protocol/errors.ts` — Error codes + A2AError
- `packages/a2a/src/protocol/handoff.ts` — Handoff request/response types
- `packages/a2a/src/server/external-agent-server.ts` — HTTP server for external agent
- `packages/a2a/src/verification/injection-detector.ts` — Injection pattern detection
- `packages/a2a/src/verification/response-verifier.ts` — Verification pipeline
- `packages/a2a/src/verification/schema-validator.ts` — Schema validation
- `packages/a2a/src/metrics/metrics.ts` — Metrics collector
- `packages/a2a/src/config.ts` — Protocol constants
- `packages/a2a/src/index.ts` — Public exports
- `evals/golden-a2a.jsonl` — 10 golden scenarios (6 honest, 2 lying, 2 injection)
- `scripts/run-evaluation.ts` — Runs golden eval, saves results to `results/`
- `scripts/run-review-gate.ts` — Automated pre-merge validation
- `scripts/a2a-cli.ts` — CLI entry point
- `RESULTS.md` — Naive vs. verified comparison, metrics
- `DESIGN.md` — Design doc with interfaces, failure modes, review gate
- `ARCHITECTURE.md` — System architecture
- `NOTES.md` — This file

---

## 8. Verification Commands

```bash
# Full verification pipeline
pnpm install
pnpm build
pnpm eval
pnpm review
```

Expected: **10/10 scenarios passed**, 100% on all four metrics, review gate PASS.