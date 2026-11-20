// Replacement for the reference's MatSnackBar / MatDialog usage. Same messages and durations.
import { reactive } from 'vue';

export interface SnackState {
    message: string;
    action: string;
    onAction?: () => void;
    timer?: ReturnType<typeof setTimeout>;
}

export type DialogKind = 'upgrade' | 'versionWarning' | 'safari' | 'changelog';
export interface DialogState {
    id: number;
    kind: DialogKind;
    data: Record<string, unknown>;
    resolve: (value: unknown) => void;
}

let nextId = 1;
export const notify = reactive({
    snack: null as SnackState | null,
    dialogs: [] as DialogState[],
    /** Like MatSnackBar.open: a new snackbar replaces the current one. */
    snackbar(message: string, action: string, duration: number, onAction?: () => void) {
        if (this.snack?.timer) clearTimeout(this.snack.timer);
        const snack: SnackState = { message, action, onAction };
        snack.timer = setTimeout(() => {
            if (this.snack === snack || this.snack?.message === snack.message) this.snack = null;
        }, duration);
        this.snack = snack;
    },
    dismissSnack(action = false) {
        const s = this.snack;
        if (s?.timer) clearTimeout(s.timer);
        this.snack = null;
        if (action) s?.onAction?.();
    },
    open<T = unknown>(kind: DialogKind, data: Record<string, unknown> = {}): Promise<T> {
        return new Promise<T>((resolve) => {
            this.dialogs.push({ id: nextId++, kind, data, resolve: resolve as (v: unknown) => void });
        });
    },
    close(id: number, value: unknown = undefined) {
        const i = this.dialogs.findIndex((d) => d.id === id);
        if (i < 0) return;
        const [d] = this.dialogs.splice(i, 1);
        d.resolve(value);
    },
});
