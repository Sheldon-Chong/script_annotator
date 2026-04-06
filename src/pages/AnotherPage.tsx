import React, { useState } from "react";
import { Link } from "react-router-dom";
import styles from "../App.module.css";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Task = {
  id: number;
  task: string;
  status: string;
};

const initialData: Task[] = [
  { id: 1, task: "Optimize Render", status: "In Progress" },
  { id: 2, task: "Fix Memory Leak", status: "Done" },
];

const columnHelper = createColumnHelper<Task>();

const columns = [
  columnHelper.accessor("id", { header: "ID" }),
  columnHelper.accessor("task", { header: "Task Name" }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <i>{info.getValue()}</i>,
  }),
];

function DraggableRow({ row }: { row: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
    >
      <td
        style={{
          border: "1px solid #d1d5db",
          padding: "8px",
          width: "40px",
          textAlign: "center",
          cursor: "grab",
        }}
        {...listeners}
      >
        <button
          style={{
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "grab",
            padding: "4px 8px",
          }}
          aria-label="Drag handle"
        >
          ⋮⋮
        </button>
      </td>
      {row.getVisibleCells().map((cell: any) => (
        <td
          key={cell.id}
          style={{
            border: "1px solid #d1d5db",
            padding: "8px",
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

export function MyTable() {
  const [data, setData] = useState<Task[]>(initialData);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: currentDragItem, over: currentDropTarget } = event;
    if (
      currentDragItem &&
      currentDropTarget &&
      currentDragItem.id !== currentDropTarget.id
    ) {
      setData((items) => {
        const oldIndex = items.findIndex(
          (i) => String(i.id) === currentDragItem.id,
        );
        const newIndex = items.findIndex(
          (i) => String(i.id) === currentDropTarget.id,
        );
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div style={{ padding: "16px" }}>
        <table
          style={{
            borderCollapse: "collapse",
            border: "1px solid #9ca3af",
            width: "100%",
          }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                <th
                  style={{
                    border: "1px solid #d1d5db",
                    padding: "8px",
                    width: "40px",
                  }}
                ></th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      border: "1px solid #d1d5db",
                      padding: "8px",
                    }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            <SortableContext
              items={data}
              strategy={verticalListSortingStrategy}
            >
              {table.getRowModel().rows.map((row) => (
                <DraggableRow
                  key={row.id}
                  row={row}
                />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}

function AnotherPage() {
  return (
    <div className={styles.container}>
      <h2>Another Page</h2>
      <p>This is a different page in your application.</p>
      <MyTable />
    </div>
  );
}

export default AnotherPage;
