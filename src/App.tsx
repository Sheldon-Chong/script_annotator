import React, { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { lineNumbers } from '@codemirror/view';
import { selectAll } from '@codemirror/commands';
import styles from './App.module.css';

function applySnippetToLine(lineText: string, snippet: string): string {
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

function buildHighlightDecorations(
  view: EditorView,
  highlightClassBySnippet: Map<string, string>,
  fallbackHighlightClass: string,
) {
  const builder = new RangeSetBuilder<Decoration>();
  const markByClass = new Map<string, Decoration>();

  function getMark(className: string) {
    const existing = markByClass.get(className);
    if (existing) return existing;
    const next = Decoration.mark({ class: className });
    markByClass.set(className, next);
    return next;
  }

  const firstLine = view.state.doc.lineAt(view.viewport.from).number;
  const lastLine = view.state.doc.lineAt(view.viewport.to).number;

  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const separatorIndex = line.text.indexOf('::');
    if (separatorIndex > 0) {
      const snippet = line.text.slice(0, separatorIndex).trim();
      const className = highlightClassBySnippet.get(snippet) ?? fallbackHighlightClass;
      builder.add(line.from, line.from + separatorIndex, getMark(className));
    }
  }

  return builder.finish();
}

function createHighlightBeforeDoubleColon(
  highlightClassBySnippet: Map<string, string>,
  fallbackHighlightClass: string,
) {
  return ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = buildHighlightDecorations(view, highlightClassBySnippet, fallbackHighlightClass);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildHighlightDecorations(update.view, highlightClassBySnippet, fallbackHighlightClass);
      }
    }
  }, {
    decorations: plugin => plugin.decorations,
  });
}

function App() {
  const [mainValue, setMainValue] = useState('line1\nline2\nline3');
  const [snippetValue, setSnippetValue] = useState('char1\nchar2');
  const [hasRangeSelection, setHasRangeSelection] = useState(false);
  const [isSuggestionMenuOpen, setIsSuggestionMenuOpen] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState({ x: 16, y: 16 });
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const mainEditorRef = useRef<EditorView | null>(null);
  const mainEditorContainerRef = useRef<HTMLDivElement | null>(null);
  const previousRangeSelectionRef = useRef(false);

  const snippetLines = useMemo(() => snippetValue.split('\n'), [snippetValue]);
  const suggestionOptions = useMemo(() => {
    const uniqueOptions = new Set<string>();
    return snippetLines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => {
        if (uniqueOptions.has(line)) {
          return false;
        }
        uniqueOptions.add(line);
        return true;
      });
  }, [snippetLines]);

  const snippetHighlightClasses = useMemo(() => ([
    styles.highlight0,
    styles.highlight1,
    styles.highlight2,
    styles.highlight3,
    styles.highlight4,
    styles.highlight5,
    styles.highlight6,
    styles.highlight7,
  ]), []);

  const snippetHighlightClassByName = useMemo(() => {
    const mapping = new Map<string, string>();
    suggestionOptions.forEach((snippet, index) => {
      mapping.set(snippet, snippetHighlightClasses[index % snippetHighlightClasses.length]);
    });
    return mapping;
  }, [suggestionOptions, snippetHighlightClasses]);

  const highlightBeforeDoubleColon = useMemo(() => {
    return createHighlightBeforeDoubleColon(snippetHighlightClassByName, styles.highlight);
  }, [snippetHighlightClassByName]);

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

  function openSuggestionsMenu(view: EditorView) {
    if (!hasRangeSelection || suggestionOptions.length === 0) return false;
    setIsSuggestionMenuOpen(true);
    updateSuggestionPosition(view);
    return true;
  }

  const mainExtensions = useMemo(() => {
    const snippetBindings = Array.from({ length: 10 }, (_, idx) => ({
      key: `Alt-${idx === 9 ? 0 : idx + 1}`,
      run: (view: EditorView) => insertSnippet(view, snippetLines[idx] || ''),
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
  }, [snippetLines, isSuggestionMenuActive, suggestionOptions, activeSuggestionIndex, hasRangeSelection]);

  const snippetExtensions = useMemo(() => [lineNumbers(), EditorView.lineWrapping], []);

  return (
    <div className={styles.container}>
      <h2>Script Annotator</h2>
      <div
        className={styles.editor}
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
              <div className={styles.suggestionsEmpty}>Add suggestion lines in the second editor.</div>
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
      <div className={styles.editor}>
        <CodeMirror
          value={snippetValue}
          onChange={(value: string) => setSnippetValue(value)}
          placeholder="Type your snippets here, one per line..."
          basicSetup={{
            foldGutter: false,
            dropCursor: false,
            allowMultipleSelections: true,
            indentOnInput: false,
          }}
          extensions={snippetExtensions}
        />
      </div>
    </div>
  );
}

export default App;
