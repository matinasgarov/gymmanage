// Test double for `next/cache`. Revalidation is a no-op in tests.
export function revalidatePath(_path?: string, _type?: string) {}
export function revalidateTag(_tag?: string) {}
