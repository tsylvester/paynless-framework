export function pickLatest<T extends { created_at: string }>(rows: T[]): T {
    if (rows.length === 0) throw new Error('No matching rows found after filtering');
    let latest: T = rows[0];
    let bestTs: number = Date.parse(rows[0].created_at);
    for (let i: number = 1; i < rows.length; i++) {
        const ts: number = Date.parse(rows[i].created_at);
        if (ts > bestTs) { bestTs = ts; latest = rows[i]; }
    }
    return latest;
}
