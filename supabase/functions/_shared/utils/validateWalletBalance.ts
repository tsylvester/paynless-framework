export function validateWalletBalance(walletBalanceStr: string, walletId: string): number {
    const walletBalance: number = parseFloat(walletBalanceStr);
    if (!Number.isFinite(walletBalance) || walletBalance < 0) {
        throw new Error(`Could not parse wallet balance for walletId: ${walletId}`);
    }
    return walletBalance;
}
