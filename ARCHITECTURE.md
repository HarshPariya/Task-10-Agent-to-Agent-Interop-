# Task 10 — A2A Architecture

## Agent-to-Agent Interoperability Across Trust Boundaries

---

## 1. Architecture Overview

Task 10 introduces a controlled interoperability boundary between a
delegating agent and an external agent.

The external agent is treated as untrusted.

The architecture separates:

1. Capability discovery.
2. Protocol contracts.
3. HTTP transport.
4. Delegation orchestration.
5. Response verification.
6. Security checks.
7. Metrics.
8. Deterministic evaluation.

The primary design rule is:

> External-agent output must pass verification before it becomes a
> trusted result.

---

## 2. System Architecture

```text
                              USER TASK
                                  |
                                  v
                       +---------------------+
                       |   Delegating Side   |
                       +----------+----------+
                                  |
                                  v
                       +---------------------+
                       | DelegationService   |
                       +----------+----------+
                                  |
                     +------------+------------+
                     |                         |
                     v                         v
            +------------------+      +----------------+
            | CapabilityClient |      | HandoffClient  |
            +--------+---------+      +-------+--------+
                     |                        |
                     | GET /capabilities      | POST /handoff
                     |                        |
                     +------------+-----------+
                                  |
                                  v
                    ============================
                         TRUST BOUNDARY
                    ============================
                                  |
                                  v
                     +------------------------+
                     | ExternalAgentServer   |
                     +-----------+------------+
                                 |
                                 v
                     +------------------------+
                     | ExternalAgent         |
                     | Implementation        |
                     +-----------+------------+
                                 |
                                 v
                         Untrusted Response
                                 |
                                 v
                     +------------------------+
                     | ResponseVerifier      |
                     +-----------+------------+
                                 |
                 +---------------+---------------+
                 |                               |
                 v                               v
              REJECT                           ACCEPT
                 |                               |
                 v                               v
             Fail Closed                   Trusted Result
```
