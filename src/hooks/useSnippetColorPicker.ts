import { useState } from "react";
import { type Snippet } from "../components/SnippetTable";

type UseSnippetColorPickerArgs = {
  snippetRows: Snippet[];
  defaultSnippetColor: string;
  normalizeHexColor: (value: string) => string;
  updateSnippetColor: (index: number, value: string) => void;
};

export function useSnippetColorPicker({
  snippetRows,
  defaultSnippetColor,
  normalizeHexColor,
  updateSnippetColor,
}: UseSnippetColorPickerArgs) {
  const [activeColorPickerIndex, setActiveColorPickerIndex] = useState<
    number | null
  >(null);
  const [colorPickerDraft, setColorPickerDraft] = useState(defaultSnippetColor);

  function openColorPicker(index: number) {
    const current = snippetRows[index]?.color ?? defaultSnippetColor;
    setColorPickerDraft(normalizeHexColor(current));
    setActiveColorPickerIndex(index);
  }

  function closeColorPicker() {
    setActiveColorPickerIndex(null);
  }

  function applyColorPicker() {
    if (activeColorPickerIndex === null) {
      return;
    }

    updateSnippetColor(activeColorPickerIndex, normalizeHexColor(colorPickerDraft));
    closeColorPicker();
  }

  return {
    activeColorPickerIndex,
    colorPickerDraft,
    setColorPickerDraft,
    openColorPicker,
    closeColorPicker,
    applyColorPicker,
  };
}
