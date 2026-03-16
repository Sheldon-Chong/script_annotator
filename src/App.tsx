import React, { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { lineNumbers } from '@codemirror/view';
import { selectAll } from '@codemirror/commands';
import styles from './App.module.css';

type RenderResponse = {
  rendered: number;
  files: string[];
};

type RenderStatus = {
  tone: 'idle' | 'running' | 'success' | 'error';
  message: string;
};

type SnippetRow = {
  text: string;
  color: string;
};

const DEFAULT_SNIPPET_COLOR = '#ffe066';

function applySnippetToLine(lineText: string, snippet: string,): string {
  const doubleColonIdx = lineText.indexOf('::');
  if (doubleColonIdx !== -1) {
    return snippet + '::' + lineText.slice(doubleColonIdx + 2);
  }
  return snippet + '::' + (lineText.length > 0 ? ' ' + lineText : '');
}

class CharacterProfile {

  constructor(public name: string, public description: string,) {
  }
}

async function renderRequest(script: string): Promise<RenderResponse> {
  const response = await fetch("http://localhost:8000/textbox/render", {
    method: 'POST', // Specify the method as POST
    headers: {
      'Content-Type': 'application/json', // Inform the server the body is JSON
      'Accept': 'application/json', // Tell the server we expect JSON back
    },
    body: JSON.stringify({ script }), // Convert the data object to a JSON string
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Render failed with status ${response.status}`);
  }

  return response.json() as Promise<RenderResponse>;
}

async function showBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body });
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
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
    const separatorIndex = line.text.indexOf('::');
    if (separatorIndex > 0) {
      const snippet = line.text.slice(0, separatorIndex).trim();
      const color = highlightColorBySnippet.get(snippet) ?? fallbackHighlightColor;
      builder.add(line.from, line.from + separatorIndex, getMark(color));
    }
  }

  return builder.finish();
}

function createHighlightBeforeDoubleColon(
  highlightColorBySnippet: Map<string, string>,
  fallbackHighlightColor: string,
) {
  return ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = buildHighlightDecorations(view, highlightColorBySnippet, fallbackHighlightColor);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildHighlightDecorations(update.view, highlightColorBySnippet, fallbackHighlightColor);
      }
    }
  }, {
    decorations: plugin => plugin.decorations,
  });
}

const STARTING_SCRIPT = `
Hello world!


Hi.


Testing
testing

newline
`;

const STARTING_SNIPPETS = `
character_1
character_2
character_3
character_4
character_5    
`;

function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return DEFAULT_SNIPPET_COLOR;
}

function getReadableTextColor(backgroundHex: string): string {
  const normalized = normalizeHexColor(backgroundHex);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness >= 140 ? '#1f1f1f' : '#ffffff';
}

function parseSnippetRows(value: string): SnippetRow[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((text, index) => {
      const fallbackColors = [
        '#ffe066',
        '#b2f2bb',
        '#a5d8ff',
        '#ffc9c9',
        '#d0bfff',
        '#99e9f2',
        '#ffec99',
        '#ffd8a8',
      ];
      return {
        text,
        color: fallbackColors[index % fallbackColors.length],
      };
    });
}

function App() {
  const [mainValue, setMainValue] = useState(STARTING_SCRIPT);
  const [snippetRows, setSnippetRows] = useState<SnippetRow[]>(() => parseSnippetRows(STARTING_SNIPPETS));
  const [draggingSnippetRowIndex, setDraggingSnippetRowIndex] = useState<number | null>(null);
  const [snippetDropTargetIndex, setSnippetDropTargetIndex] = useState<number | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>({
    tone: 'idle',
    message: '',
  });
  const [hasRangeSelection, setHasRangeSelection] = useState(false);
  const [isSuggestionMenuOpen, setIsSuggestionMenuOpen] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState({ x: 16, y: 16 });
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const mainEditorRef = useRef<EditorView | null>(null);
  const mainEditorContainerRef = useRef<HTMLDivElement | null>(null);
  const previousRangeSelectionRef = useRef(false);

  const suggestionOptions = useMemo(() => {
    const uniqueOptions = new Set<string>();
    return snippetRows
      .map(row => row.text.trim())
      .filter(line => line.length > 0)
      .filter(line => {
        if (uniqueOptions.has(line)) {
          return false;
        }
        uniqueOptions.add(line);
        return true;
      });
  }, [snippetRows]);

  const snippetHighlightColorByName = useMemo(() => {
    const mapping = new Map<string, string>();
    snippetRows.forEach((row) => {
      const snippet = row.text.trim();
      if (!snippet || mapping.has(snippet)) {
        return;
      }
      mapping.set(snippet, normalizeHexColor(row.color));
    });
    return mapping;
  }, [snippetRows]);

  const highlightBeforeDoubleColon = useMemo(() => {
    return createHighlightBeforeDoubleColon(snippetHighlightColorByName, DEFAULT_SNIPPET_COLOR);
  }, [snippetHighlightColorByName]);

  const isSuggestionMenuActive = hasRangeSelection && isSuggestionMenuOpen && suggestionOptions.length > 0;

  function insertSnippet(view: EditorView, snippet: string) {
    if (!snippet) return true;

    const { state } = view;
    const selection = state.selection.main;

    if (selection.empty) {
      const line = state.doc.lineAt(selection.head);
      const newLine = applySnippetToLine(line.text, snippet);
      const doubleColonIdx = line.text.indexOf('::');
      const cursorOffset = doubleColonIdx !== -1
        ? snippet.length + 2
        : (line.text.length > 0 ? snippet.length + 3 : snippet.length + 2);

      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newLine },
        selection: { anchor: line.from + cursorOffset },
      });
      return true;
    }

    const startLine = state.doc.lineAt(selection.from).number;
    const endLine = state.doc.lineAt(selection.to).number;
    const changes: { from: number; to: number; insert: string }[] = [];

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      if (line.length === 0) continue;
      changes.push({ from: line.from, to: line.to, insert: applySnippetToLine(line.text, snippet) });
    }

    if (changes.length > 0) {
      view.dispatch({ changes, selection: state.selection });
    }

    return true;
  }

  function deleteCurrentLine(view: EditorView) {
    const { state } = view;
    const selection = state.selection.main;
    if (!selection.empty) return false;

    const line = state.doc.lineAt(selection.head);
    let from = line.from;
    let to = line.to;
    let cursor = from;

    if (to < state.doc.length) {
      to += 1;
      cursor = from;
    } else if (from > 0) {
      from -= 1;
      cursor = from;
    }

    if (from === to) return true;

    view.dispatch({
      changes: { from, to, insert: '' },
      selection: { anchor: cursor },
    });
    return true;
  }

  function applySuggestion(option: string) {
    const view = mainEditorRef.current;
    if (!view) return;
    insertSnippet(view, option);
    view.focus();
  }

  function applySuggestionByIndex(view: EditorView, index: number) {
    if (!suggestionOptions.length) return true;
    const normalizedIndex = ((index % suggestionOptions.length) + suggestionOptions.length) % suggestionOptions.length;
    insertSnippet(view, suggestionOptions[normalizedIndex]);
    setIsSuggestionMenuOpen(false);
    setActiveSuggestionIndex(normalizedIndex);
    view.focus();
    return true;
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

    setSuggestionPosition(prev => (prev.x === x && prev.y === y ? prev : { x, y }));
  }

  useEffect(() => {
    if (!suggestionOptions.length) {
      setActiveSuggestionIndex(0);
      return;
    }
    setActiveSuggestionIndex(prev => Math.min(prev, suggestionOptions.length - 1));
  }, [suggestionOptions]);

  useEffect(() => {
    if (!hasRangeSelection) {
      setIsSuggestionMenuOpen(false);
      setActiveSuggestionIndex(0);
    }
  }, [hasRangeSelection]);

  function handleSuggestionMouseEnter(index: number) {
    setActiveSuggestionIndex(index);
  }

  function addSnippetRow() {
    setSnippetRows(prev => [...prev, { text: '', color: DEFAULT_SNIPPET_COLOR }]);
  }

  function updateSnippetText(index: number, value: string) {
    setSnippetRows(prev => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, text: value } : row)));
  }

  function updateSnippetColor(index: number, value: string) {
    setSnippetRows(prev => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, color: value } : row)));
  }

  function deleteSnippetRow(index: number) {
    setSnippetRows(prev => {
      if (prev.length <= 1) {
        return [{ text: '', color: DEFAULT_SNIPPET_COLOR }];
      }
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  function moveSnippetRow(index: number, direction: -1 | 1) {
    setSnippetRows(prev => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function handleSnippetDragStart(index: number) {
    setDraggingSnippetRowIndex(index);
    setSnippetDropTargetIndex(index);
  }

  function handleSnippetDragEnter(index: number) {
    if (draggingSnippetRowIndex === null || draggingSnippetRowIndex === index) {
      return;
    }
    setSnippetDropTargetIndex(index);
  }

  function handleSnippetDragOver(event: React.DragEvent<HTMLTableRowElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleSnippetDrop(targetIndex: number) {
    if (draggingSnippetRowIndex === null || draggingSnippetRowIndex === targetIndex) {
      setDraggingSnippetRowIndex(null);
      setSnippetDropTargetIndex(null);
      return;
    }

    setSnippetRows(prev => {
      const next = [...prev];
      const [item] = next.splice(draggingSnippetRowIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });

    setDraggingSnippetRowIndex(null);
    setSnippetDropTargetIndex(null);
  }

  function handleSnippetDragEnd() {
    setDraggingSnippetRowIndex(null);
    setSnippetDropTargetIndex(null);
  }

  async function handleRenderClick() {
    setIsRendering(true);
    setRenderStatus({
      tone: 'running',
      message: 'Rendering script...',
    });

    try {
      const result = await renderRequest(mainValue);
      const message = `Render complete. Generated ${result.rendered} file${result.rendered === 1 ? '' : 's'}.`;
      setRenderStatus({
        tone: 'success',
        message,
      });
      await showBrowserNotification('Render complete', message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Render failed.';
      setRenderStatus({
        tone: 'error',
        message,
      });
      await showBrowserNotification('Render failed', message);
    } finally {
      setIsRendering(false);
    }
  }

  function openSuggestionsMenu(view: EditorView) {
    if (!hasRangeSelection || suggestionOptions.length === 0) return false;
    setIsSuggestionMenuOpen(true);
    updateSuggestionPosition(view);
    return true;
  }

  const mainExtensions = useMemo(() => {
    const snippetBindings = Array.from({ length: 10 }, (_, idx) => ({
      key: `Alt-${idx === 9 ? 0 : idx + 1}`,
      run: (view: EditorView) => insertSnippet(view, snippetRows[idx]?.text.trim() || ''),
      preventDefault: true,
    }));

    const suggestionNavigationBindings = [
      {
        key: 'ArrowDown',
        run: () => {
          if (!isSuggestionMenuActive) return false;
          setActiveSuggestionIndex(prev => (prev + 1) % suggestionOptions.length);
          return true;
        },
        preventDefault: true,
      },
      {
        key: 'ArrowUp',
        run: () => {
          if (!isSuggestionMenuActive) return false;
          setActiveSuggestionIndex(prev => (prev - 1 + suggestionOptions.length) % suggestionOptions.length);
          return true;
        },
        preventDefault: true,
      },
      {
        key: 'Enter',
        run: (view: EditorView) => {
          if (!isSuggestionMenuActive) return false;
          return applySuggestionByIndex(view, activeSuggestionIndex);
        },
        preventDefault: true,
      },
    ];

    return [
      lineNumbers(),
      EditorView.lineWrapping,
      highlightBeforeDoubleColon,
      Prec.highest(keymap.of(suggestionNavigationBindings)),
      Prec.highest(keymap.of([
        {
          key: 'Ctrl-Space',
          run: (view: EditorView) => {
            console.log('Ctrl-Space pressed');
            return openSuggestionsMenu(view);
          },
          preventDefault: true,
        },
        {
          key: 'Mod-Space',
          run: (view: EditorView) => openSuggestionsMenu(view),
          preventDefault: true,
        },
      ])),
      keymap.of([
        ...snippetBindings,
        {
          key: 'Ctrl-Space',
          run: (view: EditorView) => openSuggestionsMenu(view),
          preventDefault: true,
        },
        {
          key: 'Mod-Space',
          run: (view: EditorView) => openSuggestionsMenu(view),
          preventDefault: true,
        },
        {
          key: 'Mod-f',
          run: (view: EditorView) => selectAll(view),
          preventDefault: true,
        },
        {
          key: 'Mod-x',
          run: (view: EditorView) => deleteCurrentLine(view),
          preventDefault: false,
        },
      ]),
    ];
  }, [snippetRows, isSuggestionMenuActive, suggestionOptions, activeSuggestionIndex, hasRangeSelection]);

  return (
    <div className={styles.container}>
      <h2>Script Annotator</h2>
      <div className={styles.columns}>
        <div className={styles.editor}>
          <table className={styles.snippetTable}>
            <thead>
              <tr>
                <th>Snippet</th>
                <th>Color</th>
                <th className={styles.snippetActionsHeader}></th>
              </tr>
            </thead>
            <tbody>
              {snippetRows.map((row, index) => (
                <tr
                  key={`snippet-row-${index}`}
                  className={snippetDropTargetIndex === index ? styles.snippetRowDropTarget : ''}
                  onDragEnter={() => handleSnippetDragEnter(index)}
                  onDragOver={handleSnippetDragOver}
                  onDrop={() => handleSnippetDrop(index)}
                >
                  <td>
                    <div className={styles.snippetInputRow}>
                      <button
                        type="button"
                        className={`${styles.snippetActionButton} ${styles.snippetDragHandle}`}
                        draggable
                        onDragStart={() => handleSnippetDragStart(index)}
                        onDragEnd={handleSnippetDragEnd}
                        title="Drag to reorder"
                      >
                        ≣
                      </button>
                      <input
                        className={styles.snippetInput}
                        value={row.text}
                        onChange={event => updateSnippetText(index, event.target.value)}
                        placeholder="Enter snippet"
                      />
                    </div>
                  </td>
                  <td>
                    <div className={styles.snippetColorRow}>
                      <input
                        className={styles.snippetColorInput}
                        value={row.color}
                        onChange={event => updateSnippetColor(index, event.target.value)}
                        placeholder="#ffe066"
                        style={{
                          backgroundColor: normalizeHexColor(row.color),
                          color: getReadableTextColor(row.color),
                        }}
                      />
                      <input
                        type="color"
                        className={styles.snippetColorPickerButton}
                        value={normalizeHexColor(row.color)}
                        onChange={event => updateSnippetColor(index, event.target.value)}
                        title="Pick color"
                        aria-label="Pick snippet color"
                      />
                    </div>
                  </td>
                  <td className={styles.snippetActions}>
                    <button
                      type="button"
                      className={styles.snippetActionButton}
                      onClick={() => deleteSnippetRow(index)}
                    >
                      𐄂
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className={styles.addSnippetButton}
            onClick={addSnippetRow}
          >
            Add row
          </button>
        </div>

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
              setHasRangeSelection(rangeSelected);
              setIsSuggestionMenuOpen(rangeSelected);
              previousRangeSelectionRef.current = rangeSelected;
              updateSuggestionPosition(view);
            }}
            onUpdate={(update: ViewUpdate) => {
              const rangeSelected = !update.state.selection.main.empty;
              setHasRangeSelection(prev => (prev === rangeSelected ? prev : rangeSelected));

              if (!rangeSelected) {
                setIsSuggestionMenuOpen(false);
              } else if (!previousRangeSelectionRef.current) {
                setIsSuggestionMenuOpen(true);
                updateSuggestionPosition(update.view);
              }

              if (isSuggestionMenuOpen && update.selectionSet) {
                updateSuggestionPosition(update.view);
              }

              previousRangeSelectionRef.current = rangeSelected;
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
          {isSuggestionMenuActive && (
            <div
              className={styles.suggestionsPanel}
              style={{ left: `${suggestionPosition.x}px`, top: `${suggestionPosition.y}px` }}
            >
              <div className={styles.suggestionsTitle}></div>
              {suggestionOptions.length === 0 ? (
                <div className={styles.suggestionsEmpty}>Add suggestion lines in the snippets editor.</div>
              ) : (
                <div className={styles.suggestionsList}>
                  {suggestionOptions.map((option, index) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.suggestionButton} ${index === activeSuggestionIndex ? styles.suggestionButtonActive : ''}`}
                      onMouseDown={event => event.preventDefault()}
                      onMouseEnter={() => handleSuggestionMouseEnter(index)}
                      onClick={() => applySuggestion(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={styles.commandBar}
      >
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
        >{isRendering ? 'Rendering...' : 'Render script'}</button>
      </div>
    </div>
  );
}

export default App;
