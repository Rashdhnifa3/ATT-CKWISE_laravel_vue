const VUE_URL = process.env.ATTACKWISE_VUE_URL || 'http://127.0.0.1:4174';

/** Refuses to run when the target is not the Vue build (e.g. the Angular reference on the same port). */
export default async function globalSetup() {
    const html = await (await fetch(VUE_URL + '/')).text();
    if (!/<meta name="attackwise-frontend" content="vue"/.test(html) || !/data-attackwise-app="vue"/.test(html)) {
        throw new Error(`${VUE_URL} does not serve the ATT&CKWISE Vue build; refusing to run Vue tests against it.`);
    }
}
