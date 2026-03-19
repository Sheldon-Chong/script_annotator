import React from "react";
import { HexColorPicker } from "react-colorful";
import styles from "../App.module.css";

type Props = {
  color: string;
  onChange: (c: string) => void;
  onApply: () => void;
  onCancel: () => void;
  normalizeHexColor: (v: string) => string;
};

export default function ColorPicker({
  color,
  onChange,
  onApply,
  onCancel,
  normalizeHexColor,
}: Props) {
  return (
    <div
      className={styles.colorPickerDialog}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.colorPickerTitle}>Pick highlight color</div>
      <div className={styles.colorPickerMapWrap}>
        <HexColorPicker
          color={normalizeHexColor(color)}
          onChange={onChange}
        />
      </div>
      <div className={styles.colorPickerRow}>
        <div
          className={styles.colorPickerPreview}
          style={{ backgroundColor: normalizeHexColor(color) }}
        />
        <input
          className={styles.colorPickerHexInput}
          value={color}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#ffe066"
        />
      </div>
      <div className={styles.colorPickerActions}>
        <button
          type="button"
          className={styles.snippetActionButton}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.snippetActionButton}
          onClick={onApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
