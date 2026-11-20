import { Component, Input } from '@angular/core';

// Shared inline SVG icons: no emoji, icon font, or network dependency.
// Decorative icons inherit their accessible name from the adjacent text or button.
@Component({
    selector: 'aw-icon',
    template: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path [attr.d]="paths[name] || paths.target"/></svg>',
    styles: [':host{display:inline-flex;width:18px;height:18px;flex-shrink:0;vertical-align:middle}svg{display:block;width:100%;height:100%}'],
})
export class PlanningIconComponent {
    @Input() name = 'target';
    paths: Record<string, string> = {
        target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 2v5m0 10v5M2 12h5m10 0h5',
        shield: 'M12 3 4 6v6c0 4 3 7 8 9 5-2 8-5 8-9V6l-8-3Zm-4 9 3 3 5-6',
        chart: 'M3 3v18h18M7 16v-4m5 4V8m5 8V5',
        bot: 'M12 3v3M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM1 12v4m22-4v4M8 12v1m8-1v1m-7 4h6',
        report: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 17v-3m4 3v-6m4 6v-2',
        settings: 'm9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3H9Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
        search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6',
        download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
        check: 'm5 12 4 4L19 6',
        add: 'M12 5v14M5 12h14',
        close: 'm6 6 12 12M6 18 18 6',
        arrow: 'M4 12h16m-7-7 7 7-7 7',
    };
}
