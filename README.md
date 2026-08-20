# Task 10 — Agent-to-Agent Interoperability

A production-oriented TypeScript implementation of **Agent-to-Agent (A2A) interoperability across trust boundaries**.

The project demonstrates how a primary agent can safely communicate with an external, potentially untrusted agent through a versioned HTTP protocol, capability discovery, response validation, injection detection, and fail-closed delegation.

---

## 1. Objective

Task 10 extends the multi-agent concepts from the previous tasks by introducing a **trust boundary between agents**.

The primary agent does not automatically trust an external agent.

Before accepting an external result, the system verifies:

1. Whether the required capability is supported.
2. Whether the protocol contract is valid.
3. Whether the response matches the expected schema.
4. Whether the response contains suspicious injection-style content.
5. Whether the delegation result can safely be accepted.

The core security principle is:

> **External agent responses are untrusted input until verification succeeds.**

---

## 2. Key Features

- Capability discovery through HTTP.
- Versioned A2A protocol.
- Typed task handoff.
- Request and response validation.
- Configurable request timeouts.
- Fail-closed delegation.
- External response schema validation.
- Injection-style content detection.
- Deliberately misbehaving external agents (3 variants).
- Golden evaluation scenarios (10 deterministic scenarios).
- Runtime verification metrics.
- Automated review-gate validation.
- Local execution without external services.
- Evaluation results auto-saved to `results/` folder.

---

## 3. Architecture

```text
                         USER TASK
                             |
                             v
                  +----------------------+
                  |    Primary Agent     |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Capability Discovery |
                  +----------+-----------+
                             |
                             | HTTP
                             v
                  +----------------------+
                  |   External Agent     |
                  |  Capability Manifest |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Delegation Service   |
                  +----------+-----------+
                             |
                             | A2A Handoff
                             v
                  +----------------------+
                  | External HTTP Server |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Response Verification|
                  +----------+-----------+
                             |
                    +--------+--------+
                    |                 |
                  Reject            Accept
                    |                 |
                    v                 v
               Fail Closed      Verified Result
```

---

## 4. Project Structure

```
Task-10-Agent-to-Agent-Interop/
├── packages/
│   └── a2a/
│       └── src/
│           ├── agents/
│           │   ├── honest-agent.ts        # Honest external agent
│           │   ├── capability-lying-agent.ts   # Lies about capabilities
│           │   └── injection-agent.ts     # Embeds injection in response
│           ├── client/
│           │   ├── capability-client.ts   # Fetches capability manifest
│           │   └── handoff-client.ts      # Sends handoff requests
│           ├── orchestration/
│           │   └── delegation-service.ts  # Orchestrates delegation + verification
│           ├── protocol/
│           │   ├── capability.ts          # Capability manifest types
│           │   ├── errors.ts              # Error codes and A2AError class
│           │   └── handoff.ts             # Handoff request/response types
│           ├── server/
│           │   └── external-agent-server.ts  # HTTP server for external agent
│           ├── verification/
│           │   ├── injection-detector.ts  # Detects injection patterns
│           │   ├── response-verifier.ts   # Orchestrates verification pipeline
│           │   └── schema-validator.ts    # Validates against declared schema
│           ├── metrics/
│           │   └── metrics.ts             # Metrics collector and snapshot
│           ├── config.ts                  # Protocol configuration
│           └── index.ts                   # Public exports
├── evals/
│   └── golden-a2a.jsonl                   # 10 golden evaluation scenarios
├── results/
│   └── evaluation-results.json            # Auto-saved evaluation results
├── scripts/
│   ├── a2a-cli.ts                         # CLI entry point
│   ├── run-evaluation.ts                  # Golden evaluation runner
│   └── run-review-gate.ts                 # Automated review gate
├── DESIGN.md                              # Design document
├── ARCHITECTURE.md                        # Architecture overview
├── RESULTS.md                             # Evaluation results & comparison
├── NOTES.md                               # Zero-trust rationale
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

---

## 5. Quick Start

### Install dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Run a single delegation (CLI)

```bash
# Run with honest external agent (default)
pnpm a2a run --task "the earth orbits the sun"

# Run with capability-lying variant
pnpm a2a run --task "the earth orbits the sun" --agent capability-lying

# Run with injection-embedding variant
pnpm a2a run --task "the earth orbits the sun" --agent injection
```

### Run golden evaluation (10 scenarios)

```bash
pnpm eval
```

Output includes:
- Per-scenario pass/fail
- Four key metrics:
  - Successful delegation rate (honest agent)
  - Fail-closed rate (misbehaving agents)
  - Schema-violation catch rate
  - Average verification latency
- Results auto-saved to `results/evaluation-results.json`

### Run review gate

```bash
pnpm review
```

Verifies:
- All required files and directories exist
- Golden evaluation dataset is valid (10 scenarios)
- All source files contain implementation

---

## 6. External Agent Variants

| Variant | Count in Golden Eval | Behavior |
|---------|---------------------|----------|
| **honest** | 6 | Correctly implements capability, returns valid responses |
| **capability-lying** | 2 | Advertises capabilities it doesn't actually support, returns errors |
| **injection** | 2 | Returns schema-valid responses containing injection patterns |

---

## 7. Verification Pipeline

Every external response passes through four layers:

1. **Capability Discovery** — Validates manifest structure, protocol version, capability presence
2. **Protocol Contract** — Handoff request/response validated via Zod schemas
3. **Schema Validation** — Response validated against declared output schema (required fields, types, enums, ranges)
4. **Injection Detection** — Recursive text scan for `instruction-override`, `role-manipulation`, `prompt-extraction`, `instruction-execution` patterns

All four layers executed on every external response. No layer is skipped.

---

## 8. Metrics (Latest Run)

| Metric | Value |
|--------|-------|
| Successful delegation rate (honest) | 100.0% |
| Fail-closed rate (misbehaving) | 100.0% |
| Schema-violation catch rate | 100.0% |
| Average verification latency | ~9.6 ms |

See `RESULTS.md` for full comparison table showing what naive delegation would have let through vs. verified delegation.

---

## 9. Reproducibility

All results reproducible from a fresh clone:

```bash
pnpm install
pnpm build
pnpm eval
pnpm review
```

Expected output: **10/10 scenarios passed**, 100% on all four metrics.

---

## 10. Documentation

- **DESIGN.md** — Public interfaces, failure modes, out-of-scope, open questions, review gate checklist
- **ARCHITECTURE.md** — System architecture and data flow
- **RESULTS.md** — Naive vs. verified delegation comparison, metrics summary
- **NOTES.md** — Why zero-trust between agents matters even when you wrote both sides