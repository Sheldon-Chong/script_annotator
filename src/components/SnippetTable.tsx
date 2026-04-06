import React from "react";
import styles from "../App.module.css";

export type casing = "lowercase" | "uppercase" | "normal" | "none";

export type Snippet = {
  text: string;
  color: string;
  casing?: casing;
};

export const DEFAULT_SNIPPET_ROW: Snippet = {
  text: "",
  color: "#ffe066",
  casing: "none",
};

type Handlers = {
  onSnippetDragEnter: (index: number) => void;
  onSnippetDragOver: (event: React.DragEvent<HTMLTableRowElement>) => void;
  onSnippetDrop: (index: number) => void;
  onSnippetDragStart: (index: number) => void;
  onSnippetDragEnd: () => void;
  onSnippetTextChange: (index: number, value: string) => void;
  onSnippetCasingChange: (index: number, value: casing) => void;
  onOpenColorPicker: (index: number) => void;
  onDeleteSnippetRow: (index: number) => void;
  normalizeHexColor: (value: string) => string;
};

type SnippetTableProps = {
  snippetRows: Snippet[];
  snippetDropTargetIndex: number | null;
  onAddSnippetRow: () => void;
  selectionModeEnabled?: boolean;
  selectedRowIndices?: number[];
  onToggleRowSelection?: (index: number) => void;
} & Handlers;

type SnippetTableRowProps = {
  row: Snippet;
  index: number;
  isDropTarget: boolean;
  selectionModeEnabled?: boolean;
  selected?: boolean;
  onToggleRowSelection?: (index: number) => void;
} & Handlers;

function SnippetTableRow({
  row,
  index,
  isDropTarget,
  selectionModeEnabled = false,
  selected = false,
  onSnippetDragEnter,
  onSnippetDragOver,
  onSnippetDrop,
  onSnippetDragStart,
  onSnippetDragEnd,
  onSnippetTextChange,
  onSnippetCasingChange,
  onOpenColorPicker,
  onDeleteSnippetRow,
  normalizeHexColor,
  onToggleRowSelection,
}: SnippetTableRowProps): React.ReactElement {
  return (
    <tr
      className={isDropTarget ? styles.snippetRowDropTarget : ""}
      onDragEnter={() => onSnippetDragEnter(index)}
      onDragOver={onSnippetDragOver}
      onDrop={() => onSnippetDrop(index)}
    >
      <td>
        <div className={styles.snippetInputRow}>
          {selectionModeEnabled && (
            <input
              type="checkbox"
              className={styles.snippetCheckbox}
              checked={selected}
              onChange={() => onToggleRowSelection?.(index)}
            />
          )}
          <button
            type="button"
            className={`${styles.snippetActionButton} ${styles.snippetDragHandle}`}
            draggable
            onDragStart={() => onSnippetDragStart(index)}
            onDragEnd={onSnippetDragEnd}
            title="Drag to reorder"
            style={{ color: "#b9b9b9" }}
          >
            ≣
          </button>
          <input
            className={styles.snippetInput}
            value={row.text}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onSnippetTextChange(index, event.target.value)
            }
            placeholder="Enter snippet"
          />
        </div>
      </td>
      <td>
        <div className={styles.snippetColorRow}>
          <button
            type="button"
            className={styles.snippetColorPickerButton}
            style={{ backgroundColor: normalizeHexColor(row.color) }}
            onClick={() => onOpenColorPicker(index)}
            title="Open color picker"
            aria-label="Open snippet color picker"
          />
        </div>
      </td>
      <td>
        <select
          className={styles.snippetTextTransformSelect}
          value={row.casing || "none"}
          onChange={(event) =>
            onSnippetCasingChange(index, event.target.value as casing)
          }
        >
          <option value="lowercase">lowercase</option>
          <option value="uppercase">uppercase</option>
          <option value="normal">normal</option>
          <option value="none">none</option>
        </select>
      </td>
      <td className={styles.snippetActions}>
        <button
          type="button"
          className={styles.snippetActionButton}
          onClick={() => onDeleteSnippetRow(index)}
        >
          𐄂
        </button>
      </td>
    </tr>
  );
}

function SnippetTable({
  snippetRows,
  snippetDropTargetIndex,
  onAddSnippetRow,
  selectionModeEnabled = false,
  selectedRowIndices,
  onToggleRowSelection,
  ...handlers
}: SnippetTableProps): React.ReactElement {
  return (
    <>
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
            <SnippetTableRow
              key={`snippet-row-${index}`}
              row={row}
              index={index}
              isDropTarget={snippetDropTargetIndex === index}
              selectionModeEnabled={selectionModeEnabled}
              selected={selectedRowIndices?.includes(index) ?? false}
              onToggleRowSelection={onToggleRowSelection}
              {...handlers}
            />
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className={styles.addSnippetButton}
        onClick={onAddSnippetRow}
      >
        Add row
      </button>
    </>
  );
}

export default SnippetTable;
