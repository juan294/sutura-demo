/**
 * Return the number of pages needed for a collection.
 * @param {number} items
 * @param {number} size
 */
export function pageCount(items, size) {
  return items % size === 0 ? items / size : Math.floor(items / size) + 1;
}
