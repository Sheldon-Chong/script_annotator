import React from 'react';
import styles from '../App.module.css';

export type SnippetRow = {
  text: string;
  color: string;
};

type SnippetTableProps = {
  snippetRows: SnippetRow[];
  snippetDropTargetIndex: number | null;
  onSnippetDragEnter: (index: number) => void;
  onSnippetDragOver: (event: React.DragEvent<HTMLTableRowElement>) => void;
  onSnippetDrop: (index: number) => void;
  onSnippetDragStart: (index: number) => void;
  onSnippetDragEnd: () => void;
  onSnippetTextChange: (index: number, value: string) => void;
  onOpenColorPicker: (index: number) => void;
  onDeleteSnippetRow: (index: number) => void;
  onAddSnippetRow: () => void;
  normalizeHexColor: (value: string) => string;
};

function SnippetTable({
  snippetRows,
  snippetDropTargetIndex,
  onSnippetDragEnter,
  onSnippetDragOver,
  onSnippetDrop,
  onSnippetDragStart,
  onSnippetDragEnd,
  onSnippetTextChange,
  onOpenColorPicker,
  onDeleteSnippetRow,
  onAddSnippetRow,
  normalizeHexColor,
}: SnippetTableProps) {
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
            <tr
              key={`snippet-row-${index}`}
              className={snippetDropTargetIndex === index ? styles.snippetRowDropTarget : ''}
              onDragEnter={() => onSnippetDragEnter(index)}
              onDragOver={onSnippetDragOver}
              onDrop={() => onSnippetDrop(index)}
            >
              <td>
                <div className={styles.snippetInputRow}>
                  <button
                    type="button"
                    className={`${styles.snippetActionButton} ${styles.snippetDragHandle}`}
                    draggable
                    onDragStart={() => onSnippetDragStart(index)}
                    onDragEnd={onSnippetDragEnd}
                    title="Drag to reorder"
                  >
                    ≣
                  </button>
                  <input
                    className={styles.snippetInput}
                    value={row.text}
                    onChange={event => onSnippetTextChange(index, event.target.value)}
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
