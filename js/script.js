/* ==========================================
   UTILS
   ========================================== */
const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getFileExtension = (filename) => {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
};

const getFileIcon = (filename) => {
    const ext = getFileExtension(filename);
    const icons = {
        jpg: 'ri-image-line', jpeg: 'ri-image-line', png: 'ri-image-line',
        webp: 'ri-image-line', gif: 'ri-image-gif-line', svg: 'ri-brush-line',
        mp4: 'ri-movie-line', webm: 'ri-movie-line', avi: 'ri-movie-line', mov: 'ri-movie-line',
        mp3: 'ri-music-line', wav: 'ri-music-line', ogg: 'ri-music-line',
        pdf: 'ri-file-pdf-line', docx: 'ri-file-word-line', txt: 'ri-file-text-line',
        csv: 'ri-table-line', xlsx: 'ri-file-excel-line', json: 'ri-braces-line'
    };
    return icons[ext] || 'ri-file-line';
};

const CONVERSION_MAP = {
    'image/jpeg': ['png', 'webp', 'pdf'],
    'image/png': ['jpg', 'webp', 'pdf', 'ico'],
    'image/webp': ['jpg', 'png', 'pdf'],
    'image/gif': ['jpg', 'png', 'webp'],
    'image/svg+xml': ['png', 'jpg', 'webp'],
    'application/pdf': ['jpg', 'png', 'txt'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['html', 'txt', 'pdf'],
    'text/plain': ['pdf'],
    'text/csv': ['json', 'xlsx', 'html'],
    'application/json': ['csv', 'yaml', 'xml'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['csv', 'json', 'html'],
    'video/mp4': ['webm', 'mp3', 'gif'],
    'video/webm': ['mp4', 'mp3'],
    'audio/mpeg': ['wav', 'ogg'],
    'audio/wav': ['mp3', 'ogg']
};

const getSupportedOutputs = (file) => {
    // Check for Secure Context regarding FFmpeg (Video/Audio)
    // If not crossOriginIsolated, we cannot use SharedArrayBuffer, so FFmpeg won't work.
    const isSecure = window.crossOriginIsolated;

    let outputs = [];
    if (CONVERSION_MAP[file.type]) {
        outputs = [...CONVERSION_MAP[file.type]];
    } else {
        const ext = getFileExtension(file.name);
        const extMap = {
            'docx': ['html', 'txt', 'pdf'],
            'doc': [], /* Legacy binary DOC not supported */
            'xlsx': ['csv', 'json', 'html'],
            'xls': [], /* Legacy binary XLS not supported */
            'pptx': ['pdf', 'txt', 'images'],
            'ppt': [], /* Legacy binary PPT not supported */
            'csv': ['json', 'xlsx', 'html'],
            'json': ['csv', 'yaml', 'xml']
        };
        outputs = extMap[ext] || [];
    }

    // Filter out media formats if environment is not secure
    if (!isSecure) {
        // If the file is video or audio, we can't convert it without headers
        if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
            console.warn("Skipping media formats: Secure Context (COOP/COEP) required.");
            return [];
        }
    }

    return outputs;
};

/* ==========================================
   IMAGE CONVERTER
   ========================================== */
async function convertImage(file, targetFormat, quality = 0.9, maxSizeKB = null) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Fill white background for JPG
                if (targetFormat === 'jpg' || targetFormat === 'jpeg' || targetFormat === 'pdf') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                ctx.drawImage(img, 0, 0, width, height);

                // --- Helper to get Blob ---
                const getBlob = (q) => {
                    return new Promise(res => {
                        let mime = `image/${targetFormat}`;
                        if (targetFormat === 'jpg') mime = 'image/jpeg';
                        if (targetFormat === 'pdf') mime = 'image/jpeg'; // PDF uses JPEG internally

                        canvas.toBlob(b => res(b), mime, q);
                    });
                };

                let bestBlob = null;

                // --- Compression Logic ---
                if (maxSizeKB && targetFormat !== 'png' && targetFormat !== 'ico') {
                    const maxBytes = maxSizeKB * 1024;
                    let scale = 1.0;
                    let attempts = 0;

                    // Loop to reduce size: First by quality, then by resolution scaling
                    while (attempts < 10) {
                        // Create a temporary canvas for scaling if needed
                        let srcCanvas = canvas;
                        if (scale < 1.0) {
                            const w = Math.floor(width * scale);
                            const h = Math.floor(height * scale);
                            srcCanvas = document.createElement('canvas');
                            srcCanvas.width = w;
                            srcCanvas.height = h;
                            const sCtx = srcCanvas.getContext('2d');
                            if (targetFormat === 'jpg' || targetFormat === 'jpeg' || targetFormat === 'pdf') {
                                sCtx.fillStyle = '#FFFFFF';
                                sCtx.fillRect(0, 0, w, h);
                            }
                            sCtx.drawImage(img, 0, 0, w, h);
                        }

                        // Helper for temp canvas
                        const getTempBlob = (c, q) => new Promise(res => {
                            let mime = `image/${targetFormat}`;
                            if (targetFormat === 'jpg' || targetFormat === 'pdf') mime = 'image/jpeg';
                            if (targetFormat === 'webp') mime = 'image/webp';
                            c.toBlob(b => res(b), mime, q);
                        });

                        // Check lowest realistic quality at this resolution
                        const minBlob = await getTempBlob(srcCanvas, 0.1);

                        if (minBlob.size <= maxBytes) {
                            // This resolution can fit! Now find best quality
                            let subMin = 0.1, subMax = 1.0;
                            let subAttempt = 0;
                            bestBlob = minBlob; // Default to the working min

                            while (subAttempt < 6) {
                                const mid = (subMin + subMax) / 2;
                                const b = await getTempBlob(srcCanvas, mid);
                                if (b.size <= maxBytes) {
                                    bestBlob = b;
                                    subMin = mid;
                                } else {
                                    subMax = mid;
                                }
                                subAttempt++;
                            }
                            break; // We found the best fit
                        }

                        // Still too big? Reduce scale and retry
                        scale *= 0.75;
                        attempts++;
                    }

                    if (!bestBlob) bestBlob = await getBlob(0.1); // Fallback
                } else {
                    bestBlob = await getBlob(quality);
                }

                // --- Output Handling ---
                if (targetFormat === 'pdf') {
                    if (!window.jspdf) {
                        reject(new Error("jsPDF library not loaded"));
                        return;
                    }
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF({
                        orientation: width > height ? 'l' : 'p',
                        unit: 'px',
                        format: [width, height]
                    });

                    const blobToDataURL = (b) => new Promise(r => {
                        const fr = new FileReader();
                        fr.onload = () => r(fr.result);
                        fr.readAsDataURL(b);
                    });

                    const imgData = await blobToDataURL(bestBlob);
                    pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
                    resolve(pdf.output('blob'));
                } else {
                    resolve(bestBlob);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = event.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/* ==========================================
   OFFICE CONVERTER
   ========================================== */
async function convertPdf(file, targetFormat) {
    if (!window.pdfjsLib) throw new Error("PDF.js library not loaded");

    // Safety check if worker isn't set yet (race condition)
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    if (targetFormat === 'txt') {
        let fullText = "";
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }
        return new Blob([fullText], { type: 'text/plain' });
    }

    if (targetFormat === 'jpg' || targetFormat === 'png' || targetFormat === 'webp') {
        // Render first page primarily
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // High res
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        let mime = `image/${targetFormat}`;
        if (targetFormat === 'jpg') mime = 'image/jpeg';

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), mime, 0.9);
        });
    }

    throw new Error("Unsupported output format for PDF");
}

async function convertDocx(file, targetFormat) {
    if (!window.mammoth) throw new Error("Mammoth library not loaded");

    const arrayBuffer = await file.arrayBuffer();

    // HTML conversion (Common base)
    const result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
    const htmlContent = result.value;

    if (targetFormat === 'html') {
        return new Blob([htmlContent], { type: 'text/html' });
    }

    if (targetFormat === 'txt') {
        const rawText = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        return new Blob([rawText.value], { type: 'text/plain' });
    }

    if (targetFormat === 'pdf') {
        if (!window.jspdf) throw new Error("jsPDF not loaded");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Simple text extraction for PDF (Proper HTML to PDF in browser is complex)
        // We will try extracting text and putting it in PDF
        const rawText = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        const lines = doc.splitTextToSize(rawText.value, 180);
        doc.text(lines, 10, 10);
        return doc.output('blob');
    }

    throw new Error("Unsupported target format for DOCX");
}

async function convertSpreadsheet(file, targetFormat) {
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

async function convertPresentation(file, targetFormat) {
    if (!window.JSZip) throw new Error("JSZip library not loaded");

    const zip = await window.JSZip.loadAsync(file);
    let slideTexts = [];

    // Find slide files
    // Sort logic to ensure slide1, slide2 order involves sorting the filenames numerically
    const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml/))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });

    if (targetFormat === 'images') {
        const mediaFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
        if (mediaFiles.length === 0) throw new Error("No images found in presentation");

        const outZip = new window.JSZip();
        for (const mFile of mediaFiles) {
            const data = await zip.file(mFile).async('blob');
            outZip.file(mFile.split('/').pop(), data);
        }
        const blob = await outZip.generateAsync({ type: "blob" });
        return blob; // The app should handle naming this .zip
    }

    for (const sFile of slideFiles) {
        const xmlText = await zip.file(sFile).async('string');
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const texts = Array.from(xmlDoc.getElementsByTagName("a:t")).map(n => n.textContent).join(" ");
        slideTexts.push(texts);
    }

    if (targetFormat === 'txt') {
        return new Blob([slideTexts.join("\n\n--- Slide ---\n\n")], { type: 'text/plain' });
    }

    if (targetFormat === 'pdf') {
        if (!window.jspdf) throw new Error("jsPDF not loaded");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        if (slideTexts.length === 0) {
            doc.text("No text found in presentation", 10, 10);
        } else {
            slideTexts.forEach((txt, i) => {
                if (i > 0) doc.addPage();
                doc.setFontSize(16);
                doc.text(`Slide ${i + 1}`, 10, 15);
                doc.setFontSize(12);
                const lines = doc.splitTextToSize(txt || "(No Text)", 180);
                doc.text(lines, 10, 25);
            });
        }
        return doc.output('blob');
    }

    throw new Error("Unsupported target format for PPTX");
}

async function convertData(file, targetFormat) {
    const text = await file.text();

    if (file.type === 'application/json' && targetFormat === 'csv') {
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

    if (file.type === 'text/csv' && targetFormat === 'json') {
        if (window.XLSX) {
            const workbook = window.XLSX.read(text, { type: 'string' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = window.XLSX.utils.sheet_to_json(sheet);
            return new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        }
    }

    throw new Error("Conversion not implemented yet");
}

/* ==========================================
   VIDEO CONVERTER
   ========================================== */
let ffmpeg = null;

async function initFFmpeg() {
    if (ffmpeg) return ffmpeg;

    if (!window.crossOriginIsolated) {
        console.warn("SharedArrayBuffer is not available. Video conversion likely to fail.");
    }

    try {
        const { createFFmpeg } = window.FFmpeg || {};
        if (!createFFmpeg) return null; // Gracefully fail if script missing

        ffmpeg = createFFmpeg({ log: true });
        await ffmpeg.load();
        return ffmpeg;
    } catch (e) {
        console.error("FFmpeg Load Error", e);
        return null;
    }
}

async function convertMedia(file, targetFormat) {
    const instance = await initFFmpeg();
    if (!instance) throw new Error("Video converter engine (FFmpeg) failed to load. Are you using a server with COOP/COEP?");

    const { fetchFile } = window.FFmpeg;
    const inputName = 'input.' + file.name.split('.').pop();
    const outputName = 'output.' + targetFormat;

    instance.FS('writeFile', inputName, await fetchFile(file));
    await instance.run('-i', inputName, outputName);
    const data = instance.FS('readFile', outputName);

    instance.FS('unlink', inputName);
    instance.FS('unlink', outputName);

    let mimeType = `video/${targetFormat}`;
    if (targetFormat === 'mp3') mimeType = 'audio/mpeg';
    if (targetFormat === 'wav') mimeType = 'audio/wav';

    return new Blob([data.buffer], { type: mimeType });
}

/* ==========================================
   APP CONTROLLER
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const fileList = document.getElementById('file-list');
    const dashboard = document.getElementById('conversion-dashboard');
    const fileCountBadge = document.getElementById('file-count-badge');
    const convertAllBtn = document.getElementById('convert-all-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const themeToggle = document.getElementById('theme-toggle');

    let filesState = new Map();

    // Theme Logic
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (themeToggle) themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="ri-moon-line"></i>' : '<i class="ri-sun-line"></i>';

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            themeToggle.innerHTML = next === 'dark' ? '<i class="ri-moon-line"></i>' : '<i class="ri-sun-line"></i>';
        });
    }

    // Event Listeners
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });
    }

    if (browseBtn) browseBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            fileList.innerHTML = '';
            filesState.clear();
            dashboard.classList.add('hidden');
            updateStats();
        });
    }

    if (convertAllBtn) {
        convertAllBtn.addEventListener('click', () => {
            filesState.forEach((val, key) => {
                if (val.status === 'pending') processFile(key);
            });
        });
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;

        dashboard.classList.remove('hidden');
        dashboard.scrollIntoView({ behavior: 'smooth' });

        Array.from(files).forEach(file => {
            const fileId = Math.random().toString(36).substr(2, 9);

            // 1. Create UI
            const item = createFileItem(file, fileId);
            fileList.appendChild(item);

            // 2. Set State
            const select = item.querySelector('.target-format');
            const defaultFormat = select ? select.value : null;

            filesState.set(fileId, {
                file: file,
                element: item,
                status: 'pending',
                targetFormat: defaultFormat
            });

            updateStats();
        });
    }

    function createFileItem(file, id) {
        const template = document.getElementById('file-item-template');
        const clone = template.content.cloneNode(true);
        const el = clone.querySelector('.file-item');

        el.querySelector('.file-name').textContent = file.name;
        el.querySelector('.file-size').textContent = formatBytes(file.size);
        el.querySelector('.file-icon-wrapper').innerHTML = `<i class="${getFileIcon(file.name)}"></i>`;

        const select = el.querySelector('.target-format');
        const outputs = getSupportedOutputs(file);

        if (outputs.length === 0) {
            if (!window.crossOriginIsolated && (file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
                select.innerHTML = '<option disabled selected>Server Required</option>';
                el.querySelector('.file-meta-tags').innerHTML += '<span style="color:var(--warning); font-size:0.7rem; display:block; margin-top:4px;">Video requires secure server context</span>';
            } else {
                select.innerHTML = '<option disabled selected>No Formats</option>';
            }
            select.disabled = true;
            el.querySelector('.convert-btn').disabled = true;
        } else {
            outputs.forEach(fmt => {
                const opt = document.createElement('option');
                opt.value = fmt;
                opt.textContent = fmt.toUpperCase();
                select.appendChild(opt);
            });

            select.addEventListener('change', (e) => {
                const state = filesState.get(id);
                if (state) state.targetFormat = e.target.value;

                // Show/Hide Quality/Usage controls
                const fmt = e.target.value;
                const qualityControl = el.querySelector('.quality-control');
                const sizeControl = el.querySelector('.size-control');
                const percentControl = el.querySelector('.percentage-control');

                if (fmt === 'jpg' || fmt === 'jpeg' || fmt === 'webp' || fmt === 'pdf') {
                    qualityControl.classList.remove('hidden');
                    sizeControl.classList.remove('hidden');
                    percentControl.classList.remove('hidden');
                } else {
                    qualityControl.classList.add('hidden');
                    sizeControl.classList.add('hidden');
                    percentControl.classList.add('hidden');
                }
            });

            // Trigger change initially to set correct visibility
            const evt = new Event('change');
            select.dispatchEvent(evt);
        }

        // Quality Slider Logic
        const qualitySlider = el.querySelector('.quality-slider');
        const qualityValue = el.querySelector('.quality-value');
        if (qualitySlider) {
            qualitySlider.addEventListener('input', (e) => {
                const val = Math.round(e.target.value * 100);
                qualityValue.textContent = val + '%';
            });
        }

        // Max Size interaction (disable slider if input set)
        const maxSizeInput = el.querySelector('.max-size-input');
        const percentInput = el.querySelector('.percent-input');

        if (maxSizeInput && qualitySlider) {
            maxSizeInput.addEventListener('input', (e) => {
                if (e.target.value) {
                    qualitySlider.disabled = true;
                    el.querySelector('.quality-control').style.opacity = '0.5';
                    if (percentInput) {
                        percentInput.disabled = true;
                        el.querySelector('.percentage-control').style.opacity = '0.5';
                    }
                } else {
                    qualitySlider.disabled = false;
                    el.querySelector('.quality-control').style.opacity = '1';
                    if (percentInput) {
                        percentInput.disabled = false;
                        el.querySelector('.percentage-control').style.opacity = '1';
                    }
                }
            });
        }

        // Percentage interaction (disable slider and KB if set)
        if (percentInput && qualitySlider) {
            percentInput.addEventListener('input', (e) => {
                if (e.target.value) {
                    qualitySlider.disabled = true;
                    el.querySelector('.quality-control').style.opacity = '0.5';
                    if (maxSizeInput) {
                        maxSizeInput.disabled = true;
                        el.querySelector('.size-control').style.opacity = '0.5';
                    }
                } else {
                    qualitySlider.disabled = false;
                    el.querySelector('.quality-control').style.opacity = '1';
                    if (maxSizeInput) {
                        maxSizeInput.disabled = false;
                        el.querySelector('.size-control').style.opacity = '1';
                    }
                }
            });
        }

        const removeBtn = el.querySelector('.remove-btn');
        if (removeBtn) removeBtn.addEventListener('click', () => {
            el.remove();
            filesState.delete(id);
            updateStats();
            if (filesState.size === 0) dashboard.classList.add('hidden');
        });

        const cvtBtn = el.querySelector('.convert-btn');
        if (cvtBtn) cvtBtn.addEventListener('click', () => processFile(id));

        return el;
    }

    function updateStats() {
        if (fileCountBadge) fileCountBadge.textContent = filesState.size;
    }

    async function processFile(id) {
        const data = filesState.get(id);
        if (!data || !data.targetFormat) return;

        const { file, element, targetFormat } = data;
        const progressContainer = element.querySelector('.progress-container');
        const progressBar = element.querySelector('.progress-fill');
        const progressText = element.querySelector('.progress-text');
        const convertBtn = element.querySelector('.convert-btn');
        const downloadBtn = element.querySelector('.download-btn');

        data.status = 'processing';
        progressContainer.classList.remove('hidden');
        convertBtn.classList.add('hidden');
        element.querySelector('.target-format').disabled = true;

        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 10;
                progressBar.style.width = Math.min(progress, 90) + '%';
                progressText.textContent = Math.floor(Math.min(progress, 90)) + '%';
            }
        }, 300);

        try {
            let resultBlob;
            const type = file.type;
            const ext = getFileExtension(file.name);

            // Get quality if slider exists
            const qualityInput = element.querySelector('.quality-slider');
            const quality = qualityInput ? parseFloat(qualityInput.value) : 0.9;

            // Get Max KB if input exists and has value
            const maxSizeInput = element.querySelector('.max-size-input');
            let maxSizeKB = (maxSizeInput && maxSizeInput.value) ? parseFloat(maxSizeInput.value) : null;

            // Get Percentage if input exists and has value (overrides maxSizeKB)
            const percentInput = element.querySelector('.percent-input');
            if (percentInput && percentInput.value) {
                const percent = parseFloat(percentInput.value);
                const originalSizeKB = file.size / 1024;
                maxSizeKB = (originalSizeKB * percent) / 100;
            }

            if (type.startsWith('image/')) {
                resultBlob = await convertImage(file, targetFormat, quality, maxSizeKB);
            } else if (type.startsWith('video/') || type.startsWith('audio/')) {
                resultBlob = await convertMedia(file, targetFormat);
            } else if (type === 'application/pdf') {
                resultBlob = await convertPdf(file, targetFormat);
            } else if (
                ext === 'docx' ||
                type.includes('wordprocessingml')
            ) {
                resultBlob = await convertDocx(file, targetFormat);
            } else if (
                type.includes('presentation') ||
                ext === 'ppt' ||
                ext === 'pptx'
            ) {
                resultBlob = await convertPresentation(file, targetFormat);
            } else if (
                type.includes('spreadsheet') ||
                ext === 'xlsx') {
                resultBlob = await convertSpreadsheet(file, targetFormat);
            } else if (
                type.includes('json') ||
                type.includes('csv') ||
                ext === 'csv'
            ) {
                resultBlob = await convertData(file, targetFormat);
            } else {
                throw new Error("No converter match found for " + type);
            }

            clearInterval(interval);
            progressBar.style.width = '100%';
            progressText.textContent = '100%';
            data.status = 'done';

            // Show new file size
            const originalSize = formatBytes(file.size);
            const newSize = formatBytes(resultBlob.size);
            element.querySelector('.file-size').textContent = `${originalSize} → ${newSize}`;

            downloadBtn.classList.remove('hidden');
            downloadBtn.onclick = () => {
                saveAs(resultBlob, `converted_${file.name.split('.')[0]}.${targetFormat}`);
            };

        } catch (err) {
            clearInterval(interval);
            progressBar.style.background = 'var(--error)';
            progressText.textContent = 'Err';
            console.error(err);

            // Show toast or alert
            // For now simple alert
            setTimeout(() => alert(`Error converting ${file.name}: ${err.message}`), 500);

            data.status = 'error';
            convertBtn.classList.remove('hidden');
        }
    }
});
