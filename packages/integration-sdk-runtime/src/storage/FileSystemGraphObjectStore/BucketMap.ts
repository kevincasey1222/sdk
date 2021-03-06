/**
 * An extension of a regular JS Map that for dealing
 * with arrays.
 *
 * This supports appending values to an existing key
 * and also tracks the total count of objects stored.
 */
export class BucketMap<T = any> extends Map<string, T[]> {
  private internalTotalItemCount = 0;

  get totalItemCount() {
    return this.internalTotalItemCount;
  }

  add(key: string, values: T[]) {
    const existingValues = this.get(key);
    this.set(key, [...(existingValues ?? []), ...values]);
  }

  set(key: string, values: T[]) {
    const existingItemCount = this.get(key)?.length ?? 0;
    super.set(key, values);
    this.internalTotalItemCount += values.length - existingItemCount;
    return this;
  }

  delete(key: string) {
    const existingItemCount = this.get(key)?.length ?? 0;
    const deleteResult = super.delete(key);

    this.internalTotalItemCount -= existingItemCount;

    return deleteResult;
  }
}
