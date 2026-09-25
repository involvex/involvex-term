export interface GitStatus {
  cwd: string;
  repoRoot: string | null;
  branch: string;
  isDirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
  stashCount: number;
}

export interface SysStats {
  cpuPercent: number;
  memUsedGB: number;
  memTotalGB: number;
  memPercent: number;
  uptimeSec: number;
}

export type FooterModuleId = "git" | "sys";

/** Persisted session: tab split-trees with per-pane cwds. `root` is opaque
 * JSON here — structurally validated/normalized on the renderer side. */
export interface SessionTab {
  title: string;
  root: unknown;
}

export interface SessionState {
  version: 1;
  tabs: SessionTab[];
}
