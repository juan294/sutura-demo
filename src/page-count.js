/**
 * Return the number of pages needed for a collection.
 * @param {number} items
 * @param {number} size
 *
 * Returns:
 *   - If `items` <= 0: 0 (no pages)
 *   - Otherwise: ceil(items / size)
 */
export function pageCount(items, size) {
  if (items <= 0) return 0;
  return Math.ceil(items / size);
}
