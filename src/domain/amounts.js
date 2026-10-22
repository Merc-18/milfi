// Exact decimal strings for previews and model validation. No rounding policy.
export function normalizeAmount(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    value = String(value);
  }
  if (typeof value !== 'string') return null;
  const input = value.trim();
  // Technical input bound, not a financial ceiling. No locale/currency guessing.
  if (input.length > 100 || !/^\d+(?:\.\d+)?$/.test(input)) return null;
  const [whole, fraction = ''] = input.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  return decimals ? `${integer}.${decimals}` : integer;
}

function parts(value) {
  const [integer, decimals = ''] = value.split('.');
  return { coefficient: BigInt(integer + decimals), scale: decimals.length };
}

function fromParts(coefficient, scale) {
  const digits = coefficient.toString().padStart(scale + 1, '0');
  if (!scale) return digits;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${digits.slice(0, -scale)}.${fraction}` : digits.slice(0, -scale);
}

function align(left, right) {
  const a = parts(left);
  const b = parts(right);
  const scale = Math.max(a.scale, b.scale);
  return [
    a.coefficient * 10n ** BigInt(scale - a.scale),
    b.coefficient * 10n ** BigInt(scale - b.scale),
    scale,
  ];
}

export function compareAmounts(left, right) {
  const [a, b] = align(left, right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function subtractAmounts(left, right) {
  const [a, b, scale] = align(left, right);
  if (a < b) throw new RangeError('A negative result requires a financial policy.');
  return fromParts(a - b, scale);
}

export function percentageOf(amount, percentage) {
  const { coefficient, scale } = parts(amount);
  return fromParts(coefficient * BigInt(percentage), scale + 2);
}

export function hasFractionalCent(amount) {
  return (amount.split('.')[1]?.length ?? 0) > 2;
}
