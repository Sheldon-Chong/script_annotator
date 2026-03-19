import React, { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { lineNumbers } from "@codemirror/view";
import { selectAll } from "@codemirror/commands";
import { HexColorPicker } from "react-colorful";
import {
  autocompletion,
  acceptCompletion,
  completionStatus,
  startCompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import SnippetTable, {
  DEFAULT_SNIPPET_ROW,
  type Snippet,
} from "./components/SnippetTable";
import ColorPicker from "./components/ColorPicker";
import { useSnippetColorPicker } from "./hooks/useSnippetColorPicker";
import { useSnippetRows } from "./hooks/useSnippetRows";
import styles from "./App.module.css";
import defaults from "./config/defaults.json";
import { type casing } from "./components/SnippetTable";
import { normalizeHexColor } from "./utils/utils";

type RenderResponse = {
  rendered: number;
  files: string[];
};

type RenderStatus = {
  tone: "idle" | "running" | "success" | "error";
  message: string;
};

export const DEFAULT_SNIPPET_COLOR = "#9e9e9e";

function applySnippetToLine(
  lineText: string,
  snippet: string,
  casing: casing = "none",
): string {
  function applyTextCasing(text: string, nextCasing: casing): string {
    if (nextCasing === "lowercase") {
      return text.toLowerCase();
    }

    if (nextCasing === "uppercase") {
      return text.toUpperCase();
    }

    if (nextCasing === "normal") {
      return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
    }

    return text;
  }

  const doubleColonIdx = lineText.indexOf("::");
  if (doubleColonIdx !== -1) {
    const trailingText = lineText.slice(doubleColonIdx + 2);
    return snippet + "::" + applyTextCasing(trailingText, casing);
  }
  const transformedLineText = applyTextCasing(lineText, casing);
  return (
    snippet +
    "::" +
    (transformedLineText.length > 0 ? " " + transformedLineText : "")
  );
}

// Extend the standard Input attributes
interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  children?: React.ReactNode;
  onEmptyBackspace?: () => void; // Optional custom callback
  ghostSuffix?: string;
}

// Runtime render API base comes from `public/config.json` (fetched at app start)
// or from `REACT_APP_RENDER_API_BASE`. The actual request code lives inside
// the `App` component so it can access the loaded base URL.

async function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body });
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { body });
      return true;
    }
  }

  return false;
}

function buildHighlightDecorations(
  view: EditorView,
  highlightColorBySnippet: Map<string, string>,
  fallbackHighlightColor: string,
) {
  const builder = new RangeSetBuilder<Decoration>();
  const markByColor = new Map<string, Decoration>();

  function getMark(color: string) {
    const existing = markByColor.get(color);
    if (existing) return existing;
    const next = Decoration.mark({
      class: styles.highlight,
      attributes: {
        style: `background: ${color};`,
      },
    });
    markByColor.set(color, next);
    return next;
  }

  const firstLine = view.state.doc.lineAt(view.viewport.from).number;
  const lastLine = view.state.doc.lineAt(view.viewport.to).number;

  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const separatorIndex = line.text.indexOf("::");
    if (separatorIndex > 0) {
      const snippet = line.text.slice(0, separatorIndex).trim();
      const color =
        highlightColorBySnippet.get(snippet) ?? fallbackHighlightColor;
      builder.add(line.from, line.from + separatorIndex, getMark(color));
    }
  }

  return builder.finish();
}

function createHighlightBeforeDoubleColon(
  highlightColorBySnippet: Map<string, string>,
  fallbackHighlightColor: string,
) {
  return ViewPlugin.fromClass(
    class {
      decorations;

      constructor(view: EditorView) {
        this.decorations = buildHighlightDecorations(
          view,
          highlightColorBySnippet,
          fallbackHighlightColor,
        );
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildHighlightDecorations(
            update.view,
            highlightColorBySnippet,
            fallbackHighlightColor,
          );
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

const STARTING_SCRIPT = (defaults as any)?.startingScript;
const STARTING_SNIPPETS = (defaults as any)?.startingSnippets;

function App() {
  const [mainValue, setMainValue] = useState(STARTING_SCRIPT);
  const {
    snippetRows,
    snippetDropTargetIndex,
    addSnippetRow,
    updateSnippetText,
    updateSnippetColor,
    updateSnippetCasing,
    deleteSnippetRow,
    handleSnippetDragStart,
    handleSnippetDragEnter,
    handleSnippetDragOver,
    handleSnippetDrop,
    handleSnippetDragEnd,
  } = useSnippetRows({
    startingSnippets: STARTING_SNIPPETS,
    defaultSnippetColor: DEFAULT_SNIPPET_COLOR,
  });
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>({
    tone: "idle",
    message: "",
  });
  const [hasRangeSelection, setHasRangeSelection] = useState(false);
  const [hasMultiCursor, setHasMultiCursor] = useState(false);
  const [isSuggestionMenuOpen, setIsSuggestionMenuOpen] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState({
    x: 16,
    y: 16,
  });
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [suggestionSearch, setSuggestionSearch] = useState("");
  const mainEditorRef = useRef<EditorView | null>(null);
  const mainEditorContainerRef = useRef<HTMLDivElement | null>(null);
  const suggestionSearchInputRef = useRef<HTMLInputElement | null>(null);
  const previousRangeSelectionRef = useRef(false);
  const previousMultiCursorRef = useRef(false);
  const lastTypedSpacePosRef = useRef<number | null>(null);
  const shouldDeleteLastTypedSpaceRef = useRef(false);

  // Render API base loaded at runtime from /config.json (served from public/)
  const [renderApiBase, setRenderApiBase] = useState<string | null>(null);

  const {
    activeColorPickerIndex,
    colorPickerDraft,
    setColorPickerDraft,
    openColorPicker,
    closeColorPicker,
    applyColorPicker,
  } = useSnippetColorPicker({
    snippetRows,
    defaultSnippetColor: DEFAULT_SNIPPET_COLOR,
    normalizeHexColor,
    updateSnippetColor,
  });

  // Color picker UI moved to `ColorPicker` component in ./components/ColorPicker

  useEffect(() => {
    let mounted = true;
    fetch("/config.json")
      .then((r) => r.json())
      .then((json) => {
        if (!mounted) return;
        if (json && typeof json.renderApiBase === "string") {
          setRenderApiBase(json.renderApiBase);
        } else {
          setRenderApiBase(
            process.env.REACT_APP_RENDER_API_BASE || "http://localhost:8000",
          );
        }
      })
      .catch(() => {
        if (!mounted) return;
        setRenderApiBase(
          process.env.REACT_APP_RENDER_API_BASE || "http://localhost:8000",
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  function focusSuggestionSearchInput() {
    requestAnimationFrame(() => {
      setTimeout(() => {
        suggestionSearchInputRef.current?.focus();
      }, 0);
    });
  }

  function SuggestionList(filteredSuggestionOptions: string[]) {
    return filteredSuggestionOptions.length === 0 ? (
      <div className={styles.suggestionsEmpty}>
        Add suggestion lines in the snippets editor.
      </div>
    ) : (
      <div className={styles.suggestionsList}>
        {filteredSuggestionOptions.map((option, index) => (
          <div
            key={option}
            className={styles.suggestionRow}
          >
            <button
              type="button"
              className={`${styles.snippetColorPickerButton} ${styles.suggestionColorDot}`}
              style={{
                backgroundColor: normalizeHexColor(
                  getSnippet(option)?.color ?? DEFAULT_SNIPPET_COLOR,
                ),
              }}
              aria-label={`Color for ${option}`}
              tabIndex={-1}
            />
            <button
              type="button"
              className={`${styles.suggestionButton} ${index === activeSuggestionIndex ? styles.suggestionButtonActive : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => handleSuggestionMouseEnter(index)}
              onClick={() => applySuggestion(option)}
            >
              {option}
            </button>
          </div>
        ))}
      </div>
    );
  }

  function openSuggestionsMenu(view: EditorView) {
    const hasSelection = !view.state.selection.main.empty;
    if (!hasSelection || suggestionOptions.length === 0) return false;
    setSuggestionSearch("");
    setActiveSuggestionIndex(-1);
    setIsSuggestionMenuOpen(true);
    updateSuggestionPosition(view);
    focusSuggestionSearchInput();

    return true;
  }

  const suggestionOptions = useMemo(() => {
    const uniqueOptions = new Set<string>();
    return snippetRows
      .map((row) => row.text.trim())
      .filter((line) => line.length > 0)
      .filter((line) => {
        if (uniqueOptions.has(line)) {
          return false;
        }
        uniqueOptions.add(line);
        return true;
      });
  }, [snippetRows]);

  const snippets = useMemo(() => {
    const mapping = new Map<string, Snippet>();
    snippetRows.forEach((row) => {
      const snippet = row.text.trim();
      if (!snippet || mapping.has(snippet)) {
        return;
      }
      mapping.set(snippet, row);
    });
    return mapping;
  }, [snippetRows]);

  const snippetHighlightColorByName = useMemo(() => {
    const mapping = new Map<string, string>();
    snippets.forEach((row, snippet) => {
      mapping.set(snippet, normalizeHexColor(row.color));
    });
    return mapping;
  }, [snippets]);

  const highlightBeforeDoubleColon = useMemo(() => {
    return createHighlightBeforeDoubleColon(
      snippetHighlightColorByName,
      DEFAULT_SNIPPET_COLOR,
    );
  }, [snippetHighlightColorByName]);

  const filteredSuggestionOptions = useMemo(() => {
    const query = suggestionSearch.trim().toLowerCase();
    if (!query) {
      return suggestionOptions;
    }
    return suggestionOptions.filter((option) =>
      option.toLowerCase().includes(query),
    );
  }, [suggestionOptions, suggestionSearch]);

  const suggestionGhostSuffix = useMemo(() => {
    console.log("calculating ghost suffix for query: ", suggestionSearch);
    const query = suggestionSearch;
    if (!query) return "";
    const loweredQuery = query.toLowerCase();
    const firstPrefixMatch = filteredSuggestionOptions.find((option) => {
      const loweredOption = option.toLowerCase();
      return (
        loweredOption.startsWith(loweredQuery) && option.length > query.length
      );
    });
    if (!firstPrefixMatch) return "";
    return firstPrefixMatch.slice(query.length);
  }, [suggestionSearch, filteredSuggestionOptions]);

  const isSuggestionMenuVisible =
    (hasRangeSelection || hasMultiCursor) &&
    isSuggestionMenuOpen &&
    suggestionOptions.length > 0;
  const isSuggestionMenuActive = isSuggestionMenuVisible;

  function applyCompletionSnippet(
    view: EditorView,
    snippetRow: Snippet,
    from: number,
    to: number,
  ) {
    const changes: { from: number; to: number; insert: string }[] = [
      { from, to, insert: "" },
    ];
    let nextAnchor = from;

    const spacePos = lastTypedSpacePosRef.current;
    const shouldDeleteSpace = shouldDeleteLastTypedSpaceRef.current;
    if (
      shouldDeleteSpace &&
      spacePos !== null &&
      spacePos >= 0 &&
      spacePos < view.state.doc.length
    ) {
      const maybeSpace = view.state.doc.sliceString(spacePos, spacePos + 1);
      if (maybeSpace === " ") {
        changes.push({ from: spacePos, to: spacePos + 1, insert: "" });
        if (spacePos < from) {
          nextAnchor = Math.max(0, from - 1);
        }
      }
    }

    view.dispatch({
      changes,
      selection: { anchor: nextAnchor },
    });
    shouldDeleteLastTypedSpaceRef.current = false;
    lastTypedSpacePosRef.current = null;
    insertSnippet(view, snippetRow);
  }

  function getSnippet(snippet: string): Snippet {
    return snippets.get(snippet) ?? DEFAULT_SNIPPET_ROW;
  }

  function getSnippetForInsertion(snippet: string): Snippet {
    const existingSnippet = snippets.get(snippet);
    if (existingSnippet) {
      return existingSnippet;
    }

    return {
      ...DEFAULT_SNIPPET_ROW,
      text: snippet,
    };
  }

  const snippetCompletionSource = useMemo(() => {
    return (context: CompletionContext) => {
      const word = context.matchBefore(/\S*/);
      const isEmptyWord = !word || (word.from === word.to && !context.explicit);
      if (isEmptyWord) {
        if (!context.explicit) return null;
      }

      const from = word ? word.from : context.pos;
      const query = context.state.doc.sliceString(from, context.pos);
      const normalizedQuery = query.toLowerCase();
      const options: Completion[] = suggestionOptions
        .filter((option) => option.toLowerCase().startsWith(normalizedQuery))
        .map((option) => ({
          label: option,
          type: "text",
          apply: (view: EditorView, _completion, from, to) => {
            applyCompletionSnippet(view, getSnippet(option), from, to);
          },
        }));

      if (query.length > 0) {
        options.push({
          label: query,
          type: "text",
          detail: "Custom snippet",
          boost: -99,
          apply: (view: EditorView, _completion, from, to) => {
            applyCompletionSnippet(
              view,
              getSnippetForInsertion(query),
              from,
              to,
            );
          },
        });
      }

      if (!options.length) return null;

      return {
        from,
        options,
        filter: false,
      };
    };
  }, [suggestionOptions, snippets]);

  function insertSnippet(view: EditorView, snippetRow: Snippet) {
    if (!snippetRow) return true;

    const { state } = view;
    const ranges = state.selection.ranges;

    if (ranges.length > 1) {
      const targetLineNumbers = new Set<number>();

      ranges.forEach((range) => {
        if (range.empty) {
          const line = state.doc.lineAt(range.head);
          if (line.length > 0) {
            targetLineNumbers.add(line.number);
          }
          return;
        }

        const startLine = state.doc.lineAt(range.from).number;
        const endLine = state.doc.lineAt(range.to).number;
        for (
          let lineNumber = startLine;
          lineNumber <= endLine;
          lineNumber += 1
        ) {
          const line = state.doc.line(lineNumber);
          if (line.length === 0) continue;
          targetLineNumbers.add(lineNumber);
        }
      });

      const changes = Array.from(targetLineNumbers)
        .sort((a, b) => a - b)
        .map((lineNumber) => {
          const line = state.doc.line(lineNumber);
          return {
            from: line.from,
            to: line.to,
            insert: applySnippetToLine(
              line.text,
              snippetRow.text,
              snippetRow.casing,
            ),
          };
        });

      if (changes.length > 0) {
        view.dispatch({ changes });
      }

      return true;
    }

    const selection = state.selection.main;

    if (selection.empty) {
      const line = state.doc.lineAt(selection.head);
      const newLine = applySnippetToLine(
        line.text,
        snippetRow.text,
        snippetRow.casing,
      );
      const doubleColonIdx = line.text.indexOf("::");
      const cursorOffset =
        doubleColonIdx !== -1
          ? snippetRow.text.length + 2
          : line.text.length > 0
            ? snippetRow.text.length + 3
            : snippetRow.text.length + 2;
      const cursorAnchor = Math.min(
        line.from + cursorOffset,
        line.from + newLine.length,
      );

      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newLine },
        selection: { anchor: cursorAnchor },
      });
      return true;
    }

    const startLine = state.doc.lineAt(selection.from).number;
    const endLine = state.doc.lineAt(selection.to).number;
    const changes: { from: number; to: number; insert: string }[] = [];

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      if (line.length === 0) continue;
      changes.push({
        from: line.from,
        to: line.to,
        insert: applySnippetToLine(
          line.text,
          snippetRow.text,
          snippetRow.casing,
        ),
      });
    }

    if (changes.length > 0) {
      view.dispatch({ changes });
    }

    return true;
  }

  function applySuggestion(option: string) {
    const view = mainEditorRef.current;
    if (!view) return;
    const snippetRow = getSnippet(option);
    insertSnippet(view, snippetRow);
    view.focus();
  }

  function updateSuggestionPosition(view: EditorView) {
    const container = mainEditorContainerRef.current;
    if (!container) return;

    const selection = view.state.selection.main;
    const targetPosition = selection.empty ? selection.head : selection.to;
    const cursorCoords = view.coordsAtPos(targetPosition);
    if (!cursorCoords) return;

    const rect = container.getBoundingClientRect();
    const x = Math.round(cursorCoords.left - rect.left);
    const y = Math.round(cursorCoords.bottom - rect.top);

    setSuggestionPosition((prev) =>
      prev.x === x && prev.y === y ? prev : { x, y },
    );
  }

  useEffect(() => {
    if (!filteredSuggestionOptions.length) {
      setActiveSuggestionIndex(-1);
      return;
    }
    setActiveSuggestionIndex((prev) => {
      if (prev < 0) return -1;
      return Math.min(prev, filteredSuggestionOptions.length - 1);
    });
  }, [filteredSuggestionOptions]);

  useEffect(() => {
    if (isSuggestionMenuVisible) {
      focusSuggestionSearchInput();
    }
  }, [isSuggestionMenuVisible]);

  useEffect(() => {
    if (!hasRangeSelection) {
      const isSearchFocused =
        suggestionSearchInputRef.current === document.activeElement;
      if (isSearchFocused) return;
      setIsSuggestionMenuOpen(false);
      setActiveSuggestionIndex(-1);
      setSuggestionSearch("");
    }
  }, [hasRangeSelection]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!isSuggestionMenuOpen) return;

      const container = mainEditorContainerRef.current;
      if (!container) return;

      const targetNode = event.target as Node | null;
      if (targetNode && container.contains(targetNode)) {
        return;
      }

      setIsSuggestionMenuOpen(false);
      setSuggestionSearch("");
      setActiveSuggestionIndex(-1);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSuggestionMenuOpen]);

  function handleSuggestionMouseEnter(index: number) {
    setActiveSuggestionIndex(index);
  }

  async function renderRequest(script: string): Promise<RenderResponse> {
    const candidates: string[] = [];
    if (renderApiBase) candidates.push(renderApiBase);
    if (process.env.REACT_APP_RENDER_API_BASE)
      candidates.push(process.env.REACT_APP_RENDER_API_BASE);
    candidates.push("http://localhost:8000");
    candidates.push("http://192.168.0.2:8000");

    // Dedupe and normalize
    const seen = new Set<string>();
    const bases = candidates
      .map((s) => (s || "").replace(/\/+$/, ""))
      .filter((s) => {
        if (!s) return false;
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      });

    let lastError: Error | null = null;
    for (const base of bases) {
      const url = `${base}/textbox/render`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ script }),
        });
        if (response.ok) return response.json() as Promise<RenderResponse>;
        const text = await response.text();
        lastError = new Error(
          text || `Render failed with status ${response.status}`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError || new Error("Render failed: all URLs unreachable");
  }

  async function renderScript(script: string) {
    setIsRendering(true);
    setRenderStatus({
      tone: "running",
      message: "Rendering script...",
    });

    try {
      const result = await renderRequest(script);
      const message = `Render complete. Generated ${result.rendered} file${result.rendered === 1 ? "" : "s"}.`;
      setRenderStatus({
        tone: "success",
        message,
      });
      await showBrowserNotification("Render complete", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render failed.";
      setRenderStatus({
        tone: "error",
        message,
      });
      await showBrowserNotification("Render failed", message);
    } finally {
      setIsRendering(false);
    }
  }

  function getCurrentSelectionScript(view: EditorView): string {
    const nonEmptyRanges = view.state.selection.ranges.filter(
      (range) => !range.empty,
    );
    if (nonEmptyRanges.length === 0) {
      return "";
    }

    return nonEmptyRanges
      .map((range) => view.state.doc.sliceString(range.from, range.to))
      .join("\n");
  }

  async function handleRenderClick() {
    await renderScript(mainValue);
  }

  async function handleRenderSelectionClick() {
    const view = mainEditorRef.current;
    if (!view) return;

    const selectionScript = getCurrentSelectionScript(view).trim();
    if (!selectionScript) {
      setRenderStatus({
        tone: "error",
        message: "Select text before rendering selection.",
      });
      return;
    }

    const shouldRender = window.confirm("Render current selection?");
    if (!shouldRender) {
      return;
    }

    await renderScript(selectionScript);
  }

  function Editor() {
    return (
      <div
        className={`${styles.editor} ${styles.scriptEditor}`}
        ref={mainEditorContainerRef}
      >
        <CodeMirror
          value={mainValue}
          onChange={(value: string) => setMainValue(value)}
          onCreateEditor={(view: EditorView) => {
            mainEditorRef.current = view;
            const rangeSelected = !view.state.selection.main.empty;
            const multiCursor = view.state.selection.ranges.length > 1;
            setHasRangeSelection(rangeSelected);
            setHasMultiCursor(multiCursor);
            setIsSuggestionMenuOpen(rangeSelected || multiCursor);
            previousRangeSelectionRef.current = rangeSelected;
            previousMultiCursorRef.current = multiCursor;
            updateSuggestionPosition(view);
          }}
          onUpdate={(update: ViewUpdate) => {
            const rangeSelected = !update.state.selection.main.empty;
            const multiCursor = update.state.selection.ranges.length > 1;
            setHasRangeSelection((prev) =>
              prev === rangeSelected ? prev : rangeSelected,
            );
            setHasMultiCursor((prev) =>
              prev === multiCursor ? prev : multiCursor,
            );

            const completionIsActive =
              completionStatus(update.state) === "active";
            if (lastTypedSpacePosRef.current !== null && completionIsActive) {
              shouldDeleteLastTypedSpaceRef.current = true;
            }

            if (update.selectionSet && !update.docChanged) {
              shouldDeleteLastTypedSpaceRef.current = false;
              lastTypedSpacePosRef.current = null;
            }

            if (!rangeSelected && !multiCursor) {
              setIsSuggestionMenuOpen(false);
            } else if (
              !previousRangeSelectionRef.current &&
              !previousMultiCursorRef.current
            ) {
              setIsSuggestionMenuOpen(true);
              updateSuggestionPosition(update.view);
              focusSuggestionSearchInput();
            }

            if (isSuggestionMenuOpen && update.selectionSet) {
              updateSuggestionPosition(update.view);
            }

            previousRangeSelectionRef.current = rangeSelected;
            previousMultiCursorRef.current = multiCursor;
          }}
          placeholder="Type here..."
          basicSetup={{
            foldGutter: false,
            dropCursor: false,
            allowMultipleSelections: true,
            indentOnInput: false,
          }}
          extensions={mainExtensions}
        />
        {isSuggestionMenuVisible && (
          <div
            className={styles.suggestionsPanel}
            style={{
              left: `${suggestionPosition.x}px`,
              top: `${suggestionPosition.y}px`,
            }}
          >
            {SuggestionList(filteredSuggestionOptions)}
            <hr style={{ color: "#eee" }}></hr>
            <div
              style={{
                padding: "3px 0px",
                gap: "2px",
                flexDirection: "column",
                display: "flex",
              }}
            >
              <button
                type="button"
                className={styles.suggestionCommandButton}
                onClick={handleRenderSelectionClick}
              >
                render
              </button>
              <button
                type="button"
                className={styles.suggestionCommandButton}
              >
                preview
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const mainExtensions = useMemo(() => {
    const snippetBindings = Array.from({ length: 10 }, (_, idx) => {
      const digit = idx === 9 ? 0 : idx + 1;
      const run = (view: EditorView) => insertSnippet(view, snippetRows[idx]);
      return [
        {
          key: `Alt-${digit}`,
          run,
          preventDefault: true,
        },
        {
          key: `Shift-Alt-${digit}`,
          run,
          preventDefault: true,
        },
        {
          key: `Ctrl-Alt-${digit}`,
          run,
          preventDefault: true,
        },
      ];
    }).flat();

    const suggestionNavigationBindings = [
      {
        key: "Shift-ArrowDown",
        run: () => false,
        preventDefault: false,
      },
      {
        key: "Shift-ArrowUp",
        run: () => false,
        preventDefault: false,
      },
      {
        key: "ArrowDown",
        run: () => {
          if (!isSuggestionMenuActive || !filteredSuggestionOptions.length)
            return false;
          setActiveSuggestionIndex((prev) => {
            if (prev >= filteredSuggestionOptions.length - 1) {
              suggestionSearchInputRef.current?.focus();
              return -1;
            }
            return prev + 1;
          });
          return true;
        },
        preventDefault: true,
      },
      {
        key: "ArrowUp",
        run: () => {
          if (!isSuggestionMenuActive || !filteredSuggestionOptions.length)
            return false;
          setActiveSuggestionIndex((prev) => {
            if (prev <= -1) {
              return filteredSuggestionOptions.length - 1;
            }
            return prev - 1;
          });
          return true;
        },
        preventDefault: true,
      },
    ];

    const autocompleteExtension = autocompletion({
      override: [snippetCompletionSource],
      activateOnTyping: true,
      defaultKeymap: true,
      icons: false,
      addToOptions: [
        {
          position: 20,
          render: (completion) => {
            const dot = document.createElement("span");
            dot.className = styles.autocompleteColorDot;
            dot.style.backgroundColor = normalizeHexColor(
              getSnippet(completion.label)?.color ?? DEFAULT_SNIPPET_COLOR,
            );
            return dot;
          },
        },
      ],
    });

    return [
      lineNumbers(),
      EditorView.lineWrapping,
      highlightBeforeDoubleColon,
      autocompleteExtension,
      EditorView.domEventHandlers({
        click: (event, view) => {
          console.log("click");
          if (!event.altKey) return false;
          event.preventDefault();
          return openSuggestionsMenu(view);
        },
        mouseup: (_event, view) => {
          if (!isSuggestionMenuOpen) return false;
          if (view.state.selection.main.empty) return false;
          focusSuggestionSearchInput();
          return false;
        },
      }),
      Prec.highest(keymap.of(suggestionNavigationBindings)),
      Prec.highest(
        keymap.of([
          {
            key: "Space",
            run: (view: EditorView) => {
              lastTypedSpacePosRef.current = view.state.selection.main.head;
              shouldDeleteLastTypedSpaceRef.current = false;
              return false;
            },
            preventDefault: false,
          },
          {
            key: "Ctrl-Space",
            run: (view: EditorView) => {
              startCompletion(view);
              return true;
            },
            preventDefault: true,
          },
          {
            key: "Mod-Space",
            run: (view: EditorView) => {
              startCompletion(view);
              return true;
            },
            preventDefault: true,
          },
          {
            key: "Tab",
            run: (view: EditorView) => {
              if (completionStatus(view.state) !== "active") return false;
              return acceptCompletion(view);
            },
            preventDefault: false,
          },
          {
            key: "Enter",
            run: (view: EditorView) => {
              if (completionStatus(view.state) !== "active") return false;
              return insertNewlineAndIndent(view);
            },
            preventDefault: true,
          },
        ]),
      ),
      keymap.of([...snippetBindings]),
    ];
  }, [
    snippetRows,
    isSuggestionMenuActive,
    filteredSuggestionOptions,
    activeSuggestionIndex,
    hasRangeSelection,
    suggestionOptions,
    highlightBeforeDoubleColon,
    snippetCompletionSource,
    snippets,
  ]);

  return (
    <div className={styles.container}>
      <h2>Script Annotator</h2>
      <div className={styles.columns}>
        <div className={styles.editor}>
          <SnippetTable
            snippetRows={snippetRows}
            snippetDropTargetIndex={snippetDropTargetIndex}
            onSnippetDragEnter={handleSnippetDragEnter}
            onSnippetDragOver={handleSnippetDragOver}
            onSnippetDrop={handleSnippetDrop}
            onSnippetDragStart={handleSnippetDragStart}
            onSnippetDragEnd={handleSnippetDragEnd}
            onSnippetTextChange={updateSnippetText}
            onSnippetCasingChange={updateSnippetCasing}
            onOpenColorPicker={openColorPicker}
            onDeleteSnippetRow={deleteSnippetRow}
            onAddSnippetRow={addSnippetRow}
            normalizeHexColor={normalizeHexColor}
          />
        </div>
        {Editor()}
      </div>
      <div className={styles.commandBar}>
        {renderStatus.message && (
          <div
            className={`${styles.renderStatus} ${styles[`renderStatus${renderStatus.tone[0].toUpperCase()}${renderStatus.tone.slice(1)}`]}`}
          >
            {renderStatus.message}
          </div>
        )}
        <button
          type="button"
          className={styles.commandButton}
          onClick={handleRenderClick}
          disabled={isRendering}
        >
          {isRendering ? "Rendering..." : "Render script"}
        </button>
      </div>

      {activeColorPickerIndex !== null && (
        <div
          className={styles.colorPickerOverlay}
          onClick={closeColorPicker}
        >
          <ColorPicker
            color={colorPickerDraft}
            onChange={setColorPickerDraft}
            onApply={applyColorPicker}
            onCancel={closeColorPicker}
            normalizeHexColor={normalizeHexColor}
          />
        </div>
      )}
    </div>
  );
  // function applySuggestionByIndex(view: EditorView, index: number) {
  //   if (!filteredSuggestionOptions.length || index < 0) return true;
  //   const normalizedIndex =
  //     ((index % filteredSuggestionOptions.length) +
  //       filteredSuggestionOptions.length) %
  //     filteredSuggestionOptions.length;
  //   const selectedSnippet = filteredSuggestionOptions[normalizedIndex];
  //   insertSnippet(
  //     view,
  //     selectedSnippet,
  //     snippetRowByName.get(selectedSnippet)?.casing ?? "none",
  //   );
  //   setIsSuggestionMenuOpen(false);
  //   setSuggestionSearch("");
  //   setActiveSuggestionIndex(-1);
  //   view.focus();
  //   return true;
  // }
  // function deleteSelectedRangeFromEditor() {
  //   const view = mainEditorRef.current;
  //   if (!view) return;

  //   const selection = view.state.selection.main;
  //   if (selection.empty) return;

  //   const cursor = selection.from;
  //   view.dispatch({
  //     changes: { from: selection.from, to: selection.to, insert: "" },
  //     selection: { anchor: cursor },
  //   });
  //   view.focus();
  // }

  // function handleSuggestionSearchKeyDown(
  //   event: React.KeyboardEvent<HTMLInputElement>,
  // ) {
  //   if (event.key === "ArrowDown" || event.key === "ArrowUp") {
  //     console.log("arrow key ");
  //     if (event.shiftKey) {
  //       console.log(
  //         "shift + arrow key pressed, ignoring for suggestion navigation",
  //       );
  //       return;
  //     }
  //   }

  //   if (event.key === "Escape") {
  //     event.preventDefault();
  //     setIsSuggestionMenuOpen(false);
  //     setSuggestionSearch("");
  //     mainEditorRef.current?.focus();
  //     return;
  //   }

  //   if (event.key === "ArrowDown") {
  //     event.preventDefault();
  //     if (!filteredSuggestionOptions.length) return;
  //     setActiveSuggestionIndex((prev) => {
  //       if (prev < 0) return 0;
  //       return Math.min(prev + 1, filteredSuggestionOptions.length - 1);
  //     });
  //     return;
  //   }

  //   if (event.key === "ArrowUp") {
  //     event.preventDefault();
  //     setActiveSuggestionIndex((prev) => {
  //       if (prev <= 0) {
  //         suggestionSearchInputRef.current?.focus();
  //         return -1;
  //       }
  //       return prev - 1;
  //     });
  //     return;
  //   }

  //   if (event.key === "Enter") {
  //     event.preventDefault();
  //     if (!filteredSuggestionOptions.length) return;
  //     const view = mainEditorRef.current;
  //     if (!view) return;
  //     const indexToApply =
  //       activeSuggestionIndex < 0 ? 0 : activeSuggestionIndex;
  //     applySuggestionByIndex(view, indexToApply);
  //     return;
  //   }

  //   const shouldResetActiveSuggestionIndex =
  //     event.key.length === 1 ||
  //     event.key === "Backspace" ||
  //     event.key === "Delete";

  //   if (shouldResetActiveSuggestionIndex) {
  //     setActiveSuggestionIndex(0);
  //   }
  // }
}

export default App;
