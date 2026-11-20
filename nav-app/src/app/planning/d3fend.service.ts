import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { D3fendIndex, D3fendRelation, d3fendRelationsFor, parseD3fend } from './d3fend-data';

/** Loads the imported ATT&CK ↔ D3FEND reference data once, on first use. */
@Injectable({ providedIn: 'root' })
export class D3fendService {
    status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    index: D3fendIndex | null = null;

    constructor(private http: HttpClient) {}

    load(): void {
        if (this.status === 'loading' || this.status === 'ready') return;
        this.status = 'loading';
        this.http.get('assets/d3fend/attack-d3fend.json').subscribe({
            next: (raw) => {
                try {
                    this.index = parseD3fend(raw);
                    this.status = 'ready';
                } catch {
                    this.status = 'error';
                }
            },
            error: () => (this.status = 'error'),
        });
    }

    relationsFor(attackID: string): D3fendRelation[] {
        return d3fendRelationsFor(this.index, attackID);
    }
}
