import {
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { AgGridReact } from "ag-grid-react";
import {
  BodyScrollEvent,
  CellContextMenuEvent,
  ColDef,
  ModuleRegistry,
  AllCommunityModule,
  RowDragEndEvent,
} from "ag-grid-community";

import { themeBalham } from "ag-grid-community";
import "./ag_grid_test.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeBalham.withParams({
  accentColor: "#2563eb",
  borderRadius: 10,
  fontFamily: "Inter, sans-serif",
  backgroundColor: "#f8fafc",
});

export type RowData = {
  profile: string;
  dialogue: string;
  filepath: string;
  duration: number;
  start: number;
  end: number;
  name: string;
  track: number;
  test: string;
};

export type RowDataColumn = keyof RowData;

export const DEFAULT_ROW_DATA_COLUMNS: RowDataColumn[] = [
  "profile",
  "dialogue",
  "name",
  "filepath",
  "duration",
  "start",
  "end",
  "track",
  "test",
];

const staticData = ["test", "test2"];

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  if (!HEX_COLOR_REGEX.test(prefixed)) {
    return null;
  }

  const withoutHash = prefixed.slice(1);
  const normalized =
    withoutHash.length === 3
      ? withoutHash
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : withoutHash;

  return `#${normalized.toUpperCase()}`;
};

type ClipExtension = {
  is_imported_clip?: boolean;
};

const dataColumnDefsByField: Record<
  RowDataColumn,
  ColDef<RowData> & ClipExtension
> = {
  filepath: {
    cellClass: "editable-cell",
    is_imported_clip: true,
  },
  duration: {
    cellClass: "editable-cell",
    is_imported_clip: true,
    width: 60,
  },
  start: {
    cellClass: "editable-cell",
    is_imported_clip: true,
    width: 60,
  },
  end: {
    cellClass: "editable-cell",
    is_imported_clip: true,
    width: 60,
  },
  track: {
    cellClass: "editable-cell",
    is_imported_clip: true,
    width: 80,
  },
  test: {
    valueGetter: (params) => `${staticData[params.node.rowIndex]})`,
  },
  name: {
    cellClass: "editable-cell",
    is_imported_clip: true,
  },
  profile: {
    is_imported_clip: true,
    filter: true,
    cellClass: "editable-cell",
    width: 120,
    cellRenderer: (params: any) => {
      const colorHex = normalizeHexColor(params.value) ?? "#9CA3AF";

      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            height: "100%",
            padding: "0 6px",
          }}
        >
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              border: "1px solid #94a3b8",
              backgroundColor: colorHex,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "12px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "#0f172a",
              whiteSpace: "nowrap",
            }}
          >
            {colorHex}
          </span>
        </div>
      );
    },
  },
  dialogue: {
    is_imported_clip: true,
    cellClass: "editable-cell",
  },
};

export type TableCommand =
  | { action: "add"; rows: RowData[] }
  | { action: "insert"; index: number; rows: RowData[] }
  | { action: "delete"; indexes: number[] }
  | { action: "replace"; rows: RowData[] }
  | { action: "clear" };

const defaultRows: RowData[] = [];

for (let i = 1; i <= 200; i++) {
  defaultRows.push({
    profile: "Profile 1",
    dialogue: "Dialogue 1",
    name: "Clip 1",
    filepath: "/path/to/clip1.mp4",
    duration: 120,
    start: 0,
    end: 120,
    track: 1,
    test: "Test 1",
  });
}

export const createDefaultRows = (): RowData[] =>
  defaultRows.map((row) => ({ ...row }));

export const applyTableCommand = (
  prevRows: RowData[],
  command: TableCommand,
): RowData[] => {
  switch (command.action) {
    case "add":
      return [...prevRows, ...command.rows];
    case "insert": {
      const clampedIndex = Math.min(
        Math.max(command.index, 0),
        prevRows.length,
      );
      const next = [...prevRows];
      next.splice(clampedIndex, 0, ...command.rows);
      return next;
    }
    case "delete": {
      const indexes = new Set(command.indexes);
      return prevRows.filter((_, index) => !indexes.has(index));
    }
    case "replace":
      return [...command.rows];
    case "clear":
      return [];
    default:
      return prevRows;
  }
};

type ContextMenuState = {
  x: number;
  y: number;
  targetRows: RowData[];
};

type GridScrollPosition = {
  top: number;
  left: number;
};

export function VideoClipSubstitutionsTable({
  rowData,
  onRowDataChange,
  height = 500,
  onScroll = () => {},
  visibleColumns = DEFAULT_ROW_DATA_COLUMNS,
  fixedData = [],
  syncScrollPosition = null,
}: any) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tableColumnConfigurations = useMemo<ColDef<RowData>[]>(() => {
    const utilityColumns: ColDef<RowData>[] = [
      {
        colId: "select",
        headerName: "",
        width: 30,
        minWidth: 30,
        maxWidth: 30,
        checkboxSelection: true,
        headerCheckboxSelection: true,
        sortable: false,
        filter: false,
        editable: false,
        suppressMovable: true,
        resizable: false,
        valueGetter: () => "",
      },
      {
        colId: "drag",
        headerName: "",
        width: 40,
        minWidth: 40,
        maxWidth: 40,
        // pinned: "left",
        // lockPinned: true,
        rowDrag: true,
        sortable: false,
        filter: false,
        editable: false,
        suppressMovable: true,
        resizable: false,
        valueGetter: () => "",
      },
    ];

    const requestedColumns =
      visibleColumns.length > 0 ? visibleColumns : DEFAULT_ROW_DATA_COLUMNS;
    const dataColumns = requestedColumns
      .map((field) => {
        const obj = {};

        if (dataColumnDefsByField[field].is_imported_clip) {
          obj["editable"] = false;
          obj["sortable"] = false;
          obj["cellStyle"] = { backgroundColor: "#cfd1d3" };
          obj["valueGetter"] = (params: any) => {
            const rowIndex = params.node.rowIndex;
            const importedClip = fixedData[rowIndex];
            if (!importedClip || typeof importedClip !== "object") {
              return "";
            }

            const lowerCaseField = String(field).toLowerCase();
            const matchingKey = Object.keys(importedClip).find(
              (clipKey) => clipKey.toLowerCase() === lowerCaseField,
            );

            return matchingKey ? importedClip[matchingKey] : "";
          };
        }
        return {
          field,
          ...dataColumnDefsByField[field],
          ...obj,
        };
      })
      .filter(Boolean);

    const pinnedBeforeControlsFields: RowDataColumn[] = [
      "name",
      "profile",
      "dialogue",
    ];

    const pinnedBeforeControlsColumns = pinnedBeforeControlsFields
      .map((field) => dataColumns.find((col) => col.field === field))
      .filter(Boolean) as ColDef<RowData>[];

    const fixedDataColumns = dataColumns.filter(
      (col) =>
        col.is_imported_clip &&
        !pinnedBeforeControlsFields.includes(col.field as RowDataColumn),
    );
    const editableColumns = dataColumns.filter(
      (col) =>
        !col.is_imported_clip &&
        !pinnedBeforeControlsFields.includes(col.field as RowDataColumn),
    );

    return [
      ...fixedDataColumns,
      ...pinnedBeforeControlsColumns,
      ...utilityColumns,
      ...editableColumns,
    ];
  }, [visibleColumns, fixedData]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (!syncScrollPosition) {
      return;
    }

    const viewport =
      tableRef.current?.querySelector<HTMLElement>(".ag-body-viewport");

    if (!viewport) {
      return;
    }

    if (Math.abs(viewport.scrollTop - syncScrollPosition.top) > 1) {
      viewport.scrollTop = syncScrollPosition.top;
    }
    if (Math.abs(viewport.scrollLeft - syncScrollPosition.left) > 1) {
      viewport.scrollLeft = syncScrollPosition.left;
    }
  }, [syncScrollPosition]);

  const onCellContextMenu = (event: CellContextMenuEvent<RowData>) => {
    event.event?.preventDefault();

    const selectedRows = event.api
      .getSelectedNodes()
      .map((node) => node.data)
      .filter((data): data is RowData => Boolean(data));

    const clickedRow = event.node?.data;
    if (!clickedRow && selectedRows.length === 0) return;

    const targetRows =
      clickedRow && selectedRows.includes(clickedRow)
        ? selectedRows
        : clickedRow
          ? [clickedRow]
          : selectedRows;

    const mouseEvent = event.event as MouseEvent | undefined;
    setContextMenu({
      x: mouseEvent?.clientX ?? 0,
      y: mouseEvent?.clientY ?? 0,
      targetRows,
    });
  };

  const deleteTargetRows = () => {
    if (!contextMenu) return;
    const targetSet = new Set(contextMenu.targetRows);
    onRowDataChange((prev: RowData[]) =>
      prev.filter((row: RowData) => !targetSet.has(row)),
    );
    setContextMenu(null);
  };

  const onGridContextMenuCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const onRowDragEnd = (event: RowDragEndEvent<RowData>) => {
    const reorderedRows: RowData[] = [];
    event.api.forEachNode((node) => {
      if (node.data) reorderedRows.push(node.data);
    });
    onRowDataChange(reorderedRows);
  };

  return (
    // The wrapper div must have a height and the theme class
    <div
      ref={tableRef}
      className="ag-grid-table"
      style={{ height, width: "100%" }}
      onContextMenuCapture={onGridContextMenuCapture}
    >
      <AgGridReact
        theme={gridTheme}
        rowData={rowData}
        columnDefs={tableColumnConfigurations}
        // rowClassRules={rowClassRules}
        rowSelection="multiple"
        suppressContextMenu={true}
        rowDragManaged={true}
        onRowDragEnd={onRowDragEnd}
        onCellContextMenu={onCellContextMenu}
        animateRows={true}
        onBodyScroll={(event: BodyScrollEvent) => {
          onScroll({
            top: event.top,
            left: event.left,
          });
          setContextMenu(null);
        }}
        undoRedoCellEditing={true}
        undoRedoCellEditingLimit={20}
      />
      {contextMenu && (
        <div
          className="grid-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid-context-menu__title">
            {contextMenu.targetRows.length} selected
          </div>
          <button
            type="button"
            className="grid-context-menu__item"
          ></button>
          <button
            type="button"
            className="grid-context-menu__item"
          ></button>
          <button
            type="button"
            className="grid-context-menu__item"
          ></button>
          <button
            type="button"
            className="grid-context-menu__item grid-context-menu__item--danger"
            onClick={deleteTargetRows}
          >
            Delete Selected
          </button>
        </div>
      )}
    </div>
  );
}
