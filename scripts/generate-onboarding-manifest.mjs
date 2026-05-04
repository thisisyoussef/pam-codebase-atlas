import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const root = process.cwd();
const sourcePath = path.resolve(root, process.env.ONBOARDING_MD_PATH ?? "content/onboarding.md");
const outPath = path.resolve(root, "src/generated/onboarding-manifest.json");
const generatedAt = new Date().toISOString();

const FlowNode = z.object({
  id: z.string(),
  label: z.string(),
  repo: z.string(),
  plane: z.enum(["entry", "control", "execution", "downstream", "evidence", "regression"]),
  summary: z.string(),
  next: z.array(z.string()),
  firstFiles: z.array(z.string()),
  signals: z.array(z.string()),
});

const Repo = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  plane: z.enum(["control", "execution", "downstream", "evidence", "regression", "interface", "ops"]),
  firstQuestion: z.string(),
  inspectFirst: z.array(z.string()),
  ticketSignals: z.array(z.string()),
  commonTrap: z.string(),
});

const TicketMode = z.object({
  id: z.string(),
  label: z.string(),
  family: z.string(),
  callerVisibleFailure: z.string(),
  backendTruthToCheck: z.string(),
  likelyFirstRepo: z.string(),
  oracle: z.string(),
  guardrail: z.string(),
});

const EvidenceLane = z.object({
  id: z.string(),
  label: z.string(),
  purpose: z.string(),
  source: z.string(),
  trustLevel: z.enum(["primary", "supporting", "unsafe_without_confirmation"]),
  firstMove: z.string(),
});

const SafetyRule = z.object({
  id: z.string(),
  label: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  rule: z.string(),
  whyItMatters: z.string(),
});

const GuidedTour = z.object({
  id: z.string(),
  title: z.string(),
  audience: z.string(),
  steps: z.array(z.string()),
  takeaway: z.string(),
});

const LearningStep = z.object({
  id: z.string(),
  label: z.string(),
  prompt: z.string(),
  output: z.string(),
});

const ManifestSchema = z.object({
  generatedAt: z.string(),
  sourcePath: z.string(),
  sourceSha: z.string(),
  sourceTitle: z.string(),
  hero: z.object({
    headline: z.string(),
    subhead: z.string(),
    primaryAction: z.string(),
    secondaryAction: z.string(),
  }),
  architectureNarrative: z.string(),
  systemFlow: z.array(FlowNode),
  repos: z.array(Repo),
  ticketModes: z.array(TicketMode),
  evidenceLanes: z.array(EvidenceLane),
  safetyRules: z.array(SafetyRule),
  guidedTours: z.array(GuidedTour),
  learningLoop: z.array(LearningStep),
  changelog: z.array(z.string()),
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function firstHeading(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "PAM Codebase Atlas";
}

function headingList(markdown) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .slice(0, 12);
}

function baseManifest(markdown, sourceSha) {
  const headings = headingList(markdown);

  return {
    generatedAt,
    sourcePath: path.relative(root, sourcePath),
    sourceSha,
    sourceTitle: firstHeading(markdown),
    hero: {
      headline: "PAM Codebase Atlas",
      subhead:
        "A live workbench for learning how PAM moves from a dealership phone call to prompt graph decisions, runtime execution, provider side effects, and replay proof.",
      primaryAction: "Trace the runtime",
      secondaryAction: "Open ticket mode",
    },
    architectureNarrative:
      "PAM works best when engineers separate the control plane from the execution plane. pam-config-api decides which prompt nodes, tools, edges, and policies are available. pam-agent-core runs the selected node and executes tools. Replay and SAM guardrails prove whether the behavior changed safely.",
    systemFlow: [
      {
        id: "caller",
        label: "Caller",
        repo: "external",
        plane: "entry",
        summary: "Customer audio enters through dealership telephony and becomes the live conversation input.",
        next: ["telephony"],
        firstFiles: [],
        signals: ["call-detail URL", "caller-visible symptom", "timestamp"],
      },
      {
        id: "telephony",
        label: "pam-telephony",
        repo: "pam-telephony",
        plane: "entry",
        summary: "Sets up the call, maps phone numbers to clients, and routes into the agent runtime.",
        next: ["agent-core"],
        firstFiles: ["repos/pam-telephony"],
        signals: ["wrong client", "call setup", "pre-agent routing"],
      },
      {
        id: "config-api",
        label: "pam-config-api",
        repo: "pam-config-api",
        plane: "control",
        summary: "Builds the dealership-specific prompt node graph: prompts, edges, tools, flags, and policy.",
        next: ["agent-core"],
        firstFiles: ["repos/pam-config-api/utils/promptNodes.js", "repos/pam-config-api/utils/prompts"],
        signals: ["bad prompt behavior", "bad routing", "wrong tool exposure"],
      },
      {
        id: "agent-core",
        label: "pam-agent-core",
        repo: "pam-agent-core",
        plane: "execution",
        summary: "Runs the current node, sends model calls, executes transitions, and calls business tools.",
        next: ["provider", "evidence"],
        firstFiles: ["repos/pam-agent-core/src/dependencies/prompts/types.ts"],
        signals: ["state loss", "tool execution bug", "transition handled incorrectly"],
      },
      {
        id: "provider",
        label: "DMS / Provider",
        repo: "external",
        plane: "downstream",
        summary: "Handles real service side effects such as schedule, cancel, reschedule, and availability.",
        next: ["evidence"],
        firstFiles: [],
        signals: ["write-path risk", "provider rejection", "appointment side effect"],
      },
      {
        id: "evidence",
        label: "pamdb + DynamoDB",
        repo: "data",
        plane: "evidence",
        summary: "Read-only evidence layer for call metadata, transcripts, tool executions, flags, and contexts.",
        next: ["replay"],
        firstFiles: ["scripts/pam-support/pamdbq.py", "scripts/pam-support/pamdyn.py"],
        signals: ["tool_call_executions", "PamContexts", "ClientInfo"],
      },
      {
        id: "replay",
        label: "Replay + SAM",
        repo: "pam-replay-evals / pam-config-api",
        plane: "regression",
        summary: "Freezes ticket repros, reruns live prompts, and checks nearby functional guardrails.",
        next: [],
        firstFiles: ["repos/pam-replay-evals", "repos/pam-config-api/test/sam"],
        signals: ["fixed oracle", "historical baseline", "nearby guardrail"],
      },
    ],
    repos: [
      {
        id: "pam-config-api",
        name: "pam-config-api",
        role: "Control plane for prompt nodes, graph shape, tool exposure, flags, and policy behavior.",
        plane: "control",
        firstQuestion: "Did PAM choose badly because the graph or prompt exposed the wrong behavior?",
        inspectFirst: ["utils/promptNodes.js", "utils/prompts", "test/sam/regression_evaluations"],
        ticketSignals: ["bad routing", "prompt contradiction", "missing tool", "dealership-specific behavior"],
        commonTrap: "Changing shared prompts before checking PamContexts, feature flags, active model, and tool availability.",
      },
      {
        id: "pam-agent-core",
        name: "pam-agent-core",
        role: "Execution plane for live conversation state, model calls, node transitions, and tool execution.",
        plane: "execution",
        firstQuestion: "Was the chosen behavior correct, but runtime execution or state management wrong?",
        inspectFirst: ["src/dependencies/prompts/types.ts", "tool execution handlers", "conversation orchestration"],
        ticketSignals: ["state lost", "tool args transformed incorrectly", "transition executed incorrectly"],
        commonTrap: "Assuming a local config-api run protects scheduling tests; agent-core still owns DMS write execution.",
      },
      {
        id: "pam-replay-evals",
        name: "pam-replay-evals",
        role: "Oracle lab for reconstructing calls and comparing historical versus live behavior.",
        plane: "evidence",
        firstQuestion: "What is the smallest fixed artifact that proves this ticket passes or fails?",
        inspectFirst: ["README.md", "static_evals", "ORAG_ACTIVE_EVALS_EXPLAINED.md"],
        ticketSignals: ["real call", "nondeterministic behavior", "before/after prompt validation"],
        commonTrap: "Editing the repro while fixing the behavior, which destroys the oracle.",
      },
      {
        id: "pam-dashboard-ui",
        name: "pam-dashboard-ui",
        role: "Internal operator interface for calls, eval visibility, and support workflows.",
        plane: "interface",
        firstQuestion: "Is the bug in presentation or operator workflow rather than live behavior?",
        inspectFirst: ["repos/pam-dashboard-ui"],
        ticketSignals: ["dashboard status mismatch", "copied call details", "support summary confusion"],
        commonTrap: "Treating UI summaries as backend truth before checking tool executions.",
      },
    ],
    ticketModes: [
      {
        id: "false-scheduling",
        label: "False scheduling",
        family: "false_scheduling",
        callerVisibleFailure: "PAM sounded like scheduling happened, failed, or was attempted.",
        backendTruthToCheck: "Did a schedule or availability business tool actually run?",
        likelyFirstRepo: "pam-config-api unless tool execution evidence says pam-agent-core",
        oracle: "Ticket-specific replay case from the real call.",
        guardrail: "SAM service-request-routing or reschedule suite, depending on path.",
      },
      {
        id: "bad-routing",
        label: "Bad node routing",
        family: "bad_routing_between_nodes",
        callerVisibleFailure: "The caller was sent into the wrong conversation path.",
        backendTruthToCheck: "Which prompt node owned the transition and which edge was exposed?",
        likelyFirstRepo: "pam-config-api",
        oracle: "Replay live prompt rerun against the same call turn.",
        guardrail: "Nearest receptionist, sales, or service routing SAM suite.",
      },
      {
        id: "transfer-accuracy",
        label: "Transfer accuracy",
        family: "transfer_accuracy",
        callerVisibleFailure: "PAM transferred to the wrong person, group, or fallback.",
        backendTruthToCheck: "Staff mapping, routing config, and actual transfer tool result.",
        likelyFirstRepo: "pam-config-api or pam-telephony depending on call setup evidence.",
        oracle: "Transcript plus transfer tool execution evidence.",
        guardrail: "Targeted transfer or receptionist regression lane.",
      },
    ],
    evidenceLanes: [
      {
        id: "ops-report",
        label: "Ops-reviewed report",
        purpose: "Use as the first map when a ticket includes a TL;DR, node path, model, or suggested surface.",
        source: "Ticket narrative or investigation report",
        trustLevel: "primary",
        firstMove: "Extract rooftop, clientOrgId, problem node, model, suggested surface, and related family.",
      },
      {
        id: "dashboard-copy",
        label: "Dashboard copy",
        purpose: "Useful for identifiers, workflow labels, status, and transcript location.",
        source: "dashboard.pamhq.com call-detail paste",
        trustLevel: "supporting",
        firstMove: "Parse call ID, timestamp, clientOrgId, status, resolution, and workflow labels.",
      },
      {
        id: "tool-exec",
        label: "Tool executions",
        purpose: "Determines whether a business tool actually ran.",
        source: "pamdb tool_call_executions",
        trustLevel: "primary",
        firstMove: "Check args, result, provider path, and whether the write path was touched.",
      },
      {
        id: "live-write",
        label: "Live write-path testing",
        purpose: "Only for confirmed sandbox-safe provider paths.",
        source: "pam-agent-core tool execution against DMS",
        trustLevel: "unsafe_without_confirmation",
        firstMove: "Stop unless provider and clone safety are explicitly verified.",
      },
    ],
    safetyRules: [
      {
        id: "dms-write",
        label: "DMS write path",
        severity: "critical",
        rule: "Do not run schedule, cancel, reschedule, or appointment-modifying tests until provider safety is verified.",
        whyItMatters: "pam-agent-core can call real dealership systems even when config-api is local.",
      },
      {
        id: "context-first",
        label: "Dealership context first",
        severity: "warning",
        rule: "For dealership-specific rules, check PamContexts before shared prompt edits.",
        whyItMatters: "A shared prompt change can widen blast radius when a local context rule would solve the ticket.",
      },
      {
        id: "fixed-oracle",
        label: "Frozen oracle",
        severity: "warning",
        rule: "Choose one replay, unit, integration, or CLI repro before editing and do not rewrite it during the fix.",
        whyItMatters: "Without a fixed oracle, a passing result can mean the target moved rather than the behavior improved.",
      },
    ],
    guidedTours: [
      {
        id: "first-ticket",
        title: "First ticket route",
        audience: "New engineer",
        steps: [
          "Read the ticket report before raw transcript spelunking.",
          "Name the behavior family and likely system boundary.",
          "Check whether the business tool actually ran.",
          "Freeze the target oracle before editing.",
        ],
        takeaway: "Most PAM tickets become tractable once caller-visible failure and backend truth are separated.",
      },
      {
        id: "prompt-routing",
        title: "Prompt routing route",
        audience: "Prompt or policy fix",
        steps: [
          "Identify active node and model family.",
          "Find the graph edge or prompt block that exposed the behavior.",
          "Check later prompt blocks for contradictions.",
          "Run replay live rerun and the nearest SAM guardrail.",
        ],
        takeaway: "Prompt fixes are graph contracts; they must align with route, tool availability, and required arguments.",
      },
    ],
    learningLoop: [
      {
        id: "failure",
        label: "Caller-visible failure",
        prompt: "What did the caller experience?",
        output: "One sentence that a support engineer and backend engineer would both understand.",
      },
      {
        id: "truth",
        label: "Backend truth",
        prompt: "What did the system actually do?",
        output: "Tool calls, active node, model family, and provider path when relevant.",
      },
      {
        id: "surface",
        label: "Fix surface",
        prompt: "Which repo owns the decision or execution mistake?",
        output: "Smallest writable surface with the strongest evidence.",
      },
      {
        id: "proof",
        label: "Proof",
        prompt: "Which oracle and guardrail will keep or revert the change?",
        output: "Replay/SAM/unit command with a clear pass condition.",
      },
    ],
    changelog: headings.length
      ? headings.map((heading) => `Source section available: ${heading}`)
      : ["Initial generated manifest from onboarding Markdown."],
  };
}

function mergeWithFallback(modelManifest, fallback) {
  return {
    ...fallback,
    ...modelManifest,
    generatedAt,
    sourcePath: fallback.sourcePath,
    sourceSha: fallback.sourceSha,
    sourceTitle: modelManifest.sourceTitle || fallback.sourceTitle,
    hero: modelManifest.hero ?? fallback.hero,
    systemFlow: modelManifest.systemFlow?.length ? modelManifest.systemFlow : fallback.systemFlow,
    repos: modelManifest.repos?.length ? modelManifest.repos : fallback.repos,
    ticketModes: modelManifest.ticketModes?.length ? modelManifest.ticketModes : fallback.ticketModes,
    evidenceLanes: modelManifest.evidenceLanes?.length ? modelManifest.evidenceLanes : fallback.evidenceLanes,
    safetyRules: modelManifest.safetyRules?.length ? modelManifest.safetyRules : fallback.safetyRules,
    guidedTours: modelManifest.guidedTours?.length ? modelManifest.guidedTours : fallback.guidedTours,
    learningLoop: modelManifest.learningLoop?.length ? modelManifest.learningLoop : fallback.learningLoop,
    changelog: modelManifest.changelog?.length ? modelManifest.changelog : fallback.changelog,
  };
}

async function buildWithLlm(markdown, fallback) {
  if (!process.env.OPENAI_API_KEY || process.env.DISABLE_LLM === "1") {
    if (process.env.REQUIRE_LLM === "1") {
      throw new Error("REQUIRE_LLM=1 but OPENAI_API_KEY is not set.");
    }
    return fallback;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1";

  const response = await openai.responses.parse({
    model,
    input: [
      {
        role: "system",
        content:
          "You turn PAM onboarding Markdown into a concise, visually rich web atlas manifest. Preserve safety boundaries. Do not invent secret values. Prefer concrete repo ownership, runtime flow, evidence lanes, and verification language. Keep arrays compact and useful for a team-facing onboarding product.",
      },
      {
        role: "user",
        content: `Source Markdown path: ${fallback.sourcePath}\nSource SHA: ${fallback.sourceSha}\n\n${markdown}`,
      },
    ],
    text: {
      format: zodTextFormat(ManifestSchema, "pam_codebase_atlas_manifest"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI returned no parsed atlas manifest.");
  }

  return mergeWithFallback(response.output_parsed, fallback);
}

async function main() {
  const markdown = fs.readFileSync(sourcePath, "utf8");
  const sourceSha = sha256(markdown).slice(0, 12);
  const fallback = baseManifest(markdown, sourceSha);
  const manifest = await buildWithLlm(markdown, fallback);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(ManifestSchema.parse(manifest), null, 2)}\n`);
  console.log(`Generated ${path.relative(root, outPath)} from ${path.relative(root, sourcePath)} (${sourceSha})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
