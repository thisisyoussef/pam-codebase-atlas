export type Plane = "entry" | "control" | "execution" | "downstream" | "evidence" | "regression";

export type FlowNode = {
  id: string;
  label: string;
  repo: string;
  plane: Plane;
  summary: string;
  next: string[];
  firstFiles: string[];
  signals: string[];
};

export type Repo = {
  id: string;
  name: string;
  role: string;
  plane: "control" | "execution" | "downstream" | "evidence" | "regression" | "interface" | "ops";
  firstQuestion: string;
  inspectFirst: string[];
  ticketSignals: string[];
  commonTrap: string;
};

export type TicketMode = {
  id: string;
  label: string;
  family: string;
  callerVisibleFailure: string;
  backendTruthToCheck: string;
  likelyFirstRepo: string;
  oracle: string;
  guardrail: string;
};

export type EvidenceLane = {
  id: string;
  label: string;
  purpose: string;
  source: string;
  trustLevel: "primary" | "supporting" | "unsafe_without_confirmation";
  firstMove: string;
};

export type SafetyRule = {
  id: string;
  label: string;
  severity: "info" | "warning" | "critical";
  rule: string;
  whyItMatters: string;
};

export type GuidedTour = {
  id: string;
  title: string;
  audience: string;
  steps: string[];
  takeaway: string;
};

export type LearningStep = {
  id: string;
  label: string;
  prompt: string;
  output: string;
};

export type AtlasManifest = {
  generatedAt: string;
  sourcePath: string;
  sourceSha: string;
  sourceTitle: string;
  hero: {
    headline: string;
    subhead: string;
    primaryAction: string;
    secondaryAction: string;
  };
  architectureNarrative: string;
  systemFlow: FlowNode[];
  repos: Repo[];
  ticketModes: TicketMode[];
  evidenceLanes: EvidenceLane[];
  safetyRules: SafetyRule[];
  guidedTours: GuidedTour[];
  learningLoop: LearningStep[];
  changelog: string[];
};
