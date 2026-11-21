// Port of nav-app/src/app/planning/d3fend.service.ts: loads the bundled D3FEND asset once.
import { markRaw, reactive } from 'vue';
import { httpClientInit } from '../domain/config';
import { d3fendRelationsFor, parseD3fend, type D3fendIndex, type D3fendRelation } from './d3fend-data';

export const d3fend = reactive({
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    index: null as D3fendIndex | null,
    load(fetcher: typeof fetch = (i, o) => fetch(i, o)) {
        if (this.status === 'loading' || this.status === 'ready') return;
        this.status = 'loading';
        fetcher('assets/d3fend/attack-d3fend.json', httpClientInit)
            .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then((raw) => {
                try {
                    this.index = markRaw(parseD3fend(raw));
                    this.status = 'ready';
                } catch {
                    this.status = 'error';
                }
            })
            .catch(() => (this.status = 'error'));
    },
    relationsFor(attackID: string): D3fendRelation[] {
        return d3fendRelationsFor(this.index, attackID);
    },
});
