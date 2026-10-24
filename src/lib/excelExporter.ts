import * as XLSX from 'xlsx';

export interface ExcelExportColumn<T = any> {
  header: string;
  key: keyof T | string;
  width?: number;
  formatter?: (value: any, item: T) => string | number;
}

export interface ExcelExportOptions<T = any> {
  fileName: string;
  sheetName?: string;
  columns: ExcelExportColumn<T>[];
  data: T[];
}

/**
 * Export data cleanly into an Excel (.xlsx) file with:
 * - Proper column width auto-sizing
 * - Native UTF-8 support
 * - Clean RTL / Arabic alignment in Excel
 * - Proper cellular separation (no comma-jamming or CSV delimiter bugs)
 */
export function exportToExcel<T = any>({
  fileName,
  sheetName = 'البيانات',
  columns,
  data,
}: ExcelExportOptions<T>) {
  // 1. Build row data objects with header names as keys to preserve column order
  const sheetData = data.map((item) => {
    const rowObj: Record<string, any> = {};
    columns.forEach((col) => {
      let cellValue: any;
      if (col.formatter) {
        cellValue = col.formatter(item[col.key as keyof T], item);
      } else {
        cellValue = item[col.key as keyof T] ?? '';
      }
      rowObj[col.header] = cellValue;
    });
    return rowObj;
  });

  // 2. Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(sheetData, {
    header: columns.map((c) => c.header),
  });

  // 3. Configure column widths
  worksheet['!cols'] = columns.map((col) => {
    if (col.width) return { wch: col.width };
    // Auto calculate approximate width based on header length
    const maxLen = Math.max(
      col.header.length,
      ...sheetData.map((d) => String(d[col.header] || '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
  });

  // 4. Configure Right-To-Left view for Arabic if supported
  if (!worksheet['!views']) {
    worksheet['!views'] = [];
  }
  (worksheet['!views'] as any).push({ rightToLeft: true });

  // 5. Create workbook and trigger download
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));

  const cleanFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, cleanFileName);
}
