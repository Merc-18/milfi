// Screen-only spelling fixes for official labels. The domain names stay as in
// the Excel because the workbook recognizer matches them; ids never change.
const DISPLAY_NAMES = Object.freeze({ 'comida-carbohidrados': 'Carbohidratos' });

export const displayName = category => DISPLAY_NAMES[category.id] ?? category.name;
