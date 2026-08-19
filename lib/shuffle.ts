/** Стабильный «не по порядку» набор фото: один и тот же авто всегда в одном порядке, но не 1-2-3 как на Encar. */
export function seededShuffle<T>(items: T[], seed: string | number): T[] {
  const arr = items.slice()
  if (arr.length < 2) return arr
  let h = 2166136261
  const s = String(seed)
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  }
  const next = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return (h >>> 0) / 4294967296
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}
