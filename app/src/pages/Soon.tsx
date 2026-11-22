import { t, type Key } from '../i18n';
import { BottomNav, TopBar } from '../ui/kit';

/** Placeholder for a module that is not built yet. */
export function Soon({ title }: { title: Key }) {
  return (
    <div class="shell">
      <TopBar title={t(title)} backTo="" />
      <main class="page">
        <div class="card center muted">{t('app.comingSoon')}</div>
      </main>
      <BottomNav />
    </div>
  );
}
