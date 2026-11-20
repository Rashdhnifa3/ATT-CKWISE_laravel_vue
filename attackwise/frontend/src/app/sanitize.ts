// Minimal allow-list sanitizer for the shipped CHANGELOG.md rendering (reference: ngx-markdown
// with Angular's HTML sanitizer). Removes active content, event handlers and non-http(s)/mailto/#
// links so markdown can never execute script.
const BLOCKED = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'BASE', 'SVG', 'MATH']);
const SAFE_URL = /^(https?:|mailto:|#|\.{0,2}\/|[^:]*$)/i;

export function sanitizeHtml(html: string): string {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const walk = (el: Element) => {
        for (const child of Array.from(el.children)) {
            if (BLOCKED.has(child.tagName.toUpperCase())) {
                child.remove();
                continue;
            }
            for (const attr of Array.from(child.attributes)) {
                const name = attr.name.toLowerCase();
                if (name.startsWith('on') || name === 'style' || name === 'srcdoc') child.removeAttribute(attr.name);
                else if ((name === 'href' || name === 'src' || name === 'xlink:href') && !SAFE_URL.test(attr.value.trim())) child.removeAttribute(attr.name);
            }
            if (child.tagName === 'A') {
                child.setAttribute('rel', 'noopener noreferrer');
                if (/^https?:/i.test(child.getAttribute('href') || '')) child.setAttribute('target', '_blank');
            }
            walk(child);
        }
    };
    walk(doc.body);
    return doc.body.innerHTML;
}
