import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  VideoClipSubstitutionsTable,
  DEFAULT_ROW_DATA_COLUMNS,
  RowData,
  RowDataColumn,
  TableCommand,
  applyTableCommand,
  createDefaultRows,
} from "./ag_grid_test";

import "./table_editor.css";

type TableId = "left" | "right";
type TableViewId = "all" | "dialogue" | "timing" | "source";

type TableViewConfig = {
  id: TableViewId;
  label: string;
  columns: RowDataColumn[];
};

const TABLE_VIEW_CONFIGS: TableViewConfig[] = [
  {
    id: "all",
    label: "All",
    columns: DEFAULT_ROW_DATA_COLUMNS,
  },
  {
    id: "dialogue",
    label: "Dialogue",
    columns: ["profile", "dialogue", "name"],
  },
  {
    id: "timing",
    label: "Timing",
    columns: ["profile", "start", "end", "duration", "track"],
  },
  {
    id: "source",
    label: "Source",
    columns: ["profile", "name", "filepath", "track"],
  },
];

const viewColumnsById: Record<TableViewId, RowDataColumn[]> =
  TABLE_VIEW_CONFIGS.reduce(
    (acc, view) => {
      acc[view.id] = view.columns;
      return acc;
    },
    {} as Record<TableViewId, RowDataColumn[]>,
  );

type SocketTableCommand = TableCommand & {
  tableId: TableId;
};

type TablesState = Record<TableId, RowData[]>;

type TablesAction =
  | {
      type: "socket-command";
      command: SocketTableCommand;
    }
  | {
      type: "local-set";
      tableId: TableId;
      updater: RowData[] | ((prev: RowData[]) => RowData[]);
    };

const initialTablesState: TablesState = {
  left: createDefaultRows(),
  right: createDefaultRows(),
};

function tablesReducer(state: TablesState, action: TablesAction): TablesState {
  switch (action.type) {
    case "socket-command": {
      const { tableId, ...command } = action.command;
      return {
        ...state,
        [tableId]: applyTableCommand(state[tableId], command),
      };
    }
    case "local-set": {
      const previous = state[action.tableId];
      const next =
        typeof action.updater === "function"
          ? action.updater(previous)
          : action.updater;

      return {
        ...state,
        [action.tableId]: next,
      };
    }
    default:
      return state;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTableId(value: unknown): value is TableId {
  return value === "left" || value === "right";
}

function isRowData(value: unknown): value is RowData {
  return (
    isObject(value) &&
    typeof value.profile === "string" &&
    typeof value.dialogue === "string"
  );
}

function isRowDataArray(value: unknown): value is RowData[] {
  return Array.isArray(value) && value.every((row) => isRowData(row));
}

function parseSocketTableCommand(payload: unknown): SocketTableCommand | null {
  if (!isObject(payload) || !isTableId(payload.tableId)) {
    console.log("Invalid socket command payload:", payload);
    return null;
  }

  const action = payload.action;
  if (action === "add" && isRowDataArray(payload.rows)) {
    return {
      action: "add",
      tableId: payload.tableId,
      rows: payload.rows,
    };
  }

  if (
    action === "insert" &&
    typeof payload.index === "number" &&
    isRowDataArray(payload.rows)
  ) {
    return {
      action: "insert",
      tableId: payload.tableId,
      index: payload.index,
      rows: payload.rows,
    };
  }

  if (
    action === "delete" &&
    Array.isArray(payload.indexes) &&
    payload.indexes.every((index) => typeof index === "number")
  ) {
    return {
      action: "delete",
      tableId: payload.tableId,
      indexes: payload.indexes,
    };
  }

  if (action === "replace" && isRowDataArray(payload.rows)) {
    return { action: "replace", tableId: payload.tableId, rows: payload.rows };
  }

  if (action === "clear") {
    return { action: "clear", tableId: payload.tableId };
  }

  return null;
}

function resolveSocketCommand(message: unknown): SocketTableCommand | null {
  if (!isObject(message)) {
    console.log("Received non-object socket message:", message);
    return null;
  }

  const direct = parseSocketTableCommand(message);
  if (direct) {
    console.log("Resolving socket command from message payload:", message);
    return direct;
  }

  if (isObject(message.payload)) {
    console.log(
      "Resolving socket command from message payload:",
      message.payload,
    );
    return parseSocketTableCommand(message.payload);
  }

  console.log("No valid command found in socket message:", message);
  return null;
}

function TableEditor() {
  const [tables, dispatch] = useReducer(tablesReducer, initialTablesState);
  const [leftViewId, setLeftViewId] = useState<TableViewId>("all");
  const [rightViewId, setRightViewId] = useState<TableViewId>("all");
  const [rightTableScrollPosition, setRightTableScrollPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [socketState, setSocketState] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const wsUrl =
    process.env.REACT_APP_TABLE_EDITOR_WS_URL ??
    "ws://localhost:8000/ws/table-editor";

  useEffect(() => {
    let isMounted = true;
    let shouldReconnect = true;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isMounted || !shouldReconnect) {
        return;
      }

      clearReconnectTimeout();
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (!isMounted || !shouldReconnect) {
          return;
        }
        connect();
      }, 1000);
    };

    const connect = () => {
      if (!isMounted || !shouldReconnect) {
        return;
      }

      setSocketState("connecting");
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!isMounted || socketRef.current !== socket) {
          return;
        }
        clearReconnectTimeout();
        setSocketState("connected");
      };

      socket.onmessage = (event) => {
        console.log("Received socket message:", event.data);
        try {
          const payload = JSON.parse(event.data) as unknown;
          console.log("Parsed socket message payload:", payload);
          const command = resolveSocketCommand(payload);

          if (command) {
            dispatch({ type: "socket-command", command });
          }
        } catch {
          if (isMounted) {
            setSocketState("error");
          }
        }
      };

      socket.onerror = () => {
        if (!isMounted || socketRef.current !== socket) {
          return;
        }
        setSocketState("error");
      };

      socket.onclose = () => {
        if (!isMounted || socketRef.current !== socket) {
          return;
        }
        setSocketState("disconnected");
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      isMounted = false;
      shouldReconnect = false;
      clearReconnectTimeout();
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [wsUrl]);

  const sendData = useCallback((payload: string | object) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setSocketState("disconnected");
      return;
    }

    console.log("Sending data through socket:", payload);
    socket.send(
      JSON.stringify({
        target: "resolve",
        payload: payload,
        sentAt: new Date().toISOString(),
      }),
    );
  }, []);

  const setLeftRows = useCallback(
    (updater: RowData[] | ((prev: RowData[]) => RowData[])) => {
      dispatch({ type: "local-set", tableId: "left", updater });
    },
    [],
  );

  const setRightRows = useCallback(
    (updater: RowData[] | ((prev: RowData[]) => RowData[])) => {
      dispatch({ type: "local-set", tableId: "right", updater });
    },
    [],
  );

  const statusLabel = useMemo(() => {
    if (socketState === "connected") return "Connected";
    if (socketState === "connecting") return "Connecting";
    if (socketState === "error") return "Error";
    return "Disconnected";
  }, [socketState]);

  return (
    <div className="table-editor-page">
      <header className="table-editor-header">
        <h1>Table Editor</h1>
        <div
          className={`table-editor-status table-editor-status--${socketState}`}
        >
          {socketState === "connecting" ? (
            <span
              className="table-editor-status-spinner"
              aria-hidden="true"
            />
          ) : null}
          Socket: {statusLabel}
        </div>
      </header>

      <div
        style={{
          display: "flex",
          gap: "1rem",
          paddingRight: "1rem",
        }}
      >
        <button onClick={() => {}}>get clips from timeline</button>
        <button
          onClick={() =>
            sendData({
              action: "fetch_clips",
            })
          }
        >
          get clips from timeline
        </button>
      </div>

      <div className="table-editor-grid">
        <section className="table-editor-panel">
          <h2>Left Table</h2>
          <div className="table-editor-view-switcher">
            {TABLE_VIEW_CONFIGS.map((view) => (
              <button
                key={`left-${view.id}`}
                type="button"
                className={`table-editor-view-button${
                  leftViewId === view.id ? " is-active" : ""
                }`}
                onClick={() => setLeftViewId(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
          <VideoClipSubstitutionsTable
            onScroll={(position) => setRightTableScrollPosition(position)}
            rowData={tables.left}
            fixedData={[{ name: "test" }]}
            onRowDataChange={setLeftRows}
            visibleColumns={viewColumnsById[leftViewId]}
          />
        </section>

        {/*
        <section className="table-editor-panel">
          <h2>Right Table</h2>
          <div className="table-editor-view-switcher">
            {TABLE_VIEW_CONFIGS.map((view) => (
              <button
                key={`right-${view.id}`}
                type="button"
                className={`table-editor-view-button${
                  rightViewId === view.id ? " is-active" : ""
                }`}
                onClick={() => setRightViewId(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
          <VideoClipSubstitutionsTable
            rowData={tables.right}
            onRowDataChange={setRightRows}
            visibleColumns={viewColumnsById[rightViewId]}
            syncScrollPosition={rightTableScrollPosition}
          />
        </section>
        */}
      </div>
    </div>
  );
}

export default TableEditor;
