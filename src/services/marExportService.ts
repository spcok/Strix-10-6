import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, Header, Footer, PageOrientation, VerticalAlign } from 'docx';
import { format, parseISO, startOfDay, addDays, differenceInDays, isBefore, isAfter } from 'date-fns';
import { supabase } from '../lib/supabase';

const COLORS = { text: "000000", meta: "555555", border: "737373", headerBg: "F1F5F9", blackout: "CBD5E1" };
const BORDER_STYLE = { style: BorderStyle.SINGLE, size: 2, color: COLORS.border };
const TABLE_BORDERS = { top: BORDER_STYLE, bottom: BORDER_STYLE, left: BORDER_STYLE, right: BORDER_STYLE, insideHorizontal: BORDER_STYLE, insideVertical: BORDER_STYLE };

const getRowsForFrequency = (freq: string): number => {
  switch (freq) {
    case 'BID': return 2;
    case 'TID': return 3;
    case 'QID': return 4;
    case 'PRN': return 3;
    default: return 1;
  }
};

const triggerNativeDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 150);
};

export const marExportService = {
  async exportUnifiedMAR(animal: any, prescriptions: any[], generatorName: string, generatorId: string) {
    const monthYear = format(new Date(), 'MMMM yyyy');
    const today = startOfDay(new Date());
    
    // Calculate 31-day window
    const dateColumns = Array.from({ length: 31 }, (_, i) => addDays(today, i));

    const createTable = (rxSubset: any[]) => {
      const rows: TableRow[] = [];
      // Header
      rows.push(new TableRow({
        tableHeader: true,
        children: [
          new TableCell({ shading: { fill: COLORS.headerBg }, width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph("Medication Details")] }),
          new TableCell({ shading: { fill: COLORS.headerBg }, width: { size: 6, type: WidthType.PERCENTAGE }, children: [new Paragraph("Time")] }),
          ...dateColumns.map(d => new TableCell({ shading: { fill: COLORS.headerBg }, width: { size: 74 / 31, type: WidthType.PERCENTAGE }, children: [new Paragraph(format(d, 'dd/MM'))] }))
        ]
      }));

      rxSubset.forEach(rx => {
        const dosesCount = getRowsForFrequency(rx.frequency);
        const rxStart = rx.start_date ? startOfDay(parseISO(rx.start_date)) : today;
        const rxEnd = rx.end_date ? startOfDay(parseISO(rx.end_date)) : new Date(2100, 0, 1);

        const doseLabels = Array.from({ length: dosesCount }, (_, idx) => `Dose ${idx + 1}`);

        doseLabels.forEach((doseLabel, doseIndex) => {
          const cells: TableCell[] = [];
          if (doseIndex === 0) {
            cells.push(new TableCell({ rowSpan: dosesCount * 2, children: [new Paragraph(`${rx.drug_name} (${rx.dosage})`)] }));
          }
          cells.push(new TableCell({ children: [new Paragraph(doseLabel)] }));
          dateColumns.forEach(date => cells.push(new TableCell({ shading: (isBefore(date, rxStart) || isAfter(date, rxEnd)) ? { fill: COLORS.blackout } : undefined, children: [new Paragraph("")] })));
          rows.push(new TableRow({ children: cells }));
          
          // Row for initials
          rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph("Initials")] }), ...dateColumns.map(() => new TableCell({ children: [new Paragraph("")] }))] }));
        });
      });
      return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows });
    };

    // Pagination Logic: Split prescriptions into groups of 5 per page
    const pages = [];
    for (let i = 0; i < prescriptions.length; i += 5) {
      pages.push(prescriptions.slice(i, i + 5));
    }

    const doc = new Document({
      sections: pages.map((rxGroup, idx) => ({
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 567, bottom: 567, left: 567, right: 567 } } },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `Unified Patient MAR - ${animal.name} (Page ${idx + 1} of ${pages.length})`,
                bold: true,
                size: 24
              })
            ],
            spacing: { after: 200 }
          }),
          createTable(rxGroup)
        ]
      }))
    });

    const blob = await Packer.toBlob(doc);
    triggerNativeDownload(blob, `MAR_${animal.name}.docx`);
  }
};