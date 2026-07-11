# Care Orchestration Agent Behavior

This document describes the deterministic Care Orchestration Agent. The agent plans actions from immutable assessment, finding, risk, and exercise-plan outputs. It does not generate or modify clinical findings, risk levels, CDC cutoffs, or exercise selections.

## Implementation

- Agent: `client/src/pipeline/agent/careAgent.js`
- Agent state types: `client/src/pipeline/agent/agentTypes.js`
- UI session flow adapter: `client/src/pipeline/ui/sessionFlow.js`
- Agent check: `scripts/check-care-agent-loop.mjs`
- Internal validation: `scripts/check-internal-validation.mjs`

## Agent Elements

The implementation includes:

- persistent state
- prioritized goals
- tool registry
- observations
- deterministic policy planner
- action plan
- tool execution
- execution-result observation
- replan/fallback on failure
- decision log
- safe fallback

## Goals

Priority order:

1. comply with safety rules
2. avoid missing professional escalation
3. perform valid reassessments
4. improve exercise sustainability
5. reduce repeated invalid assessments
6. detect functional change early

## Policies

Implemented policies:

- `SAFETY_EVENT`
- `REPEATED_INVALID_ASSESSMENTS`
- `DECLINING_SCORE_TREND`
- `LOW_ADHERENCE`
- `PROGRESSION_AVAILABLE`
- `EXERCISE_PRACTICE`
- `MAINTENANCE`
- `TOOL_FAILURE_FALLBACK`
- `STORAGE_FAILURE_FALLBACK`

## Tools

Registered tool ids include:

- `readProgressState`
- `requestAssessment`
- `scheduleReassessment`
- `createSessionPlan`
- `getExercisePlan`
- `checkProgressionEligibility`
- `sendReminder`
- `requestCameraSetupTutorial`
- `composeWeeklyReport`
- `notifyCaregiver`
- `createProfessionalReviewRequest`
- `recordAgentDecision`

## UI Connection

The main user flow reads the agent/session plan through:

- `client/src/pipeline/ui/sessionFlow.js`
- `client/src/App.jsx`
- `client/src/components/JourneyFlow.jsx`

Session plan modes currently interpreted by UI include:

- `camera_setup_first`
- `split_session`
- `suspend_for_review`
- `progression_approval_required`
- `standard`

## Validation Command

```bash
npm run care:agent:check
npm run validation:check
```

The current validation result is in `docs/VALIDATION_REPORT.md`.
