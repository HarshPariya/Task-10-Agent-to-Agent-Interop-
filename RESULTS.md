# Task 10 — Evaluation Results

## Agent-to-Agent Interoperability Across Trust Boundaries

---

## 1. Evaluation Overview

Task 10 includes a deterministic golden evaluation suite for validating secure agent-to-agent interoperability.

The evaluation verifies both:

- Successful communication with a trusted-behaving external agent.
- Correct rejection of untrusted or invalid external-agent behavior.

The evaluation dataset is located at:

```text
evals/golden-a2a.jsonl
```

---

## 2. Evaluation Results (Latest Run)

| Scenario | Agent Variant | Expected | Actual | Pass |
|----------|---------------|----------|--------|------|
| honest-01 | honest | accepted | accepted | ✅ |
| honest-02 | honest | accepted | accepted | ✅ |
| honest-03 | honest | accepted | accepted | ✅ |
| honest-04 | honest | accepted | accepted | ✅ |
| honest-05 | honest | accepted | accepted | ✅ |
| honest-06 | honest | accepted | accepted | ✅ |
| lying-01 | capability-lying | rejected | rejected | ✅ |
| lying-02 | capability-lying | rejected | rejected | ✅ |
| injection-01 | injection | rejected | rejected | ✅ |
| injection-02 | injection | rejected | rejected | ✅ |

**Total: 10/10 scenarios passed.**

---

## 3. Metrics Summary

| Metric | Value |
|--------|-------|
| Successful delegation rate (honest) | 100.0% |
| Fail-closed rate (misbehaving) | 100.0% |
| Schema-violation catch rate | 100.0% |
| Average verification latency | 7.31 ms |

---

## 4. Naive vs Verified Delegation Comparison

The core security requirement: **external agent responses are untrusted input until verification succeeds**.

### Naive Delegation (Trust the Response Outright)

A naive implementation would:
1. Query the capability manifest
2. Send the handoff request
3. Accept the response's `result` field directly without validation

### What Naive Delegation Would Have Let Through

| Scenario | Naive Outcome | Verified Outcome | What Naive Missed |
|----------|---------------|------------------|-------------------|
| injection-01 | **ACCEPTED** — Returns `verdict: "supported"` with injection payload in `evidence` | REJECTED — Injection pattern `instruction-override` detected in evidence array | Injection attempt embedded in schema-valid response |
| injection-02 | **ACCEPTED** — Returns valid schema result with hidden instruction | REJECTED — Injection pattern `instruction-execution` detected | Instruction execution attempt in well-formed response |
| lying-01 | **ACCEPTED** — Returns error status as if successful | REJECTED — Capability advertised but returns error; fail-closed | Capability lying: advertises support but fails at runtime |
| lying-02 | **ACCEPTED** — Advertises unsupported capability | REJECTED — Capability not in manifest; fail-closed | Capability lying: advertises nonexistent capability |

### Concrete Impact

| Failure Mode | Naive Delegation Risk | Verified Delegation Mitigation |
|--------------|----------------------|-------------------------------|
| Injection in valid schema | Executes attacker-controlled instruction | Pattern detection rejects before use |
| Capability lying (wrong capability) | Proceeds on false premise | Discovery-time manifest check + fail-closed |
| Capability lying (unsupported capability) | Proceeds on false premise | Discovery-time version check + fail-closed on error status |

---

## 5. Verification Pipeline Effectiveness

The verification pipeline (in order):

1. **Capability Discovery** — Validates manifest structure, protocol version, capability presence
2. **Protocol Contract** — Handoff request/response validated via Zod schemas
3. **Schema Validation** — Response validated against declared output schema (required fields, types, enums, ranges)
4. **Injection Detection** — Recursive text scan for instruction-override, role-manipulation, prompt-extraction, instruction-execution patterns

All four layers executed on every external response. No layer is skipped.

---

## 6. Reproducibility

All results reproducible from a fresh clone:

```bash
pnpm install
pnpm build
pnpm eval
```

Expected output: **10/10 scenarios passed**, 100% on all four metrics.