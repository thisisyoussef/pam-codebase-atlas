import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileCode2,
  FileText,
  GitBranch,
  LockKeyhole,
  Play,
  RadioTower,
  Route,
  ServerCog,
  ShieldAlert,
  Sparkles,
  TestTube2,
} from "lucide-react";
import manifestJson from "./generated/onboarding-manifest.json";
import type { AtlasManifest, EvidenceLane, FlowNode, GuidedTour, Repo, SafetyRule, TicketMode } from "./types";

const manifest = manifestJson as AtlasManifest;

const planeIcons = {
  entry: RadioTower,
  control: GitBranch,
  execution: ServerCog,
  downstream: ShieldAlert,
  evidence: Database,
  regression: TestTube2,
};

const severityLabels = {
  info: "Info",
  warning: "Guardrail",
  critical: "Stop point",
};

const trustLabels = {
  primary: "Primary evidence",
  supporting: "Supporting signal",
  unsafe_without_confirmation: "Unsafe without confirmation",
};

const sampleTicket = `dashboard.pamhq.com/call-detail/call_abc123/2026-05-04T14%3A32%3A00Z?clientOrgId=clone_f6919e98

Caller said they wanted to schedule service. Dashboard says booking failed, but the workflow shows receptionist -> service_intermediate -> message taking.`;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function decompileTicket(input: string, modes: TicketMode[]) {
  const text = input.trim();
  const lower = text.toLowerCase();
  const callId = text.match(/call-detail\/([^/\s?]+)/)?.[1] ?? text.match(/\bcall[_-][a-z0-9_-]+/i)?.[0] ?? "not detected";
  const clientOrgId = text.match(/clientOrgId=([^&\s]+)/)?.[1] ?? text.match(/\bclone_[a-z0-9-]+/i)?.[0] ?? "not detected";

  let mode = modes[0];
  if (lower.includes("transfer")) {
    mode = modes.find((candidate) => candidate.family.includes("transfer")) ?? mode;
  } else if (lower.includes("routing") || lower.includes("wrong node") || lower.includes("receptionist")) {
    mode = modes.find((candidate) => candidate.family.includes("routing")) ?? mode;
  } else if (lower.includes("schedule") || lower.includes("booking") || lower.includes("appointment")) {
    mode = modes.find((candidate) => candidate.family.includes("scheduling")) ?? mode;
  }

  const writeRisk =
    lower.includes("schedule") || lower.includes("booking") || lower.includes("cancel") || lower.includes("reschedule");

  return {
    callId,
    clientOrgId,
    family: mode?.family ?? "needs_classification",
    label: mode?.label ?? "Needs classification",
    callerVisibleFailure: mode?.callerVisibleFailure ?? "Need a support report or transcript snippet.",
    backendTruthToCheck: mode?.backendTruthToCheck ?? "Check active node, tool calls, and source config.",
    firstRepo: mode?.likelyFirstRepo ?? "pam-config-api by default, unless evidence points elsewhere.",
    oracle: mode?.oracle ?? "Create a fixed replay or deterministic repro before editing.",
    guardrail: mode?.guardrail ?? "Run the nearest SAM or replay family guardrail.",
    safety: writeRisk
      ? "Appointment write-path language detected. Use replay, SAM, transcript, or read-only telemetry until provider safety is verified."
      : "No obvious appointment write-path language detected.",
  };
}

function FlowNodeButton({
  node,
  active,
  onSelect,
}: {
  node: FlowNode;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = planeIcons[node.plane];
  return (
    <button
      className={`flow-node ${active ? "flow-node-active" : ""}`}
      onClick={() => onSelect(node.id)}
      title={`Inspect ${node.label}`}
    >
      <span className="flow-icon">
        <Icon size={18} />
      </span>
      <span>
        <strong>{node.label}</strong>
        <small>{node.plane}</small>
      </span>
    </button>
  );
}

function Inspector({ node }: { node: FlowNode }) {
  const Icon = planeIcons[node.plane];
  return (
    <motion.aside
      key={node.id}
      className="inspector"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="inspector-title">
        <span className="inspector-icon">
          <Icon size={22} />
        </span>
        <div>
          <p>{node.plane}</p>
          <h3>{node.label}</h3>
        </div>
      </div>
      <p className="inspector-summary">{node.summary}</p>
      <div className="inspector-block">
        <h4>Inspect first</h4>
        {node.firstFiles.length ? (
          <ul>
            {node.firstFiles.map((file) => (
              <li key={file}>
                <FileCode2 size={14} />
                <code>{file}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p>External or caller-owned surface.</p>
        )}
      </div>
      <div className="signal-list">
        {node.signals.map((signal) => (
          <span key={signal}>{signal}</span>
        ))}
      </div>
    </motion.aside>
  );
}

function RepoStrip({ repos }: { repos: Repo[] }) {
  return (
    <div className="repo-strip">
      {repos.map((repo) => (
        <article className="repo-row" key={repo.id}>
          <div>
            <p>{repo.plane}</p>
            <h3>{repo.name}</h3>
          </div>
          <p>{repo.role}</p>
          <div className="repo-detail">
            <span>{repo.firstQuestion}</span>
            <strong>{repo.commonTrap}</strong>
          </div>
        </article>
      ))}
    </div>
  );
}

function EvidenceLaneRow({ lane }: { lane: EvidenceLane }) {
  return (
    <article className={`evidence-row evidence-${lane.trustLevel}`}>
      <div>
        <p>{trustLabels[lane.trustLevel]}</p>
        <h3>{lane.label}</h3>
      </div>
      <p>{lane.purpose}</p>
      <small>{lane.source}</small>
      <strong>{lane.firstMove}</strong>
    </article>
  );
}

function SafetyRow({ rule }: { rule: SafetyRule }) {
  return (
    <article className={`safety-row safety-${rule.severity}`}>
      <span>{severityLabels[rule.severity]}</span>
      <div>
        <h3>{rule.label}</h3>
        <p>{rule.rule}</p>
        <small>{rule.whyItMatters}</small>
      </div>
    </article>
  );
}

function TourPanel({ tour }: { tour: GuidedTour }) {
  return (
    <article className="tour-panel">
      <div className="tour-heading">
        <Play size={18} />
        <div>
          <p>{tour.audience}</p>
          <h3>{tour.title}</h3>
        </div>
      </div>
      <ol>
        {tour.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <strong>{tour.takeaway}</strong>
    </article>
  );
}

function App() {
  const [activeNodeId, setActiveNodeId] = useState(manifest.systemFlow[0]?.id ?? "");
  const [ticketText, setTicketText] = useState(sampleTicket);
  const [activeModeId, setActiveModeId] = useState(manifest.ticketModes[0]?.id ?? "");

  const activeNode = useMemo(
    () => manifest.systemFlow.find((node) => node.id === activeNodeId) ?? manifest.systemFlow[0],
    [activeNodeId],
  );
  const activeMode = useMemo(
    () => manifest.ticketModes.find((mode) => mode.id === activeModeId) ?? manifest.ticketModes[0],
    [activeModeId],
  );
  const ticketRead = useMemo(() => decompileTicket(ticketText, manifest.ticketModes), [ticketText]);

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => scrollToId("hero")} title="Back to top">
          <span>PAM</span>
          <strong>Codebase Atlas</strong>
        </button>
        <nav>
          <button onClick={() => scrollToId("runtime")}>Runtime</button>
          <button onClick={() => scrollToId("tickets")}>Tickets</button>
          <button onClick={() => scrollToId("factory")}>Factory</button>
        </nav>
        <div className="source-chip" title="Generated source version">
          <Sparkles size={16} />
          <span>{manifest.sourceSha}</span>
        </div>
      </header>

      <section className="hero" id="hero">
        <div className="hero-grid">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48 }}
          >
            <h1>{manifest.hero.headline}</h1>
            <p>{manifest.hero.subhead}</p>
            <div className="hero-actions">
              <button className="primary-action" onClick={() => scrollToId("runtime")}>
                <Route size={18} />
                {manifest.hero.primaryAction}
              </button>
              <button className="secondary-action" onClick={() => scrollToId("tickets")}>
                <FileText size={18} />
                {manifest.hero.secondaryAction}
              </button>
            </div>
          </motion.div>

          <motion.div
            className="factory-console"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <div className="console-header">
              <span />
              <span />
              <span />
              <strong>private_factory.yml</strong>
            </div>
            <div className="factory-line">
              <GitBranch size={18} />
              <span>Markdown update</span>
              <ArrowRight size={16} />
              <BrainCircuit size={18} />
              <span>LLM manifest</span>
            </div>
            <div className="factory-line">
              <CheckCircle2 size={18} />
              <span>Schema validated JSON</span>
              <ArrowRight size={16} />
              <ServerCog size={18} />
              <span>Railway deploy</span>
            </div>
            <div className="console-meter">
              <i />
            </div>
            <p>{manifest.architectureNarrative}</p>
          </motion.div>
        </div>
      </section>

      <section className="runtime-section" id="runtime">
        <div className="section-heading">
          <p>Live runtime map</p>
          <h2>Follow one caller all the way to proof.</h2>
        </div>
        <div className="workbench">
          <div className="flow-canvas">
            <div className="flow-track">
              {manifest.systemFlow.map((node, index) => (
                <div className="flow-step" key={node.id}>
                  <FlowNodeButton node={node} active={node.id === activeNode?.id} onSelect={setActiveNodeId} />
                  {index < manifest.systemFlow.length - 1 ? <ArrowRight className="flow-arrow" size={22} /> : null}
                </div>
              ))}
            </div>
            <div className="runtime-caption">
              <LockKeyhole size={17} />
              <span>The public app reads generated JSON only. The LLM and secrets stay in CI.</span>
            </div>
          </div>
          {activeNode ? <Inspector node={activeNode} /> : null}
        </div>
      </section>

      <section className="tickets-section" id="tickets">
        <div className="section-heading">
          <p>Ticket decompiler</p>
          <h2>Turn noisy intake into a first debugging split.</h2>
        </div>
        <div className="ticket-grid">
          <div className="ticket-input">
            <textarea value={ticketText} onChange={(event) => setTicketText(event.target.value)} />
            <div className="mode-tabs">
              {manifest.ticketModes.map((mode) => (
                <button
                  className={mode.id === activeMode?.id ? "mode-active" : ""}
                  key={mode.id}
                  onClick={() => setActiveModeId(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ticket-output">
            <div className="readout-grid">
              <span>Call ID</span>
              <strong>{ticketRead.callId}</strong>
              <span>clientOrgId</span>
              <strong>{ticketRead.clientOrgId}</strong>
              <span>Family</span>
              <strong>{ticketRead.family}</strong>
            </div>
            <article>
              <p>Caller-visible failure</p>
              <h3>{ticketRead.callerVisibleFailure}</h3>
            </article>
            <article>
              <p>Backend truth to check</p>
              <h3>{ticketRead.backendTruthToCheck}</h3>
            </article>
            <article className="safety-callout">
              <ShieldAlert size={18} />
              <span>{ticketRead.safety}</span>
            </article>
            <div className="proof-row">
              <span>{ticketRead.firstRepo}</span>
              <span>{ticketRead.oracle}</span>
              <span>{ticketRead.guardrail}</span>
            </div>
          </div>
        </div>
        {activeMode ? (
          <div className="mode-readout">
            <strong>{activeMode.label}</strong>
            <span>{activeMode.backendTruthToCheck}</span>
          </div>
        ) : null}
      </section>

      <section className="repo-section">
        <div className="section-heading">
          <p>Repo ownership</p>
          <h2>Know which layer owns the mistake.</h2>
        </div>
        <RepoStrip repos={manifest.repos} />
      </section>

      <section className="evidence-section">
        <div className="section-heading">
          <p>Evidence lanes</p>
          <h2>Separate support metadata from backend truth.</h2>
        </div>
        <div className="evidence-grid">
          {manifest.evidenceLanes.map((lane) => (
            <EvidenceLaneRow lane={lane} key={lane.id} />
          ))}
        </div>
      </section>

      <section className="safety-section">
        <div className="section-heading">
          <p>Safety layer</p>
          <h2>Appointment write paths stay gated.</h2>
        </div>
        <div className="safety-grid">
          {manifest.safetyRules.map((rule) => (
            <SafetyRow rule={rule} key={rule.id} />
          ))}
        </div>
      </section>

      <section className="tour-section">
        <div className="section-heading">
          <p>Guided tours</p>
          <h2>Reusable routes through the codebase.</h2>
        </div>
        <div className="tour-grid">
          {manifest.guidedTours.map((tour) => (
            <TourPanel tour={tour} key={tour.id} />
          ))}
        </div>
      </section>

      <section className="factory-section" id="factory">
        <div className="section-heading">
          <p>Update factory</p>
          <h2>Markdown becomes a deployed atlas.</h2>
        </div>
        <div className="factory-grid">
          {manifest.learningLoop.map((step, index) => (
            <article className="factory-step" key={step.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.label}</h3>
              <p>{step.prompt}</p>
              <strong>{step.output}</strong>
            </article>
          ))}
        </div>
        <div className="source-footer">
          <div>
            <span>Source</span>
            <code>{manifest.sourcePath}</code>
          </div>
          <div>
            <span>Generated</span>
            <code>{new Date(manifest.generatedAt).toLocaleString()}</code>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
