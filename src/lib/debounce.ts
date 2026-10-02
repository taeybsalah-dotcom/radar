/**
 * Debounce utility to prevent event cascading and rapid network storms
 * Condenses multiple rapid calls into a single execution after waitMs
 */

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number = 300
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeoutId: any = null;

  const debounced = function (this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn.apply(this, args);
    }, waitMs);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}
