"use client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface Column {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (value: unknown, row: Row) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: Row[];
  emptyText?: string;
}

export default function DataTable({ columns, data, emptyText = "No data" }: DataTableProps) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      overflow: "hidden",
    }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{
                  padding: "12px 16px",
                  textAlign: col.align || "left",
                  fontWeight: 500,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.3px",
                  textTransform: "uppercase",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  whiteSpace: "nowrap",
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.3)",
                }}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} style={{
                  borderBottom: i < data.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  {columns.map((col) => (
                    <td key={col.key} style={{
                      padding: "12px 16px",
                      textAlign: col.align || "left",
                      color: "rgba(255,255,255,0.8)",
                      whiteSpace: "nowrap",
                    }}>
                      {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
