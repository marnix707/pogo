/** Where space `i` of an N-space ring sits on the square grid (row 0 = top). Start is the bottom-left corner, the ring runs up the left side and clockwise. */
export function gridPos(i: number, n: number): { row: number; col: number } {
  const q = n / 4;
  if (i <= q) return { row: q - i, col: 0 };
  if (i <= 2 * q) return { row: 0, col: i - q };
  if (i <= 3 * q) return { row: i - 2 * q, col: q };
  return { row: q, col: q - (i - 3 * q) };
}
