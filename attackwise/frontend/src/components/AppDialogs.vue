<script setup lang="ts">
// Replacements for the reference dialogs and snackbar:
//   changelog (ChangelogComponent), version-upgrade (VersionUpgradeComponent),
//   versionWarning / safariWarning (ng-templates in tabs.component.html), MatSnackBar.
import { nextTick, ref, watch } from 'vue';
import { marked } from 'marked';
import { notify, type DialogState } from '../app/notify';
import { navVersion } from '../layer/view-model';
import { sanitizeHtml } from '../app/sanitize';
import { httpClientInit } from '../domain/config';

const changelogHtml = ref('');
const changelogError = ref('');
async function loadChangelog() {
    if (changelogHtml.value) return;
    try {
        const res = await fetch('./CHANGELOG.md', httpClientInit);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        changelogHtml.value = sanitizeHtml(await marked.parse(await res.text()));
    } catch (e) {
        changelogError.value = 'Changelog could not be loaded: ' + (e as Error).message;
    }
}

const lastFocus = ref<HTMLElement | null>(null);
const dialogRoot = ref<HTMLElement[]>([]);
watch(
    () => notify.dialogs.length,
    async (n, old) => {
        if (n > (old ?? 0)) {
            lastFocus.value = document.activeElement as HTMLElement | null;
            if (notify.dialogs.some((d) => d.kind === 'changelog')) loadChangelog();
            await nextTick();
            dialogRoot.value[dialogRoot.value.length - 1]?.querySelector<HTMLElement>('button')?.focus();
        } else if (n < (old ?? 0)) {
            lastFocus.value?.focus?.();
        }
    }
);
const close = (d: DialogState, value?: unknown) => notify.close(d.id, value);
const onKey = (d: DialogState, e: KeyboardEvent) => {
    // Reference: changelog closes on Escape (MatDialog default); upgrade/version warnings use disableClose.
    if (e.key === 'Escape' && d.kind === 'changelog') close(d);
};
</script>

<template>
    <div v-for="d in notify.dialogs" :key="d.id" class="aw-overlay" @keydown="onKey(d, $event)">
        <div ref="dialogRoot" class="aw-dialog" role="dialog" aria-modal="true" :aria-labelledby="'aw-dialog-title-' + d.id" :data-dialog="d.kind">
            <template v-if="d.kind === 'upgrade'">
                <div class="mat-dialog">
                    <h3 :id="'aw-dialog-title-' + d.id">Upgrade layer version?</h3>
                    <p>
                        The layer "{{ d.data.layerName }}" uses an outdated version of ATT&amp;CK (v{{ d.data.vmVersion }}). Do you want to open the workflow to upgrade this layer to ATT&amp;CK
                        v{{ d.data.currVersion }}?
                        <em v-if="!d.data.supported">This version is not supported by Navigator v{{ navVersion }} and must be upgraded for use.</em>
                    </p>
                    <div class="aw-dialog-actions"><button @click="close(d, { upgrade: true })">Yes</button><button @click="close(d, { upgrade: false })">No</button></div>
                </div>
            </template>
            <template v-else-if="d.kind === 'versionWarning'">
                <h3 :id="'aw-dialog-title-' + d.id">Layer version mismatch</h3>
                <p>This layer uses {{ d.data.objVersion }}; the current format is {{ d.data.globalVersion }}. Some settings may not be restored.</p>
                <div class="aw-dialog-actions"><button @click="close(d)">Dismiss</button></div>
            </template>
            <template v-else-if="d.kind === 'safari'">
                <h3 :id="'aw-dialog-title-' + d.id">Browser compatibility</h3>
                <p>Please use a current browser for this workspace.</p>
                <div class="aw-dialog-actions"><button @click="close(d)">Dismiss</button></div>
            </template>
            <template v-else-if="d.kind === 'changelog'">
                <div class="changelog-dialog mat-dialog">
                    <!-- Reference changelog.component.html: <h1 mat-dialog-title>Changelog</h1> -->
                    <h1 :id="'aw-dialog-title-' + d.id">Changelog</h1>
                    <div class="content markdown">
                        <p v-if="changelogError" role="alert">{{ changelogError }}</p>
                        <div v-else v-html="changelogHtml"></div>
                    </div>
                    <div class="aw-dialog-actions"><button @click="close(d)">close</button></div>
                </div>
            </template>
        </div>
    </div>
    <div v-if="notify.snack" class="aw-snackbar" role="status" aria-live="polite">
        <span>{{ notify.snack.message }}</span>
        <button v-if="notify.snack.action" @click="notify.dismissSnack(true)">{{ notify.snack.action }}</button>
    </div>
</template>
