# Agent Routing & Fallback Strategy

This document defines how Darb orchestrates coding tasks across available ACP agents to optimize for quality, cost, and token quotas.

## 1. The Tiered Routing Pyramid

| Tier | Level | Primary Agent | Model | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 3** | **Elite** | `claude` | Claude 3.5 | Architecture, complex logic, deep debugging, security audits. |
| **Tier 2** | **Power** | `codex` | OpenAI Codex | Precision implementation, performance tuning, API design. |
| **Tier 1** | **Utility** | `opencode` | NRP Qwen3 / GLM-5 | Boilerplate, unit tests, documentation, general features. |

## 2. Workflow Patterns

### The Pipeline (Complex Tasks)
1. **Blueprint** $\rightarrow$ `claude` (Design & Specs)
2. **Implementation** $\rightarrow$ `codex` or `opencode` (Actual Code)
3. **Verification** $\rightarrow$ `claude` or `opencode (glm-5)` (Logic Review)
4. **Polish** $\rightarrow$ `opencode (gemma)` (Docs & Cleanup)

### The Red Team (Critical Tasks)
- **Build** with `opencode (qwen3)` $\rightarrow$ **Audit** with `claude` $\rightarrow$ **Fix** with `codex`.

## 3. Hard Fallback Chain

If an agent returns a quota error (e.g., `429 Too Many Requests`, `Quota exceeded`), Darb will automatically pivot down the chain:

**`claude`** $\rightarrow$ **`codex`** $\rightarrow$ **`opencode (glm-5)`** $\rightarrow$ **`opencode (qwen3)`**

### Fallback Behavior:
- Detect quota error in `acpx` output.
- Notify user of the pivot.
- Re-submit the prompt to the next agent in the chain.
- Ensure no loss of context by referencing previous output.
