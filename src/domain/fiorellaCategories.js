// Official labels from Configuración / Track GF. Configuration only, no amounts.
export const FIXED_CATEGORIES = Object.freeze([
  ['servicios', 'Servicios', [['gas', 'Gas'], ['celular', 'Celular'], ['icloud', 'iCloud'], ['luz', 'Luz'], ['agua', 'Agua'], ['internet', 'Internet']]],
  ['transporte', 'Transporte', [['trabajo', 'Trabajo'], ['gym', 'Gym'], ['otros', 'Otros (Transporte)']]],
  ['comida', 'Comida', [['proteinas', 'Proteinas'], ['carbohidrados', 'Carbohidrados'], ['frutas-verduras', 'Frutas&Verduras'], ['condimentos-alinos', 'Condimentos&Aliños'], ['otros', 'Otros (Comida)']]],
  ['bienestar', 'Bienestar', [['gym', 'Gym'], ['slinda', 'Slinda'], ['masajes', 'Masajes'], ['miositol', 'Miositol']]],
  ['otros', 'Otros', [['otros', 'Otros (Otros)']]],
].map(([id, name, children]) => Object.freeze({ id, name,
  children: Object.freeze(children.map(([child, label]) => Object.freeze({ id: `${id}-${child}`, name: label, parentId: id }))),
})));
export const FIXED_SUBCATEGORIES = Object.freeze(FIXED_CATEGORIES.flatMap(category => category.children));
