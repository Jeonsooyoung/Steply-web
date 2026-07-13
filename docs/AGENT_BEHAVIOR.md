# Mobile Care Orchestration Agent Behavior

The production Care Agent runs on Android and persists longitudinal state, events, decisions, and action receipts in Room. Web never runs the planner or owns longitudinal personal state; it accepts a strict, session-memory-only projection from Mobile.

## Implementation

- Mobile runner: `Steply-mobile/app/src/main/java/com/steply/app/care/CareAgentRunner.kt`
- Mobile planner and guardrails: `Steply-mobile/app/src/main/java/com/steply/app/care/CarePlanner.kt`
- Room repository: `Steply-mobile/app/src/main/java/com/steply/app/data/repository/CareAgentRepository.kt`
- Android tool adapters: `Steply-mobile/app/src/main/java/com/steply/app/care/android`
- Shared Web contract: `shared/stage4CareAgentContract.cjs`
- Contract and API check: `scripts/check-stage4-care-agent-contract.mjs`

## Agent Elements

The implementation includes:

- `PERCEIVE → EVALUATE → GENERATE_ACTIONS → GUARDRAIL → PRIORITIZE → ACT → OBSERVE → PERSIST`
- Room-owned state, event receipts, decision logs, and causal action idempotency
- deterministic clinical references that the agent cannot mutate
- actual WorkManager, NotificationManager, template report, and Room tools
- failure fallback that preserves the canonical risk, vulnerability, prescription, and approval references

## Goals

Priority order:

1. safety event
2. reported fall
3. HIGH risk or V6/V7
4. declining trend
5. reassessment due
6. low adherence
7. deterministic progression available
8. maintenance

## Policies

The exact wire branches are defined in `shared/stage4CareAgent.contract.json` and mirrored by Mobile enums.

## Tools

The Agent executes `scheduler`, `notifier`, `report_composer`, and `progress_store`. STEADI, V1-V9, and Otago outputs remain immutable deterministic inputs.

## UI Connection

Mobile sends `care-agent.resume` and versioned `care-agent.updated` messages. Web validates and renders `care_agent_projection.v1`, then deletes it with the connected session.

## Validation Command

```bash
npm run stage4:contract:check
npm run stage4:ui:check
```
