// Port of nav-app/src/app/planning/planning-ui.service.ts (ATT&CKWISE reference).
// Keys: attackwise-language ('en' | anything else → 'ar'), attackwise-theme ('ember' | anything else → 'indigo').
import { reactive } from 'vue';
import { referenceLabels } from './reference-labels';

export type Lang = 'ar' | 'en';
export type Theme = 'indigo' | 'ember';

function readPrefs(): { lang: Lang; theme: Theme } {
    try {
        return {
            lang: localStorage.getItem('attackwise-language') === 'en' ? 'en' : 'ar',
            theme: localStorage.getItem('attackwise-theme') === 'ember' ? 'ember' : 'indigo',
        };
    } catch {
        return { lang: 'ar', theme: 'indigo' };
    }
}

class PlanningUi {
    lang: Lang = 'ar';
    search = '';
    theme: Theme = 'indigo';

    init() {
        const prefs = readPrefs();
        this.lang = prefs.lang;
        this.theme = prefs.theme;
        this.setTheme(this.theme);
        this.apply();
    }
    setTheme(theme: Theme) {
        this.theme = theme;
        document.documentElement.dataset['attackwiseTheme'] = theme;
        try {
            localStorage.setItem('attackwise-theme', theme);
        } catch {
            /* preference applies to this session only */
        }
    }
    tr(en: string, ar: string) {
        return this.lang === 'ar' ? ar : en;
    }
    name(item: { name: string; attackID: string }) {
        return this.lang === 'ar' ? referenceLabels[item.attackID] || item.name : item.name;
    }
    toggle() {
        this.lang = this.lang === 'ar' ? 'en' : 'ar';
        this.apply();
        try {
            localStorage.setItem('attackwise-language', this.lang);
        } catch {
            /* preference applies to this session only */
        }
    }
    private apply() {
        document.documentElement.lang = this.lang;
        document.documentElement.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
    }
}

export const ui = reactive(new PlanningUi());
