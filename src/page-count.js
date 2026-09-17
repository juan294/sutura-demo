/**
 * Return the number of pages needed for a collection.
 * @param {number} items
 * @param {number} size
 * 
 */
export function pageCount(items, size) {
  if (items % size === 0 && items > 0) {
    return items / size;
  }
  return Math.floor(items / size) + 1;
}
