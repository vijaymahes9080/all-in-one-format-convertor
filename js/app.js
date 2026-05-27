import { formatBytes, getFileIcon, getSupportedOutputs } from './utils.js';
import { convertImage } from './converters/image.js';
import { convertDocx, convertSpreadsheet, convertData } from './converters/office.js';
// Video conversion is conditional
import { initFFmpeg, convertMedia } from './converters/video.js';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const fileList = document.getElementById('file-list');
const dashboard = document.getElementById('conversion-dashboard');
const fileCountBadge = document.getElementById('file-count-badge');
const convertAllBtn = document.getElementById('convert-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const themeToggle = document.getElementById('theme-toggle');

let filesState = new Map(); // Store file objects and meta

// Theme Management
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="ri-moon-line"></i>' : '<i class="ri-sun-line"></i>';

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    themeToggle.innerHTML = next === 'dark' ? '<i class="ri-moon-line"></i>' : '<i class="ri-sun-line"></i>';
});

// Drag & Drop
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

browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleFiles(files) {
    if (files.length > 0) {
        dashboard.classList.remove('hidden');
        // Scroll to dashboard
        dashboard.scrollIntoView({ behavior: 'smooth' });
    }

    Array.from(files).forEach(file => {
        const fileId = Math.random().toString(36).substr(2, 9);
        const item = createFileItem(file, fileId);
        fileList.appendChild(item);

        filesState.set(fileId, {
            file: file,
            element: item,
            status: 'pending',
            targetFormat: null
        });

        updateStats();
    });
}

function createFileItem(file, id) {
    const template = document.getElementById('file-item-template');
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.file-item');

    // Set details
    el.querySelector('.file-name').textContent = file.name;
    el.querySelector('.file-size').textContent = formatBytes(file.size);
    el.querySelector('.file-icon-wrapper').innerHTML = `<i class="${getFileIcon(file.name)}"></i>`;

    // Populate Select
    const select = el.querySelector('.target-format');
    const outputs = getSupportedOutputs(file);

    if (outputs.length === 0) {
        select.innerHTML = '<option disabled selected>No Formats</option>';
        select.disabled = true;
        el.querySelector('.convert-btn').disabled = true;
    } else {
        outputs.forEach(fmt => {
            const opt = document.createElement('option');
            opt.value = fmt;
            opt.textContent = fmt.toUpperCase();
            select.appendChild(opt);
        });

        // Listen for format change
        select.addEventListener('change', (e) => {
            const state = filesState.get(id);
            if (state) state.targetFormat = e.target.value;
        });
        // Set initial
        const state = filesState.get(id); // might be undefined yet due to async append? No, sync.
        // Wait, filesState.set is called after this returns.
        // We can just set the property on the element or init via callback.
        // Actually slightly easier to set default now
        setTimeout(() => {
            if (filesState.has(id))
                filesState.get(id).targetFormat = select.value;
        }, 0);
    }

    // Buttons
    el.querySelector('.remove-btn').addEventListener('click', () => {
        el.remove();
        filesState.delete(id);
        updateStats();
        if (filesState.size === 0) dashboard.classList.add('hidden');
    });

    el.querySelector('.convert-btn').addEventListener('click', () => processFile(id));

    return el;
}

function updateStats() {
    fileCountBadge.textContent = filesState.size;
}

clearAllBtn.addEventListener('click', () => {
    fileList.innerHTML = '';
    filesState.clear();
    dashboard.classList.add('hidden');
    updateStats();
});

convertAllBtn.addEventListener('click', () => {
    filesState.forEach((val, key) => {
        if (val.status === 'pending') processFile(key);
    });
});

async function processFile(id) {
    const data = filesState.get(id);
    if (!data || !data.targetFormat) return;

    const { file, element, targetFormat } = data;
    const progressContainer = element.querySelector('.progress-container');
    const progressBar = element.querySelector('.progress-fill');
    const progressText = element.querySelector('.progress-text');
    const convertBtn = element.querySelector('.convert-btn');
    const downloadBtn = element.querySelector('.download-btn');

    // UI Update
    data.status = 'processing';
    progressContainer.classList.remove('hidden');
    convertBtn.classList.add('hidden');
    element.querySelector('.target-format').disabled = true;

    // Simulate Progress (since most client-side calls don't stream progress easily except FFmpeg)
    let progress = 0;
    const interval = setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 10;
            progressBar.style.width = Math.min(progress, 90) + '%';
            progressText.textContent = Math.floor(Math.min(progress, 90)) + '%';
        }
    }, 200);

    try {
        let resultBlob;
        const type = file.type;

        // Router for conversion logic
        if (type.startsWith('image/')) {
            resultBlob = await convertImage(file, targetFormat);
        } else if (type.startsWith('video/') || type.startsWith('audio/')) {
            // Check cross origin usually needed
            resultBlob = await convertMedia(file, targetFormat);
        } else if (
            type === 'application/pdf' ||
            file.name.endsWith('.docx') ||
            type.includes('wordprocessingml')
        ) {
            resultBlob = await convertDocx(file, targetFormat);
        } else if (
            type.includes('spreadsheet') ||
            file.name.endsWith('.xlsx')) {
            resultBlob = await convertSpreadsheet(file, targetFormat);
        } else if (
            type.includes('json') ||
            type.includes('csv') ||
            file.name.endsWith('.csv')
        ) {
            resultBlob = await convertData(file, targetFormat);
        } else {
            throw new Error("No converter match");
        }

        // Success
        clearInterval(interval);
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        data.status = 'done';

        // Setup Download
        downloadBtn.classList.remove('hidden');
        downloadBtn.onclick = () => {
            saveAs(resultBlob, `converted_${file.name.split('.')[0]}.${targetFormat}`);
        };

        // Auto convert notification?

    } catch (err) {
        clearInterval(interval);
        progressBar.style.background = 'var(--error)';
        progressText.textContent = 'Err';
        console.error(err);
        alert(`Error converting ${file.name}: ${err.message}`);
        data.status = 'error';
        convertBtn.classList.remove('hidden'); // Retry
    }
}
