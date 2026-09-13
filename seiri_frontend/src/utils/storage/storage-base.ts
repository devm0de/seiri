// storage-base.ts

// Values supported by storage.
export type StorageItemValue = string | number | boolean | null;

// Ensures T contains no values.
// If T is not never, TypeScript will show an error.
export type AssertNoExtras<T extends never> = T;

export abstract class StorageBase {
  // General storage
  abstract getItem<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null>;

  abstract setItem<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean>;

  abstract removeItem(
    key: string,
  ): Promise<boolean>;

  // Secure storage
  abstract secureGet<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null>;

  abstract secureSet<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean>;

  abstract secureRemove(
    key: string,
  ): Promise<boolean>;

  // Shared helper for converting stored JSON back to its value.
  protected retrieve<Fallback extends StorageItemValue>(
    raw: string | null,
    fallback: Fallback,
  ): Fallback | null {
    if (raw === null) {
      return fallback;
    }

    try {
      return JSON.parse(raw) as Fallback | null;
    } catch {
      return fallback;
    }
  }

  // Storage errors should not crash the app.
  protected warn(
    operation: string,
    key: string,
    error: unknown,
  ): void {
    if (__DEV__) {
      console.warn(
        `[Storage] ${operation} failed for key "${key}"`,
        error,
      );
    }
  }
}