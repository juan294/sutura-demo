/**
 * Return the number of pages needed for a collection.
 * @param {number} items
 * @param {number} size
 */
export function pageCount(items, size) {
  return items === 0 ? 0 : Math.floor((items - 1) / size) + 1;
}
