/**
 * Return the number of pages needed for a collection.
 * @param {number} items
 * @param {number} size
 */
export function pageCount(items, size) {
  if (items <= 0 || size <= 0) {
    return 0;
  }
  return Math.ceil(items / size);
}
