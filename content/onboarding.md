# PAM Codebase Master Onboarding

This is the living ground-up onboarding document for the PAM workspace.

It is intentionally local-first. Keep it useful for a future engineer who needs
to understand the codebase by following real ticket work, not just by reading a
static architecture page.

## How To Use This Doc

Start here when you are new to PAM or when a ticket exposes a subsystem you do
not understand yet.

Use this doc as the map, then jump to the smaller local notes:

- `/Users/youss/PAM/.ai/onboarding/repo-mental-model.md`
- `/Users/youss/PAM/.ai/onboarding/first-ticket-workflow.md`
- `/Users/youss/PAM/.ai/onboarding/eval-ladder.md`
- `/Users/youss/PAM/.ai/onboarding/ticket-learning-loop.md`
- `/Users/youss/PAM/.ai/onboarding/glossary.md`

When we learn something reusable from a ticket, update this doc in the smallest
place that helps the next engineer. Put deep ticket details in that ticket's run
folder first, then promote only the durable lesson here.

## What PAM Is

PAM is a voice AI assistant for auto dealerships.

At runtime, a customer calls a dealership, PAM answers, and a live conversation
loop runs:

```text
caller audio
  -> speech-to-text
  -> pam-agent-core
  -> current prompt node
  -> LLM response or tool call
  -> text-to-speech
  -> caller audio
```

The important idea: PAM does not run one giant prompt. It runs a
dealership-specific prompt node graph.

Each node is a small state in the conversation. A node owns:

- its prompt
- its allowed tools
- its allowed transitions to other nodes
- often its own model settings
- optionally a shared context prompt

## The Big Runtime Path

Keep this path in your head:

```text
Customer phone call
  -> telephony/Twilio
  -> pam-telephony
  -> pam-agent-core
  -> pam-config-api fetches dealership prompt nodes once at startup
  -> pam-agent-core runs the active node
  -> model either speaks, calls a business tool, or transitions to another node
  -> downstream provider/DMS handles real external effects
```

The highest-leverage distinction is:

- `pam-config-api` decides what behavior is available.
- `pam-agent-core` executes the chosen behavior.
- DMS/providers perform the external side effect.

A local `pam-config-api` server is safe for prompt graph inspection. It does
not sandbox schedule, cancel, reschedule, or appointment-modifying tool calls,
because those execute through `pam-agent-core` toward the provider.

## Repo Map

The PAM workspace has multiple repos under `/Users/youss/PAM/repos`.

| Repo | Role | First question to ask |
| --- | --- | --- |
| `pam-config-api` | Builds dealership-specific prompt node graphs, prompts, tool exposure, flags, and policy surfaces. | Did PAM choose badly because the prompt or graph exposed the wrong behavior? |
| `pam-agent-core` | Runs the conversation loop, current node, model calls, transitions, and tool execution. | Did PAM choose correctly but execute/state-manage badly? |
| `pam-replay-evals` | Replays production calls and freezes ticket repros. | What is the smallest stable oracle for this issue? |
| `pam-telephony` | Call setup, phone routing, pre-agent telephony behavior. | Did the call reach the right client and setup path? |
| `pam-postcall` | After-call analysis, evals, postcall quality/hallucination detection. | Is the issue in post-call interpretation rather than live behavior? |
| `pam-dashboard-ui` | Internal UI for config, calls, eval visibility, and support workflows. | Is the problem presentation or operator workflow? |
| `utility-scripts-js` | Operational helper scripts, including clone setup. | Do we need a dealership clone or support script? |

Default ticket bias: start in `pam-config-api` unless evidence points elsewhere.
Most prompt, routing, tool-availability, policy, and dealership-specific
behavior tickets live there.

## Control Plane Vs Execution Plane

### Control Plane

The control plane defines what PAM can do.

Main owner:

- `pam-config-api`

Common control-plane inputs:

- `ClientInfo`
- feature flags
- modules under `pamConfig`
- `PamContexts`
- per-node model map
- dealership staff/transfer configuration
- prompt templates under `utils/prompts`

Typical control-plane failures:

- wrong node prompt
- wrong edge between nodes
- missing or overexposed tool
- dealership-specific rule missing from `PamContexts`
- wrong active model family for a node
- fallback path promises something no available tool can complete

### Execution Plane

The execution plane runs the graph that the control plane produced.

Main owner:

- `pam-agent-core`

Typical execution-plane failures:

- current node state is wrong
- transition tool is handled incorrectly
- conversation history is lost or duplicated
- tool call arguments are transformed incorrectly
- side effects are executed on the wrong provider path

### Downstream Plane

The downstream plane is the dealership/provider side.

Typical downstream failures:

- DMS rejects a request
- provider availability is wrong or stale
- appointment write succeeds/fails independently of PAM's spoken behavior
- vendor data does not match dealership expectations

For scheduling-like tickets, prove which plane owns the failure using read-only
evidence before running anything that could write to a DMS.

## Prompt Node Graph Fundamentals

The graph is returned by:

```text
GET /v2/prompt-nodes/{clientOrgId}
GET /v2/prompt-nodes/from/{from}/to/{to}
```

The main graph builder is:

```text
/Users/youss/PAM/repos/pam-config-api/utils/promptNodes.js
```

The runtime type shape is:

```text
/Users/youss/PAM/repos/pam-agent-core/src/dependencies/prompts/types.ts
```

A node generally looks like:

```ts
{
  id: "service_intermediate",
  label: "Service Intent Clarification",
  type: "intermediate",
  model: {
    provider: "openai",
    name: "gpt-4.1",
    temperature: 0.2,
    maxTokens: 400
  },
  contextId: "service_inbound_voice_context",
  prompt: "...node-specific instructions...",
  edges: [
    {
      description: "User wants to schedule or reschedule an appointment",
      nextNode: "search_service_availability"
    }
  ],
  tools: [...]
}
```

## Node Types

`context`

Shared prompt context. It is not an active conversation state. Runtime combines
the context prompt with the active node prompt.

Common context nodes:

- `service_inbound_voice_context`
- `sales_inbound_voice_context`
- `oss20b_context`
- `oss20b_receptionist_context`
- `41mini_service_inbound_voice_context`

`start`

The first active node for the call. Usually `intent_classifier`, but transfer
reclaim can make `receptionist` the start node.

`intermediate`

A routing or clarification state. It often decides where the caller's current
intent should go next.

Examples:

- `service_intermediate`
- `search_service_availability`
- `service_request_only`

`function`

A task-focused node with concrete tools. The name does not mean it only calls a
single function; it means the node is an active task node with a tool surface.

Examples:

- `customer_search_function`
- `schedule_service_appointment`
- `cancel_service_appointment`
- `reschedule_service_appointment`
- `check_service_status`
- `sales`
- `schedule_test_drive`

`end`

Supported by the runtime type system, but not the main pattern in the prompt
graph inspected so far.

## Typical Integrated Service Flow

A common service-capable dealership graph looks like:

```text
intent_classifier
  -> receptionist
  -> customer_search_function
      -> service_intermediate
          -> search_service_availability
              -> schedule_service_appointment
              -> reschedule_service_appointment
              -> update_service_appointment
          -> cancel_service_appointment
          -> check_service_status
          -> vehicle_part_order
  -> sales
      -> schedule_test_drive
```

Node responsibilities:

- `intent_classifier`: broad lane selection, such as service, sales, or human.
- `receptionist`: transfer, message-taking, and fallback routing.
- `customer_search_function`: identify customer and vehicle before service work.
- `service_intermediate`: classify the specific service intent.
- `search_service_availability`: collect scheduling inputs and search slots.
- `schedule_service_appointment`: commit a new service appointment.
- `reschedule_service_appointment`: change an existing appointment date/time.
- `update_service_appointment`: modify existing appointment details when split
  reschedule flow is enabled.
- `cancel_service_appointment`: cancel an appointment.
- `check_service_status`: answer current service status questions.
- `sales`: inventory and sales conversation.
- `schedule_test_drive`: sales appointment/test-drive scheduling.

Receptionist can be a detour from an already active service flow. When changing
`receptionist` service-action rules, do not assume every schedule, cancel,
reschedule, or status request should restart at `customer_search_function`.
If conversation history already reached `service_intermediate` or
`search_service_availability`, the generated receptionist edges and prompt
instructions need to resume the highest-progress service node that is available,
with `customer_search_function` only as the fallback for new or unproven service
intake.

## Edges And Transition Tools

In `pam-config-api`, an edge is plain graph data:

```ts
{
  description: "User wants to cancel an existing appointment",
  nextNode: "cancel_service_appointment"
}
```

In `pam-agent-core`, edges become transition tools exposed only from the current
node. For snake-case mode, a transition tool looks like:

```text
go_to_cancel_service_appointment
```

Runtime owner:

```text
/Users/youss/PAM/repos/pam-agent-core/src/agent/base/multi-llm-agent.ts
```

Important behavior:

- The current node determines which transition tools are available.
- PAM should not jump to arbitrary nodes.
- The runtime validates transition targets against the current node's edges.
- Conversation history is carried into the next node.
- Edge nodes are primed to reduce transition latency.

## Tools

A node's `tools` array is the business-action surface available to the model
while that node is active.

Do not confuse tools with edges:

- Edges move to another prompt node.
- Tools do work, such as customer search, transfer, leave message, search
  availability, schedule, cancel, reschedule, status lookup, inventory search,
  or test-drive scheduling.

Tool safety depends on the adapter and provider. Scheduling, cancel,
reschedule, and appointment-modifying tools are DMS write paths until proven
sandbox-safe.

### Tool Call Implementation Map

There are two related tool-call surfaces:

1. Transition tools generated from graph edges, such as
   `go_to_receptionist` or `go_to_search_service_availability`.
2. Business/action tools attached to nodes, such as `transfer_call`,
   `leave_message`, `service_customer_search`, `search_service_availability`,
   `schedule_service_appointment`, `cancel_service_appointment`,
   `search_inventory`, or `schedule_test_drive_or_sales_appointment`.

Main config-side files:

- `/Users/youss/PAM/repos/pam-config-api/utils/constants.js`
  - defines many base tool schemas and adapter `type` values
- `/Users/youss/PAM/repos/pam-config-api/utils/getCustomFunctions.js`
  - selects which custom functions/tools a dealership gets from config
- `/Users/youss/PAM/repos/pam-config-api/utils/promptNodes.js`
  - attaches the resolved tools to specific prompt nodes

Main runtime-side files:

- `/Users/youss/PAM/repos/pam-agent-core/src/agent/types.ts`
  - defines the runtime `ToolCall` shape
- `/Users/youss/PAM/repos/pam-agent-core/src/agent/tools/types.ts`
  - defines `ToolCallConfiguration`, `IToolCallAdapter`, and
    `MultiToolCallAdapter`
- `/Users/youss/PAM/repos/pam-agent-core/src/agent/tools/index.ts`
  - builds adapters by tool `type`
- `/Users/youss/PAM/repos/pam-agent-core/src/agent/base/llm-agent.ts`
  - records tool calls/results in conversation history and dispatches execution
- `/Users/youss/PAM/repos/pam-agent-core/src/agent/base/multi-llm-agent.ts`
  - handles transition tools generated from node edges

Adapter types seen so far:

- `AUTO_FULFILLMENT`: signed HTTP calls to fulfillment endpoints; includes
  scheduling-style tools and many service actions.
- `TELEPHONY`: transfer, end-call, warm-transfer consultation, and destination
  search behavior.
- `TELEPHONY_V2`: newer telephony/directory-backed transfer path.
- `AUTO_SALES`: sales/inventory-related external actions.
- `SERVICE_ENGINE`: service-engine backed agent tool calls.

## Context Prompts And Node Prompts

At runtime, agent-core builds each node's system prompt from:

```text
context prompt + node prompt
```

That means a behavior can be affected by:

- shared context prompt
- node prompt
- model-specific prompt family
- dealership-specific `PamContexts`
- feature flags
- modules/tool availability
- current graph and current node

When a prompt edit seems obvious, first check whether the active node is using
the prompt family you are about to edit. The per-node model map can route a node
to a different prompt family than you expect.

## Model Families And Node Prompts

`pam-config-api/utils/promptNodes.js` chooses model-specific prompt builders.

Common prompt families seen so far:

- default OpenAI/GPT-4.1 prompt family
- `oss-20b`
- `oss-120b`
- `sonnet-4-6`
- `sonic-sales`
- `gpt-4.1-mini` variants

Model settings are resolved per node. The active model family matters because a
fix to one prompt file may not affect production if that dealership's
`nodeModelMap` points the node elsewhere.

## Dealership-Specific Config

Before changing shared prompts, check whether the desired behavior is
dealership-specific.

Important config surfaces:

- `ClientInfo`
- `ClientInfo.pamConfig.modules`
- `ClientInfo.pamConfig.modelProfiles.nodeModelMap`
- feature flags
- `PamContexts-production` or `PamContexts-development`
- transfer/staff routing tables

Rule of thumb:

- "Dealer wants PAM to follow this custom instruction" often starts in
  `PamContexts`.
- "PAM should always route this class of calls differently" may be shared prompt
  or graph logic.
- "PAM had the right instruction but did the wrong thing at runtime" may point
  to `pam-agent-core`.

## Multi-Rooftop Graphs

Some clients can return multiple graphs. In agent-core, the multi-graph adapter
groups nodes by `graphId`, creates one graph agent per rooftop, and injects a
`switch_graph` tool into `intent_classifier` only.

Runtime owner:

```text
/Users/youss/PAM/repos/pam-agent-core/src/agent/tools/adapters/multi-graph.ts
```

Important behavior:

- Nodes may include `graphId`, `clientOrgId`, `graphName`, and `isPrimary`.
- Each graph keeps its own client org for rooftop-specific tool calls.
- `switch_graph` belongs at the top-level routing decision, not every node.
- Other nodes stay single-graph focused after graph selection.

## Data Surfaces

### DynamoDB

Common tables:

- `ClientInfo`: dealership config, feature flags, modules, model maps, pamConfig.
- `PhoneNumberClientMap`: phone number to `clientOrgId`.
- `PamContexts-production` / `PamContexts-development`: dealership AI
  instructions.
- `DealershipStaff-Prod`: staff and transfer data.
- `FeatureFlags-production`: global flags.

Important safety note: `ClientInfo` and phone mapping data can include real
production clients and clones in shared tables. A bad write can affect real
calls immediately.

### Postgres pamdb

Common tables:

- `public."call"`: call metadata.
- `conversations`: transcript.
- `tool_call_executions`: tool calls, arguments, results.

For ticket work, separate:

- caller-visible failure: what the caller heard or experienced
- ops-reviewed report: the primary starting map when available
- raw transcript: supplemental evidence that can contain ASR/audio-to-text noise
- backend truth: tool calls, node transitions, results, writes, provider errors

## Local Investigation Helpers

Read-only helpers live under:

```text
/Users/youss/PAM/scripts/pam-support
```

Key helpers:

- `pamdbq.py`: bounded Postgres support queries.
- `pamdyn.py`: compact read-only DynamoDB shortcuts.
- `setup-check.sh`: local setup smoke check.
- `verify-dms-safety.sh`: provider safety check before write-path tests.

Use these for evidence gathering. They do not make live DMS write-path testing
safe by themselves.

## Default Ticket Debugging Split

Classify a behavior into one of three buckets:

`decision problem`

PAM chose the wrong branch, prompt, policy, or tool option.

Likely first repo:

```text
pam-config-api
```

`execution problem`

PAM chose the right thing, but runtime state, transition handling, or tool
execution was wrong.

Likely first repo:

```text
pam-agent-core
```

`downstream problem`

PAM chose and executed correctly, but the provider/integration returned bad data
or failed.

Likely owner:

```text
DMS/provider integration or data investigation
```

## Default Ticket Workflow

For a fresh ticket:

1. Normalize the ticket intake.
2. Extract client/org, rooftop, call IDs, integration/provider, problem node,
   model family, and existing investigation hints.
3. Classify the repair queue and behavior family.
4. Choose one stable oracle.
5. Declare the writable surface.
6. Run baseline before editing.
7. Make one narrow change.
8. Re-run the same oracle.
9. Run the nearest guardrail.
10. Keep or revert mechanically.
11. Log the result and promote reusable learning.

Good local run folder:

```text
/Users/youss/PAM/playbooks/autonomous-ticket-repair/runs/<ticket-or-slug>/
  intake.md
  ticket-program.md
  notes.md
  learning.md
  artifacts/
```

### Dashboard Call Detail Pasted Into A Ticket

A dashboard call-detail URL is usually enough to anchor the first pass without
asking for more identifiers. Parse:

```text
https://dashboard.pamhq.com/call-detail/<call_id>/<url_encoded_timestamp>?clientOrgId=<org_id>
```

Use the URL for `call_id`, timestamp, and `clientOrgId`. Use the copied
dashboard pane for support-facing context like caller, vehicle, department,
duration, status, resolution reason, visible transcript, and visible workflow
labels.

The dashboard paste is intake, not proof. It can mix generated summaries,
operator status, copied nav text, transcript snippets, and workflow labels in one
blob. Preserve the raw paste first, then split it into evidence lanes:

```text
ticket/investigation claims
dashboard UI metadata and generated summary
copied transcript and workflow labels, with ASR-noise caveats
backend telemetry from pamdb/config/replay/logs
```

Transcript wording is useful, but it is not always the primary surface. The
audio-to-text layer can mishear services, names, mileage, advisor names, and
short clarifications. When an ops-reviewed ticket report or investigation report
exists, use that as the primary failure statement and use the transcript to
locate turns and check timing. Promote transcript text to the primary surface
only when the behavior family is transcription accuracy or the report itself
depends on a specific spoken-word claim that has been checked.

For workflow labels, be precise: copied `Workflow Triggered` / `Go To ...` rows
are node-transition evidence. They are not proof that a customer search,
availability lookup, transfer, schedule, cancel, reschedule, or message-taking
business tool executed. Check `tool_call_executions` before choosing the repo or
blaming the DMS.

## Verification Ladder

Treat verification as a stack:

1. Ticket-specific replay case.
2. Active replay family or ORAG coverage.
3. Targeted SAM regression suite.
4. Broader SAM groups only when blast radius justifies it.

For `pam-config-api` prompt/routing/policy changes, the default shape is:

```text
replay historical baseline
  -> replay live rerun against local config-api
  -> narrow SAM regression suite
```

Examples of narrow SAM suites:

```bash
npm run test:sam:regression:receptionist
npm run test:sam:regression:sales
npm run test:sam:regression:reschedule
npm run test:sam:regression:service-request-routing
npm run test:sam:regression:transport-phrasing
```

If a ticket cannot be covered by at least one stable oracle and one nearby
guardrail lane, say so explicitly.

## DMS Write-Path Safety

Scheduling, cancel, reschedule, availability-plus-booking, and
appointment-modifying tests can hit real dealership systems.

Default rule:

```text
Do not run write-path tests unless provider safety is verified.
```

Safe-ish only after explicit confirmation:

- verified Xtime sandbox clone

Treat as live by default:

- Autoloop/Affinitiv
- Tekion
- WiAdvisor
- MyKaarma
- unknown provider
- unverified clone

Preferred safe evidence lanes:

- replay evals
- SAM prompt/routing tests
- transcript inspection
- read-only tool call inspection
- config graph inspection

## Prompt Fix Pre-Mortem

Before calling a prompt or routing fix ready, answer:

1. What later prompt block could override this instruction?
2. What tool or route completes the caller-facing offer?
3. Is that tool always available on the affected rooftop/path?
4. What required fields does the tool need?
5. Is the prompt allowed to collect every required field?
6. What did production do after the failure?
7. Which nearby guardrail is most likely to regress?

If the answer depends on "the model should infer it," the contract is weak.
Make the route explicit or add a guardrail.

## Current Codebase Lessons

### Lesson: Nodes Are The Primary Unit Of Conversation Behavior

When debugging a call, identify the current node early. The active node usually
tells you which prompt, tools, model family, and transition choices matter.

### Lesson: Spoken Summary And Backend Truth Can Diverge

A ticket may say "PAM scheduled" or "PAM transferred," but backend truth might
show only a route transition, a failed tool call, or a spoken offer with no
tool execution. Always inspect tool calls and node transitions when available.

### Lesson: Dashboard Paste Is Intake, Not Oracle

Dashboard call-detail pages are useful because they often carry the call ID,
`clientOrgId`, transcript, visible workflow labels, and support resolution state
in one paste. Treat those fields as a fast starting map. The fixed oracle still
comes from replay, a deterministic test, or another stable backend repro, and
backend telemetry decides whether a visible workflow label was only a node
transition or a real business tool execution.

### Lesson: Transcripts Are Supplemental Unless ASR Is The Ticket

Raw call transcripts can be noisy because speech-to-text may mishear names,
services, mileage, advisor preferences, or interrupted turns. When ops has
already reviewed the call and written an investigation report, use that report
as the primary map. Use transcript text to locate and corroborate the failure,
not as the first fix surface unless the ticket is about transcription accuracy.

### Lesson: Config API Does Not Execute DMS Writes

`pam-config-api` controls prompts, routing, graph shape, and tool exposure. It
does not make scheduling/cancel/reschedule tests safe. The write path goes
through `pam-agent-core` to the DMS provider.

### Lesson: Active Model Family Matters Before Prompt Edits

The node model map can select different prompt families per node. Verify the
active model family before editing only one prompt file.

### Lesson: Fallback Offers Need Follow-Through Contracts

A fallback is incomplete if PAM offers something that no available route or tool
can complete. Check trigger condition, caller-facing offer, route, tool
availability, required arguments, and whether the prompt can collect those
arguments.

## Glossary Seeds

`prompt node graph`

A state-machine-like graph where each node has its own prompt, allowed tools,
and possible transitions.

`current node`

The active prompt state that owns the next model decision.

`edge`

A permitted transition from one node to another.

`transition tool`

The runtime tool generated from an edge, such as `go_to_receptionist`.

`business tool`

A tool that performs work or fetches data, such as customer search, transfer,
availability search, scheduling, cancellation, status check, or inventory search.

`oracle`

The fixed artifact that says whether the ticket improved.

`guardrail`

A nearby check that must not get worse while fixing the target ticket.

`writable surface`

The smallest code or config area allowed to change for the current repair loop.

`PamContexts`

Dealership-specific AI instructions stored in DynamoDB.

`model map`

Per-dealership, per-node model selection, usually under
`ClientInfo.pamConfig.modelProfiles.nodeModelMap`.

`DMS write path`

Any path that can create, cancel, reschedule, or modify a real appointment.

## How To Keep Building This

Append new lessons in one of these places:

- Add architecture or repo ownership lessons to `Current Codebase Lessons`.
- Add new subsystem maps as new top-level sections.
- Add ticket-specific details to that ticket's `learning.md` first.
- Promote only durable, repeated lessons from ticket notes into this master doc.
- If a lesson is a debugging rule, also consider
  `/Users/youss/PAM/.ai/memory-bank/patterns.md` or
  `/Users/youss/PAM/.ai/memory-bank/anti-patterns.md`.

Every update should answer at least one future-engineer question:

- What owns this behavior?
- How does control flow through it?
- What evidence proves it?
- What is dangerous to test live?
- What should I inspect first next time?
