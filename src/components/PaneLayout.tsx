import { useMemo } from "react";
import TerminalView from "./TerminalView";
import { collectLeaves, layoutPanes, type PaneNode } from "../lib/panes";

interface Theme {
  fontFamily: string;
  fontSize: number;
  bg: string;
  fg: string;
}

interface Props extends Theme {
  root: PaneNode;
  /** False when another tab is showing (whole layout hidden). */
  tabActive: boolean;
  activePaneId: string;
  onFocusPane: (paneId: string) => void;
}

/**
 * Renders every leaf of the split tree FLAT (stable keys = pane ids) on a
 * 100x100 CSS grid whose areas come from the tree geometry. Opening or
 * closing one pane therefore never remounts the survivors' terminals.
 */
export default function PaneLayout({
  root,
  tabActive,
  activePaneId,
  fontFamily,
  fontSize,
  bg,
  fg,
  onFocusPane,
}: Props) {
  const leaves = useMemo(() => collectLeaves(root), [root]);
  const areas = useMemo(() => layoutPanes(root), [root]);
  const multi = leaves.length > 1;

  return (
    <div
      className="pane-grid"
      style={{
        display: tabActive ? "grid" : "none",
        gridTemplateRows: "repeat(100, minmax(0, 1fr))",
        gridTemplateColumns: "repeat(100, minmax(0, 1fr))",
      }}
    >
      {leaves.map((leaf) => {
        const a = areas.get(leaf.paneId);
        const focused = leaf.paneId === activePaneId;
        return (
          <div
            key={leaf.paneId}
            className={multi && focused ? "split-leaf focused" : "split-leaf"}
            style={
              a
                ? {
                    gridRow: `${a.rowStart} / ${a.rowEnd}`,
                    gridColumn: `${a.colStart} / ${a.colEnd}`,
                  }
                : undefined
            }
          >
            <TerminalView
              paneId={leaf.paneId}
              tabActive={tabActive}
              focused={focused}
              fontFamily={fontFamily}
              fontSize={fontSize}
              bg={bg}
              fg={fg}
              initialCwd={leaf.cwd}
              onFocusPane={onFocusPane}
            />
          </div>
        );
      })}
    </div>
  );
}
