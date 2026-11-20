<script setup lang="ts">
// Port of nav-app/src/app/app.component.html + tabs/tabs.component.html (ATT&CKWISE reference).
import { onBeforeUnmount, onMounted } from 'vue';
import AwIcon from './components/AwIcon.vue';
import PlanningView from './components/PlanningView.vue';
import AppDialogs from './components/AppDialogs.vue';
import { workspace as w } from './app/workspace';
import { notify } from './app/notify';
import { ui } from './planning/ui';
import { navVersion, type PlanningView as View } from './layer/view-model';
import type { Tab } from './app/workspace';

const views: View[] = ['attack', 'defensive', 'final'];

function openUploadPrompt() {
    (document.getElementById('uploader') as HTMLInputElement).click();
}
function loadLayerFromFile(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length < 1) {
        alert('You must select a file to upload!');
        return;
    }
    w.readJSONFile(input.files[0]);
}
function selectPlan(e: Event) {
    const index = Number((e.target as HTMLSelectElement).value);
    w.selectTab(w.plans[index]);
}
const planIndex = () => w.plans.findIndex((t: Tab) => t === w.activeTab);

// Reference AppComponent.promptNavAway (feature flag leave_site_dialog).
function promptNavAway(event: BeforeUnloadEvent) {
    if (!w.config?.getFeature('leave_site_dialog')) return;
    event.preventDefault();
    event.returnValue = 'Are you sure you want to navigate away? Your data may be lost!';
}
// Reference @HostListener('window:pagehide') / ('document:visibilitychange') → saveAllPlans.
const saveAll = () => w.saveAllPlans();

onMounted(() => {
    window.addEventListener('beforeunload', promptNavAway);
    window.addEventListener('pagehide', saveAll);
    document.addEventListener('visibilitychange', saveAll);
    w.afterViewInit();
});
onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', promptNavAway);
    window.removeEventListener('pagehide', saveAll);
    document.removeEventListener('visibilitychange', saveAll);
});
</script>

<template>
    <div class="theme-override-dark">
        <div class="app-container">
            <div class="nav-app">
                <div class="tabs-host">
                    <div class="attackwise">
                        <header class="wise-header">
                            <div class="reference-header">
                                <a class="wise-brand" href="#" @click.prevent="w.newBlankTab()"><span class="brand-icon"><AwIcon name="shield" /></span><strong dir="ltr">ATT&amp;CKWISE</strong><span class="matrix-version" dir="ltr">Enterprise Matrix {{ w.currentVersion ? 'v' + w.currentVersion : '' }}</span></a>
                                <nav v-if="w.activeTab?.isDataTable" class="reference-nav" aria-label="Plan views">
                                    <button
                                        v-for="(tab, i) in views"
                                        :key="tab"
                                        :class="{ active: w.activeTab.viewModel!.planningView === tab }"
                                        :aria-current="w.activeTab.viewModel!.planningView === tab ? 'step' : undefined"
                                        @click="w.setView(tab)"
                                    ><AwIcon :name="i === 0 ? 'target' : i === 1 ? 'shield' : 'chart'" /><span class="step-index">{{ i + 1 }}</span>{{ i === 0 ? ui.tr('Attack Plan', 'حدد الهجمات') : i === 1 ? ui.tr('Defensive Plan', 'خطة الدفاع') : ui.tr('Final Plan', 'التقرير النهائي') }}</button>
                                </nav>
                                <div class="reference-header-actions">
                                    <select class="theme-picker" :aria-label="ui.tr('Color theme', 'ألوان الواجهة')" :value="ui.theme" @change="ui.setTheme(($event.target as HTMLSelectElement).value as 'indigo' | 'ember')"><option value="indigo">{{ ui.tr('Midnight Indigo', 'نيلي ليلي') }}</option><option value="ember">{{ ui.tr('Black & Orange', 'أسود وبرتقالي') }}</option></select>
                                    <label v-if="w.activeTab?.viewModel?.planningView === 'attack'" class="header-search"><AwIcon name="search" /><input v-model="ui.search" :aria-label="ui.tr('Search techniques', 'البحث عن التقنيات')" :placeholder="ui.tr('Search T1566, phishing…', 'ابحث T1566، تصيد…')" /></label>
                                    <span v-if="w.activeTab?.isDataTable" class="selected-pill">{{ w.selectedCount }} {{ ui.tr('Selected', 'محدد') }}</span>
                                    <button aria-label="Language" @click="ui.toggle()">{{ ui.lang === 'ar' ? 'EN' : 'ع' }}</button>
                                    <button v-if="w.activeTab?.isDataTable && w.activeTab.viewModel!.planningView !== 'final'" class="reference-primary" :disabled="!w.selectedCount" @click="w.nextStep()">{{ ui.tr('Next Step', 'الخطوة التالية') }}<AwIcon name="arrow" /></button>
                                </div>
                            </div>
                        </header>
                        <p v-if="w.bannerContent" class="wise-banner">{{ w.bannerContent }}</p>
                        <main v-if="!w.activeTab?.isDataTable" class="wise-home">
                            <span class="wise-eyebrow">THREAT-INFORMED PLANNING · ATT&amp;CKWISE</span>
                            <h1>{{ ui.tr('Understand Attacks.', 'افهم الهجمات.') }}<br /><em>{{ ui.tr('Build Smarter Defenses.', 'ابنِ دفاعات أذكى.') }}</em></h1>
                            <p class="wise-tagline">{{ ui.tr('MITRE ATT&CK Enterprise threat modeling.', 'نمذجة التهديدات باستخدام MITRE ATT&CK Enterprise.') }}</p>
                            <form class="wise-create" novalidate @submit.prevent="w.createPlan()">
                                <span class="wise-eyebrow">YOUR NEXT SCENARIO</span>
                                <h2>{{ ui.tr('Create New Threat Plan', 'إنشاء خطة تهديد جديدة') }}</h2>
                                <p>A clearer picture of your security posture starts here.</p>
                                <label for="plan-name">{{ ui.tr('Plan Name', 'اسم الخطة') }}</label>
                                <input id="plan-name" v-model="w.planName" name="planName" maxlength="100" required placeholder="e.g. Financial Threat Plan" :aria-invalid="!!w.planError" aria-describedby="plan-error" :disabled="w.creatingPlan" />
                                <p class="enterprise-only" dir="ltr">Enterprise ATT&amp;CK</p>
                                <p v-if="w.planError" id="plan-error" role="alert" class="wise-error">{{ w.planError }}</p>
                                <button class="wise-primary" type="submit" :disabled="w.creatingPlan">{{ w.creatingPlan ? ui.tr('Loading ATT&CK…', 'جارٍ تحميل ATT&CK…') : ui.tr('Start Threat Assessment', 'ابدأ تقييم التهديدات') }}</button>
                                <button class="wise-import" type="button" @click="openUploadPrompt()">↑ Open existing .json plan</button>
                            </form>
                            <section v-if="w.savedPlans.length" class="wise-saved-plans" :aria-label="ui.tr('Saved plans', 'الخطط المحفوظة')">
                                <span class="wise-eyebrow">{{ ui.tr('CONTINUE WHERE YOU LEFT OFF', 'أكمل من حيث توقفت') }}</span>
                                <h2>{{ ui.tr('Your saved plans', 'خططك المحفوظة') }}</h2>
                                <p>{{ ui.tr('Plans are saved automatically in this browser.', 'تُحفظ الخطط تلقائياً في هذا المتصفح.') }}</p>
                                <ul>
                                    <li v-for="plan in w.savedPlans" :key="plan.id">
                                        <button class="saved-plan-open" type="button" :disabled="w.creatingPlan" @click="w.resumePlan(plan)"><strong>{{ plan.name }}</strong><small>{{ ui.tr('Last saved', 'آخر حفظ') }} · {{ w.savedPlanDate(plan) }}</small></button>
                                        <button v-if="w.deletePlanCandidate !== plan.id" class="saved-plan-delete" type="button" :aria-label="ui.tr('Delete plan', 'حذف الخطة') + ' ' + plan.name" @click="w.deletePlanCandidate = plan.id"><AwIcon name="close" /></button>
                                        <span v-else class="saved-plan-confirm"><button type="button" class="danger" @click="w.deleteSavedPlan(plan)">{{ ui.tr('Delete', 'حذف') }}</button><button type="button" @click="w.deletePlanCandidate = ''">{{ ui.tr('Cancel', 'إلغاء') }}</button></span>
                                    </li>
                                </ul>
                            </section>
                            <div class="wise-workflow-preview">
                                <article><b>01</b><h3>Map the adversary</h3><p>Explore tactics and techniques. Define the threats that matter to your organization.</p></article>
                                <article><b>02</b><h3>Design your defense</h3><p>Connect attacks to relevant mitigations and assess your implementation.</p></article>
                                <article><b>03</b><h3>Make risk visible</h3><p>Identify exposure, prioritize gaps, and share an executive assessment.</p></article>
                            </div>
                        </main>
                        <div v-if="w.activeTab?.isDataTable" class="workspace-tools">
                            <span>{{ w.activeTab.viewModel!.name }}</span>
                            <button @click="w.newBlankTab()">{{ ui.tr('New plan', 'خطة جديدة') }}</button>
                            <button @click="openUploadPrompt()">{{ ui.tr('Open plan', 'فتح خطة') }}</button>
                            <select aria-label="Plan" :value="planIndex()" @change="selectPlan"><option v-for="(plan, i) in w.plans" :key="i" :value="i">{{ plan.viewModel!.name }}</option></select>
                        </div>
                        <input id="uploader" type="file" accept=".json,application/json" hidden @change="loadLayerFromFile" />
                        <PlanningView v-if="w.activeTab?.isDataTable" :view-model="w.activeTab.viewModel!" @download="w.saveLayerLocally(w.activeTab.viewModel!)" />
                        <footer class="wise-attribution">ATT&amp;CKWISE · Independent threat modeling using <a href="https://attack.mitre.org/" target="_blank" rel="noopener">MITRE ATT&amp;CK®</a>. Not an official MITRE product.</footer>
                    </div>
                </div>
                <button class="version-footer" @click="notify.open('changelog')">MITRE ATT&amp;CK&reg; Navigator v{{ navVersion }}</button>
            </div>
        </div>
        <AppDialogs />
    </div>
</template>
