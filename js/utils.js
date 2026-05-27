export const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const getFileExtension = (filename) => {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
};

export const getFileIcon = (filename) => {
    const ext = getFileExtension(filename);
    const icons = {
        // Images
        jpg: 'ri-image-line', jpeg: 'ri-image-line', png: 'ri-image-line', 
        webp: 'ri-image-line', gif: 'ri-image-gif-line', svg: 'ri-brush-line',
        // Video
        mp4: 'ri-movie-line', webm: 'ri-movie-line', avi: 'ri-movie-line', mov: 'ri-movie-line',
        // Audio
        mp3: 'ri-music-line', wav: 'ri-music-line', ogg: 'ri-music-line',
        // Docs
        pdf: 'ri-file-pdf-line', docx: 'ri-file-word-line', txt: 'ri-file-text-line',
        // Data
        csv: 'ri-table-line', xlsx: 'ri-file-excel-line', json: 'ri-braces-line'
    };
    return icons[ext] || 'ri-file-line';
};

export const CONVERSION_MAP = {
    // Images
    'image/jpeg': ['png', 'webp', 'pdf'],
    'image/png': ['jpg', 'webp', 'pdf', 'ico'],
    'image/webp': ['jpg', 'png', 'pdf'],
    'image/gif': ['jpg', 'png', 'webp'], // frames might be lost in simple canvas
    'image/svg+xml': ['png', 'jpg', 'webp'],
    
    // Documents
    'application/pdf': ['jpg', 'png', 'txt'], // PDF to Image logic needed
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['html', 'txt', 'pdf'], // DOCX
    'text/plain': ['pdf'],
    
    // Data
    'text/csv': ['json', 'xlsx', 'html'],
    'application/json': ['csv', 'yaml', 'xml'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['csv', 'json', 'html'],
    
    // Video
    'video/mp4': ['webm', 'mp3', 'gif'],
    'video/webm': ['mp4', 'mp3'],
    
    // Audio
    'audio/mpeg': ['wav', 'ogg'],
    'audio/wav': ['mp3', 'ogg']
};

export const getSupportedOutputs = (file) => {
    // Check MIME type first
    if (CONVERSION_MAP[file.type]) return CONVERSION_MAP[file.type];
    
    // Check by extension if MIME is generic (e.g. application/octet-stream)
    const ext = getFileExtension(file.name);
    // Add extension based mapping fallback here if needed
    const extMap = {
        'docx': ['html', 'txt', 'pdf'],
        'xlsx': ['csv', 'json', 'html'],
        'ppt': ['pdf', 'images'],
        'pptx': ['pdf', 'images']
    };
    return extMap[ext] || [];
};
