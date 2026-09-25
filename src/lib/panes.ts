// Split-pane model: binary tree per tab. `horizontal` = stacked top/bottom,
// `vertical` = side-by-side. Rendered flat (see PaneLayout) so opening or
// closing one pane never remounts the survivors' terminals.

export type SplitDir = "horizontal" | "vertical";

export interface PaneLeaf {
  kind: "leaf";
  /** Unique pty id (node-pty instance). */
  paneId: string;
  /** Starting cwd for the pane's shell. */
  cwd?: string;
}

export interface PaneSplit {
  kind: "split";
  dir: SplitDir;
  first: PaneNode;
  second: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export function countLeaves(node: PaneNode): number {
  if (node.kind === "leaf") return 1;
  return countLeaves(node.first) + countLeaves(node.second);
}

export function collectLeaves(node: PaneNode): PaneLeaf[] {
  if (node.kind === "leaf") return [node];
  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

export function firstLeaf(node: PaneNode): PaneLeaf {
  let n = node;
  while (n.kind !== "leaf") n = n.first;
  return n;
}

export function findLeaf(node: PaneNode, paneId: string): PaneLeaf | null {
  if (node.kind === "leaf") return node.paneId === paneId ? node : null;
  return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId) ?? null;
}

/** Replace the leaf `paneId` with a split holding the old + new leaf. */
export function splitLeaf(
  node: PaneNode,
  paneId: string,
  newLeaf: PaneLeaf,
  dir: SplitDir,
): PaneNode {
  if (node.kind === "leaf") {
    if (node.paneId !== paneId) return node;
    return { kind: "split", dir, first: node, second: newLeaf };
  }
  return {
    ...node,
    first: splitLeaf(node.first, paneId, newLeaf, dir),
    second: splitLeaf(node.second, paneId, newLeaf, dir),
  };
}

/**
 * Remove a leaf; the surviving sibling collapses into the parent slot.
 * Returns null when the tree held only that leaf.
 */
export function removeLeaf(node: PaneNode, paneId: string): PaneNode | null {
  if (node.kind === "leaf") return node.paneId === paneId ? null : node;
  if (node.first.kind === "leaf" && node.first.paneId === paneId)
    return node.second;
  if (node.second.kind === "leaf" && node.second.paneId === paneId)
    return node.first;
  const first = removeLeaf(node.first, paneId);
  if (first && first !== node.first) return { ...node, first };
  const second = removeLeaf(node.second, paneId);
  if (second && second !== node.second) return { ...node, second };
  return node;
}

export interface GridArea {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

const GRID = 100;

/** Map every leaf to integer grid lines, area proportional to leaf count. */
export function layoutPanes(root: PaneNode): Map<string, GridArea> {
  const areas = new Map<string, GridArea>();
  const walk = (
    node: PaneNode,
    r0: number,
    r1: number,
    c0: number,
    c1: number,
  ): void => {
    if (node.kind === "leaf") {
      areas.set(node.paneId, {
        rowStart: Math.max(0, Math.round(r0)) + 1,
        rowEnd: Math.max(1, Math.round(r1)) + 1,
        colStart: Math.max(0, Math.round(c0)) + 1,
        colEnd: Math.max(1, Math.round(c1)) + 1,
      });
      return;
    }
    const n1 = countLeaves(node.first);
    const n2 = countLeaves(node.second);
    const total = n1 + n2;
    if (node.dir === "horizontal") {
      let m = r0 + ((r1 - r0) * n1) / total;
      m = Math.min(Math.max(m, r0 + 1), r1 - 1);
      walk(node.first, r0, m, c0, c1);
      walk(node.second, m, r1, c0, c1);
    } else {
      let m = c0 + ((c1 - c0) * n1) / total;
      m = Math.min(Math.max(m, c0 + 1), c1 - 1);
      walk(node.first, r0, r1, c0, m);
      walk(node.second, r0, r1, m, c1);
    }
  };
  walk(root, 0, GRID, 0, GRID);
  return areas;
}
