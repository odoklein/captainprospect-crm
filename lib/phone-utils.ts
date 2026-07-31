export function hasUsablePhone(
    phone?: string | null,
    additionalPhones: Array<string | null | undefined> = [],
): boolean {
    return [phone, ...additionalPhones].some((value) => {
        if (!value?.trim()) return false;
        const digits = value.replace(/\D/g, "");
        return digits.length >= 7 && digits.length <= 15;
    });
}
