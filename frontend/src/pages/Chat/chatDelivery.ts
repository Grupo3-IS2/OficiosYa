export interface SendAttempt { content: string; id: string }

/** Keep the deduplication key if an uncertain send is retried without changing its payload. */
export function sendAttempt(previous: SendAttempt | null, content: string, createId: () => string): SendAttempt {
    const trimmed = content.trim()
    return previous?.content === trimmed ? previous : { content: trimmed, id: createId() }
}

export function canMarkRead({ latest, readThrough, tailVisible, focused, covered, loading, error }: {
    latest: number | undefined; readThrough: number; tailVisible: boolean; focused: boolean
    covered: boolean; loading: boolean; error: boolean
}): boolean {
    return latest !== undefined && latest > readThrough && tailVisible && focused && !covered && !loading && !error
}
