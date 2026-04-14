import type {
  GetTransactionHistoryParams,
  PaginatedTransactions,
  TokenWallet,
} from "../../../types/tokenWallet.types.ts";

export interface IUserTokenWalletService {
  getWallet(walletId: string): Promise<TokenWallet | null>;

  getWalletForContext(
    userId?: string,
    organizationId?: string,
  ): Promise<TokenWallet | null>;

  getBalance(walletId: string): Promise<string>;

  checkBalance(walletId: string, amountToSpend: string): Promise<boolean>;

  getTransactionHistory(
    walletId: string,
    params?: GetTransactionHistoryParams,
  ): Promise<PaginatedTransactions>;

  getWalletByIdAndUser(
    walletId: string,
    userId: string,
  ): Promise<TokenWallet | null>;
}
