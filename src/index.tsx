import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import AnotherPage from "./pages/AnotherPage";
import AgGridThemeDebug from "./pages/AgGridThemeDebug";
import TableEditor from "./pages/TableEditor";
import "./index.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<App />}
        />
        <Route
          path="/another"
          element={<AnotherPage />}
        />
        <Route
          path="/ag-grid-theme-debug"
          element={<AgGridThemeDebug />}
        />
        <Route
          path="/table-editor"
          element={<TableEditor />}
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
