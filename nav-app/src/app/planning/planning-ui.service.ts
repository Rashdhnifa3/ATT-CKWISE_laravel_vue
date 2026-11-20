import { Injectable } from '@angular/core';
import { referenceLabels } from './reference-labels';
@Injectable({ providedIn: 'root' })
export class PlanningUiService {
    lang: 'ar' | 'en' = 'ar';
    search = '';
    theme: 'indigo' | 'ember' = 'indigo';
    setTheme(theme: 'indigo' | 'ember') { this.theme = theme; document.documentElement.dataset['attackwiseTheme'] = theme; try { localStorage.setItem('attackwise-theme',theme); } catch {} }
    constructor() { try { this.lang = localStorage.getItem('attackwise-language') === 'en' ? 'en' : 'ar'; this.theme = localStorage.getItem('attackwise-theme') === 'ember' ? 'ember' : 'indigo'; } catch {} this.setTheme(this.theme); this.apply(); }
    tr(en: string, ar: string) { return this.lang === 'ar' ? ar : en; }
    name(item: { name: string; attackID: string }) { return this.lang === 'ar' ? referenceLabels[item.attackID] || item.name : item.name; }
    toggle() { this.lang = this.lang === 'ar' ? 'en' : 'ar'; this.apply(); try { localStorage.setItem('attackwise-language', this.lang); } catch {} }
    private apply() { document.documentElement.lang = this.lang; document.documentElement.dir = this.lang === 'ar' ? 'rtl' : 'ltr'; }
}
