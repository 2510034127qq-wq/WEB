/** Cubic B-spline with linearly extended end controls. Curvature is continuous,
 * without clamping away Catmull-Rom overshoots into small flat bands. */
export function sampleProfile(values: readonly number[], t: number) {
  const end = values.length - 1;
  const index = Math.max(0, Math.min(end, t));
  const row = Math.min(end - 1, Math.floor(index)),
    f = index - row;
  const a = row > 0 ? values[row - 1] : 2 * values[0] - values[1];
  const b = values[row],
    c = values[row + 1];
  const d =
    row + 2 <= end ? values[row + 2] : 2 * values[end] - values[end - 1];
  const f2 = f * f,
    f3 = f2 * f;
  return (
    ((1 - 3 * f + 3 * f2 - f3) * a +
      (4 - 6 * f2 + 3 * f3) * b +
      (1 + 3 * f + 3 * f2 - 3 * f3) * c +
      f3 * d) /
    6
  );
}
