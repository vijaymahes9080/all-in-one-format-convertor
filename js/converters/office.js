/**
 * Handles Document and Data conversions
 * Depends on Mammoth.js and SheetJS (XLSX) being loaded globally.
 */

export async function convertDocx(file, targetFormat) {
    if (!window.mammoth) throw new Error("Mammoth library not loaded");

    const arrayBuffer = await file.arrayBuffer();

    if (targetFormat === 'html') {
        const result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        return new Blob([result.value], { type: 'text/html' });
    }

    if (targetFormat === 'txt') {
        const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        return new Blob([result.value], { type: 'text/plain' });
    }

    // PDF conversion would require HTML->Canvas->PDF flow which is heavy, 
    // for now we throw if not supported or implement a basic HTML wrap
    if (targetFormat === 'pdf') {
        // Basic placeholder: The user would print the HTML
        // Real client-side docx-to-pdf is very hard without a layout engine.
        // We will return HTML with a suggestion or use a print trick? 
        // Let's return HTML but marked as proper content to be printed.
        const result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        const htmlContent = `
            <html><body>${result.value}</body></html>
        `;
        // For actual PDF, we'd need jspdf + html2canvas, which is heavy. 
        // We'll throw an error or handle loosely.
        throw new Error("DOCX to PDF requires Print-to-PDF in browser for best results. Try converting to HTML then printing.");
    }

    throw new Error("Unsupported target format for DOCX");
}

export async function convertSpreadsheet(file, targetFormat) {
    if (!window.XLSX) throw new Error("SheetJS library not loaded");

    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    let content;
    let type;

    if (targetFormat === 'csv') {
        content = window.XLSX.utils.sheet_to_csv(worksheet);
        type = 'text/csv';
    } else if (targetFormat === 'json') {
        const json = window.XLSX.utils.sheet_to_json(worksheet);
        content = JSON.stringify(json, null, 2);
        type = 'application/json';
    } else if (targetFormat === 'html') {
        content = window.XLSX.utils.sheet_to_html(worksheet);
        type = 'text/html';
    } else {
        throw new Error("Unsupported target format for Spreadsheet");
    }

    return new Blob([content], { type: type });
}

export async function convertData(file, targetFormat) {
    const text = await file.text();

    if (file.type === 'application/json' && targetFormat === 'csv') {
        // Simple JSON to CSV
        try {
            const json = JSON.parse(text);
            if (!Array.isArray(json)) throw new Error("JSON must be an array of objects");
            if (json.length === 0) return new Blob([''], { type: 'text/csv' });

            const headers = Object.keys(json[0]);
            const csvRows = [headers.join(',')];

            for (const row of json) {
                const values = headers.map(header => {
                    const escaped = ('' + row[header]).replace(/"/g, '\\"');
                    return `"${escaped}"`;
                });
                csvRows.push(values.join(','));
            }
            return new Blob([csvRows.join('\n')], { type: 'text/csv' });
        } catch (e) {
            throw new Error("Invalid JSON or conversion error");
        }
    }

    // CSV to JSON
    if (file.type === 'text/csv' && targetFormat === 'json') {
        // A simple parser would go here, or we can use XLSX read utility for robustness
        if (window.XLSX) {
            const workbook = window.XLSX.read(text, { type: 'string' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = window.XLSX.utils.sheet_to_json(sheet);
            return new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        }
    }

    throw new Error("Conversion not implemented yet");
}
