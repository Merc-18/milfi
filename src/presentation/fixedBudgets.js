import { fixedGroups } from '../domain/fiorellaDashboard.js';
import { moneyDifference } from '../domain/fiorellaSession.js';

// Presentation coverage over the shared, exact subtotals. Missing values never
// become zero and a category comparison requires every budget and actual.
export function budgetGroups(summary) {
  return fixedGroups(summary).map(group => {
    const expected = group.rows.length;
    const budgetRegistered = group.rows.filter(({ record }) => record?.budgetAmount != null).length;
    const actualRegistered = group.rows.filter(({ record }) => record?.actualAmount != null).length;
    const complete = budgetRegistered === expected && actualRegistered === expected;
    return { ...group, expected, budgetRegistered, actualRegistered, complete,
      comparison: complete ? moneyDifference(group.budget, group.actual) : { status: 'unavailable', amount: null } };
  });
}
