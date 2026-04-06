import {
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AgGridReact } from "ag-grid-react";
import {
  CellContextMenuEvent,
  ColDef,
  ModuleRegistry,
  AllCommunityModule,
  RowDragEndEvent,
} from "ag-grid-community";

// Mandatory CSS - including the theme
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./ag_grid_test.css";

ModuleRegistry.registerModules([AllCommunityModule]);

export type RowData = {
  profile: string;
  dialogue: string;
};

export type TableCommand =
  | { type: "add"; rows: RowData[] }
  | { type: "insert"; index: number; rows: RowData[] }
  | { type: "delete"; indexes: number[] }
  | { type: "replace"; rows: RowData[] }
  | { type: "clear" };

const defaultRows: RowData[] = [
  { profile: "Character1", dialogue: "High" },
  { profile: "Character2", dialogue: "Medium" },
  { profile: "Character3", dialogue: "High" },
  { profile: "Character1", dialogue: "High" },
  { profile: "Character2", dialogue: "Medium" },
  { profile: "Character3", dialogue: "High" },
  { profile: "Character1", dialogue: "High" },
  { profile: "Character2", dialogue: "Medium" },
  { profile: "Character3", dialogue: "High" },
  { profile: "Character1", dialogue: "High" },
  { profile: "Character2", dialogue: "Medium" },
  { profile: "Character3", dialogue: "High" },
  { profile: "Character1", dialogue: "High" },
  { profile: "Character2", dialogue: "Medium" },
  { profile: "Character3", dialogue: "High" },
];

export const createDefaultRows = (): RowData[] =>
  defaultRows.map((row) => ({ ...row }));

export const applyTableCommand = (
  prevRows: RowData[],
  command: TableCommand,
): RowData[] => {
  switch (command.type) {
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

type EditableAgGridTableProps = {
  rowData: RowData[];
  onRowDataChange: (
    updater: RowData[] | ((prev: RowData[]) => RowData[]),
  ) => void;
  height?: number;
};

export function EditableAgGridTable({
  rowData,
  onRowDataChange,
  height = 400,
}: EditableAgGridTableProps) {
  const columnDefs = useMemo<ColDef<RowData>[]>(
    () => [
      {
        colId: "select",
        headerName: "",
        width: 30,
        minWidth: 30,
        maxWidth: 30,
        pinned: "left",
        lockPinned: true,
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
        pinned: "left",
        lockPinned: true,
        rowDrag: true,
        sortable: false,
        filter: false,
        editable: false,
        suppressMovable: true,
        resizable: false,
        valueGetter: () => "",
      },
      {
        field: "profile",
        filter: true,
        editable: true,
        cellClass: "editable-cell",
      },
      {
        field: "dialogue",
        sortable: true,
        editable: true,
        cellClass: "editable-cell",
      },
    ],
    [],
  );
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
    onRowDataChange((prev) => prev.filter((row) => !targetSet.has(row)));
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
      className="ag-theme-quartz"
      style={{ height, width: "100%", border: "1px solid red" }}
      onContextMenuCapture={onGridContextMenuCapture}
    >
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        // rowClassRules={rowClassRules}
        rowSelection="multiple"
        suppressContextMenu={true}
        rowDragManaged={true}
        onRowDragEnd={onRowDragEnd}
        onCellContextMenu={onCellContextMenu}
        animateRows={true}
        onBodyScroll={() => setContextMenu(null)}
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

function TableComponent() {
  const [rowData, setRowData] = useState<RowData[]>(createDefaultRows());

  return (
    <EditableAgGridTable
      rowData={rowData}
      onRowDataChange={setRowData}
    />
  );
}

function AgGridTest() {
  return (
    <div>
      <h1>AG Grid Test</h1>
      <TableComponent />
    </div>
  );
}

export default AgGridTest;
