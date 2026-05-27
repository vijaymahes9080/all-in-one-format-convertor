/**
 * Video/Audio Converter using FFmpeg.wasm
 * Note: This requires SharedArrayBuffer support, which requires 
 * these HTTP headers to be served by the web server:
 * Cross-Origin-Opener-Policy: same-origin
 * Cross-Origin-Embedder-Policy: require-corp
 */

let ffmpeg = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (window.FFmpeg) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
}

export async function initFFmpeg() {
    if (ffmpeg) return ffmpeg;

    // Check if we are in a secure context with SharedArrayBuffer
    if (!window.crossOriginIsolated) {
        console.warn("SharedArrayBuffer is not available. Video conversion requires a server with COOP/COEP headers.");
        // We can throw or return null to indicate failure availability
        // For the sake of the project, we might let it fail later or polyfill
        throw new Error("Video conversion requires a secure context (HTTPS) and specific server headers (COOP/COEP).");
    }

    try {
        if (!window.FFmpeg) {
            await loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js');
        }

        // Dynamic import or check global
        // Assuming FFmpeg is loaded via script tag (v0.10 or v0.11 usually exposes createFFmpeg)
        const { createFFmpeg, fetchFile } = window.FFmpeg;
        if (!createFFmpeg) throw new Error("FFmpeg library not found");

        ffmpeg = createFFmpeg({
            log: true,
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        await ffmpeg.load();
        return ffmpeg;
    } catch (e) {
        throw new Error("Failed to load FFmpeg: " + e.message);
    }
}

export async function convertMedia(file, targetFormat) {
    const instance = await initFFmpeg();
    const { fetchFile } = window.FFmpeg;

    const inputName = 'input.' + file.name.split('.').pop();
    const outputName = 'output.' + targetFormat;

    instance.FS('writeFile', inputName, await fetchFile(file));

    // Basic conversion command
    await instance.run('-i', inputName, outputName);

    const data = instance.FS('readFile', outputName);

    // Cleanup
    instance.FS('unlink', inputName);
    instance.FS('unlink', outputName);

    let mimeType = `video/${targetFormat}`;
    if (targetFormat === 'mp3') mimeType = 'audio/mpeg';
    if (targetFormat === 'wav') mimeType = 'audio/wav';

    return new Blob([data.buffer], { type: mimeType });
}
