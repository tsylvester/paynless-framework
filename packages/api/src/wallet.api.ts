import { ApiClient } from './apiClient';
import {
  ApiResponse,
  TokenWallet,
  PaginatedTransactions,
  PurchaseRequest,
  PaymentInitiationResult,
  FetchOptions,
  GetTransactionHistoryParams
} from '@paynless/types';

export class WalletApiClient {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  /**
   * Fetches wallet information for the current user or a specified organization.
   * @param organizationId Optional ID of the organization. If null/undefined, fetches the user's personal wallet.
   * @param options Optional fetch options.
   * @returns Promise resolving to the wallet information.
   */
  async getWalletInfo(
    organizationId?: string | null,
    options?: FetchOptions
  ): Promise<ApiResponse<TokenWallet | null>> {
    const endpoint = organizationId
      ? `/wallet-info?organizationId=${organizationId}`
      : '/wallet-info';
    return this.client.get<TokenWallet | null>(endpoint, options);
  }

  /**
   * Fetches the transaction history for the current user's wallet or a specified organization's wallet.
   * @param organizationId Optional ID of the organization.
   * @param params Optional parameters for pagination (limit, offset) or fetching all (fetchAll).
   * @param options Optional fetch options.
   * @returns Promise resolving to PaginatedTransactions.
   */
  async getWalletTransactionHistory(
    organizationId?: string | null,
    params?: GetTransactionHistoryParams,
    options?: FetchOptions
  ): Promise<ApiResponse<PaginatedTransactions>> {
    let endpoint = '/wallet-history';
    const queryParams = new URLSearchParams();
    if (organizationId) {
      queryParams.append('organizationId', organizationId);
    }
    if (params?.limit !== undefined) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.offset !== undefined) {
      queryParams.append('offset', params.offset.toString());
    }
    if (params?.fetchAll) {
      queryParams.append('fetchAll', 'true');
    }

    const queryString = queryParams.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }
    return this.client.get<PaginatedTransactions>(endpoint, options);
  }

  /**
   * Initiates a token purchase process.
   * @param request The purchase request details.
   * @param options Optional fetch options.
   * @returns Promise resolving to the payment initiation result.
   */
  async initiateTokenPurchase(
    request: PurchaseRequest,
    options?: FetchOptions
  ): Promise<ApiResponse<PaymentInitiationResult>> {
    const endpoint = '/initiate-payment'; 
    return this.client.post<PaymentInitiationResult, PurchaseRequest>(endpoint, request, options);
  }
} 