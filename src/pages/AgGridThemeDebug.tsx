import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { colorSchemeDark } from "ag-grid-community";

import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  themeBalham,
  themeMaterial,
  themeQuartz,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

type DebugRow = {
  id: number;
  name: string;
  role: string;
  status: string;
};

const rowData: DebugRow[] = [
  { id: 1, name: "Alpha", role: "Editor", status: "Active" },
  { id: 2, name: "Beta", role: "Reviewer", status: "Pending" },
  { id: 3, name: "Gamma", role: "Admin", status: "Active" },
];
const columnDefs: ColDef<DebugRow>[] = [
  { field: "id", width: 90 },
  { field: "name", editable: true },
  { field: "role", editable: true },
  { field: "status", editable: true },
];

const themeOptions = {
  quartz: themeQuartz.withPart(colorSchemeDark),
  balham: themeBalham.withParams({
    accentColor: "#2563eb",
    backgroundColor: "#f8fafc",
    fontFamily: "Inter, sans-serif",
    borderRadius: 10,
  }),
  material: themeMaterial.withParams({
    accentColor: "#2563eb",
    backgroundColor: "#f8fafc",
    fontFamily: "Inter, sans-serif",
    borderRadius: 10,
  }),
} as const;

function AgGridThemeDebug() {
  const [themeName, setThemeName] =
    useState<keyof typeof themeOptions>("quartz");

  const theme = useMemo(() => themeOptions[themeName], [themeName]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#eef2ff",
        color: "#111827",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>AG Grid Theme Debug</h1>
        <p style={{ marginTop: 0, marginBottom: 16 }}>
          Use this page to confirm that AG Grid theme objects and parameters are
          actually affecting the grid.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setThemeName("quartz")}
          >
            Quartz
          </button>
          <button
            type="button"
            onClick={() => setThemeName("balham")}
          >
            Balham
          </button>
          <button
            type="button"
            onClick={() => setThemeName("material")}
          >
            Material
          </button>
          <div style={{ alignSelf: "center", marginLeft: 8 }}>
            Current theme: {themeName}
          </div>
        </div>

        <div style={{ height: 520, width: "100%" }}>
          <AgGridReact<DebugRow>
            theme={theme}
            rowData={rowData}
            columnDefs={columnDefs}
            rowSelection="multiple"
            animateRows
          />
        </div>
      </div>
    </div>
  );
}

export default AgGridThemeDebug;
