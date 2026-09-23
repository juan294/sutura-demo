/**
 * Return the number of pages needed for a collection.
 * @param {number} items
 * @param {number} size
 */
export function pageCount(items, size) {
  return Math.floor(items / size) + 1;
}
