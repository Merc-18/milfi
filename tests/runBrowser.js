// Browser suites, one Node process each, in order; stops at the first failure.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const SUITES = ['browser', 'persistedBrowser', 'fixedBudgets.browser', 'controlCompletion.browser', 'dailyControl.browser',
  'noHorizontalScroll.browser', 'controlTasks.browser'];

for (const suite of SUITES) {
  const { status } = spawnSync(process.execPath, [`tests/${suite}.test.js`], { stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}
