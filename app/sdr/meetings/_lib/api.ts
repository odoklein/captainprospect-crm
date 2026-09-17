export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    const json = await response.json();
    if (!response.ok || !json.success) {
        throw new Error(json.error || "Une erreur est survenue");
    }
    return json.data as T;
}
