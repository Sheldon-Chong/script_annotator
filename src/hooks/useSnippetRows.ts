import React, { useState } from "react";
import { type Snippet, type casing } from "../components/SnippetTable";

type UseSnippetRowsArgs = {
  startingSnippets: string;
  defaultSnippetColor: string;
};

const FALLBACK_SNIPPET_COLORS = [
  "#ffe066",
  "#b2f2bb",
  "#a5d8ff",
  "#ffc9c9",
  "#d0bfff",
  "#99e9f2",
  "#ffec99",
  "#ffd8a8",
];

function parseSnippetRows(value: string): Snippet[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text, index) => ({
      text,
      color: FALLBACK_SNIPPET_COLORS[index % FALLBACK_SNIPPET_COLORS.length],
      casing: "none",
    }));
}

export function useSnippetRows({
  startingSnippets,
  defaultSnippetColor,
}: UseSnippetRowsArgs) {
  const [snippetRows, setSnippetRows] = useState<Snippet[]>(() =>
    parseSnippetRows(startingSnippets),
  );
  const [draggingSnippetRowIndex, setDraggingSnippetRowIndex] = useState<
    number | null
  >(null);
  const [snippetDropTargetIndex, setSnippetDropTargetIndex] = useState<
    number | null
  >(null);

  function addSnippetRow() {
    setSnippetRows((prev) => [
      ...prev,
      { text: "", color: defaultSnippetColor, casing: "none" },
    ]);
  }

  function updateSnippetText(index: number, value: string) {
    setSnippetRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, text: value } : row,
      ),
    );
  }

  function updateSnippetColor(index: number, value: string) {
    setSnippetRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, color: value } : row,
      ),
    );
  }

  function updateSnippetCasing(index: number, value: casing) {
    setSnippetRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, casing: value } : row,
      ),
    );
  }

  function deleteSnippetRow(index: number) {
    setSnippetRows((prev) => {
      if (prev.length <= 1) {
        return [{ text: "", color: defaultSnippetColor, casing: "none" }];
      }
      return prev.filter((_, rowIndex) => rowIndex !== index);
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
    event.dataTransfer.dropEffect = "move";
  }

  function handleSnippetDrop(targetIndex: number) {
    if (
      draggingSnippetRowIndex === null ||
      draggingSnippetRowIndex === targetIndex
    ) {
      setDraggingSnippetRowIndex(null);
      setSnippetDropTargetIndex(null);
      return;
    }

    setSnippetRows((prev) => {
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

  return {
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
  };
}
