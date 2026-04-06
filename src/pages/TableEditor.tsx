import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  EditableAgGridTable,
  RowData,
  TableCommand,
  applyTableCommand,
  createDefaultRows,
} from "./ag_grid_test";
import "./table_editor.css";

type TableId = "left" | "right";

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
    return null;
  }

  const type = payload.type;
  if (type === "add" && isRowDataArray(payload.rows)) {
    return { type: "add", tableId: payload.tableId, rows: payload.rows };
  }

  if (
    type === "insert" &&
    typeof payload.index === "number" &&
    isRowDataArray(payload.rows)
  ) {
    return {
      type: "insert",
      tableId: payload.tableId,
      index: payload.index,
      rows: payload.rows,
    };
  }

  if (
    type === "delete" &&
    Array.isArray(payload.indexes) &&
    payload.indexes.every((index) => typeof index === "number")
  ) {
    return {
      type: "delete",
      tableId: payload.tableId,
      indexes: payload.indexes,
    };
  }

  if (type === "replace" && isRowDataArray(payload.rows)) {
    return { type: "replace", tableId: payload.tableId, rows: payload.rows };
  }

  if (type === "clear") {
    return { type: "clear", tableId: payload.tableId };
  }

  return null;
}

function resolveSocketCommand(message: unknown): SocketTableCommand | null {
  if (!isObject(message)) {
    return null;
  }

  const direct = parseSocketTableCommand(message);
  if (direct) {
    return direct;
  }

  if (isObject(message.payload)) {
    return parseSocketTableCommand(message.payload);
  }

  return null;
}

function TableEditor() {
  const [tables, dispatch] = useReducer(tablesReducer, initialTablesState);
  const [socketState, setSocketState] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  const wsUrl =
    process.env.REACT_APP_TABLE_EDITOR_WS_URL ??
    "ws://localhost:8000/ws/table-editor";

  useEffect(() => {
    let isMounted = true;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      if (isMounted) {
        setSocketState("connected");
      }
    };

    socket.onmessage = (event) => {
      console.log("Received socket message:", event.data);
      try {
        const payload = JSON.parse(event.data) as unknown;
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
      if (isMounted) {
        setSocketState("error");
      }
    };

    socket.onclose = () => {
      if (isMounted) {
        setSocketState("disconnected");
      }
    };

    return () => {
      isMounted = false;
      socketRef.current = null;
      socket.close();
    };
  }, [wsUrl]);

  const sendTestMessage = useCallback(() => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setSocketState("disconnected");
      return;
    }

    socket.send(
      JSON.stringify({
        event: "table-editor-test",
        target: "resolve",
        message: "Hello from TableEditor button",
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
          Socket: {statusLabel}
        </div>
      </header>

      <button onClick={sendTestMessage}>
        test send message to davinci resolve
      </button>

      <div className="table-editor-grid">
        <section className="table-editor-panel">
          <h2>Left Table</h2>
          <EditableAgGridTable
            rowData={tables.left}
            onRowDataChange={setLeftRows}
          />
        </section>

        <section className="table-editor-panel">
          <h2>Right Table</h2>
          <EditableAgGridTable
            rowData={tables.right}
            onRowDataChange={setRightRows}
          />
        </section>
      </div>
    </div>
  );
}

export default TableEditor;
