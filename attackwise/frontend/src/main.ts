// Global styles first, component styles after — same cascade order as Angular (global styles,
// then component styles injected later), which matters where specificity ties.
import './styles/app.scss';
import { createApp } from 'vue';
import App from './App.vue';
import { ui } from './planning/ui';
import { workspace } from './app/workspace';

document.title = 'ATT&CKWISE';
ui.init();

workspace
    .boot()
    .then(() => {
        createApp(App).mount('#app');
    })
    .catch((err) => {
        console.error(err);
        // Reference (APP_INITIALIZER failure): alert, then a blank page.
        alert(`ERROR the configuration file failed to parse. See the javascript console for more details.`);
        const el = document.getElementById('app');
        if (el) {
            el.setAttribute('role', 'alert');
            el.textContent = 'ATT&CKWISE could not start: ' + ((err as Error)?.message || 'configuration error') + '. Reload to retry.';
        }
    });
