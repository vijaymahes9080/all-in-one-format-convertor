const CACHE_NAME = 'uniconvert-v1';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './css/variables.css',
    './js/script.js',
    './js/app.js',
    './js/utils.js',
    './js/converters/image.js',
    './js/converters/office.js',
    './js/converters/video.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
