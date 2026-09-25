import { useEffect, useRef, useState } from "react";
import { getSearch } from "../lib/searchRegistry";
import { focusTerm } from "../lib/focusTerm";

interface Props {
  tabId: string;
  bg: string;
  fg: string;
  onClose: () => void;
}

export default function SearchBar({ tabId, bg, fg, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [match, setMatch] = useState<{ index: number; count: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const addon = getSearch(tabId);
    if (!addon) return;
    const d = addon.onDidChangeResults((r) =>
      setMatch({ index: r.resultIndex, count: r.resultCount }),
    );
    return () => d.dispose();
  }, [tabId]);

  const go = (dir: 1 | -1) => {
    const addon = getSearch(tabId);
    const q = inputRef.current?.value ?? query;
    if (!addon || !q) return;
    try {
      if (dir > 0) addon.findNext(q, { caseSensitive, regex: useRegex });
      else addon.findPrevious(q, { caseSensitive, regex: useRegex });
    } catch {
      setMatch({ index: -1, count: 0 });
    }
  };

  const applyQuery = (q: string, cs: boolean, rx: boolean) => {
    const addon = getSearch(tabId);
    if (!addon) return;
    if (!q) {
      addon.clearDecorations();
      return;
    }
    try {
      addon.findNext(q, { caseSensitive: cs, regex: rx, incremental: true });
    } catch {
      setMatch({ index: -1, count: 0 });
    }
  };

  const close = () => {
    getSearch(tabId)?.clearDecorations();
    onClose();
    focusTerm(tabId);
  };

  const counter =
    !query || !match
      ? "–"
      : match.count === 0
        ? "0/0"
        : `${match.index + 1}/${match.count}`;

  return (
    <div
      className="searchbar"
      style={{ background: bg, color: fg, borderColor: "#3c3c3c" }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Find in terminal"
        aria-label="Find in terminal"
        onChange={(e) => {
          const q = e.target.value;
          setQuery(q);
          applyQuery(q, caseSensitive, useRegex);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      />
      <span className="footer-dim search-count" title="Current match / total">
        {counter}
      </span>
      <button
        type="button"
        title="Previous (Shift+Enter)"
        onClick={() => go(-1)}
        aria-label="Previous match"
      >
        ↑
      </button>
      <button
        type="button"
        title="Next (Enter)"
        onClick={() => go(1)}
        aria-label="Next match"
      >
        ↓
      </button>
      <button
        type="button"
        title="Match case"
        aria-pressed={caseSensitive}
        className={caseSensitive ? "search-toggle-on" : ""}
        onClick={() => {
          const v = !caseSensitive;
          setCaseSensitive(v);
          applyQuery(query, v, useRegex);
        }}
      >
        Aa
      </button>
      <button
        type="button"
        title="Regular expression"
        aria-pressed={useRegex}
        className={useRegex ? "search-toggle-on" : ""}
        onClick={() => {
          const v = !useRegex;
          setUseRegex(v);
          applyQuery(query, caseSensitive, v);
        }}
      >
        .*
      </button>
      <button
        type="button"
        title="Close (Esc)"
        onClick={close}
        aria-label="Close search"
      >
        ×
      </button>
    </div>
  );
}
