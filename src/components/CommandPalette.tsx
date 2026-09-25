import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type PaletteCommand } from "../commands";
import { focusTerm } from "../lib/focusTerm";

interface Props {
  tabId: string;
  commands: PaletteCommand[];
  onClose: () => void;
}

export default function CommandPalette({ tabId, commands, onClose }: Props) {
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => filterCommands(commands, filter),
    [commands, filter],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [index, visible]);

  const close = () => {
    onClose();
    focusTerm(tabId);
  };

  const run = (cmd: PaletteCommand | undefined) => {
    if (!cmd) return;
    onClose();
    focusTerm(tabId);
    cmd.run();
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          type="text"
          value={filter}
          placeholder="Type a command or search tabs…"
          aria-label="Command palette"
          onChange={(e) => {
            setFilter(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, visible.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(visible[index]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
        />
        <div className="palette-list" ref={listRef} role="listbox">
          {visible.map((c, i) => (
            <div
              key={c.id}
              role="option"
              aria-selected={i === index}
              data-selected={i === index}
              className={i === index ? "palette-item selected" : "palette-item"}
              onClick={() => run(c)}
              onMouseMove={() => {
                if (i !== index) setIndex(i);
              }}
            >
              <span>{c.title}</span>
              {c.hint && <span className="footer-dim">{c.hint}</span>}
            </div>
          ))}
          {visible.length === 0 && (
            <div className="palette-item footer-dim">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}
