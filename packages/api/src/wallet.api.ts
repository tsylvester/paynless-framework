import { ApiClient } from './apiClient';
import {
  ApiResponse,
  TokenWallet,
  TokenWalletTransaction,
  PurchaseRequest,
  PaymentInitiationResult,
  FetchOptions,
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
   * @param limit Optional limit for pagination.
   * @param offset Optional offset for pagination.
   * @param options Optional fetch options.
   * @returns Promise resolving to the list of transactions.
   */
  async getWalletTransactionHistory(
    organizationId?: string | null,
    limit?: number,
    offset?: number,
    options?: FetchOptions
  ): Promise<ApiResponse<TokenWalletTransaction[]>> {
    let endpoint = '/wallet-history';
    const queryParams = new URLSearchParams();
    if (organizationId) {
      queryParams.append('organizationId', organizationId);
    }
    if (limit !== undefined) {
      queryParams.append('limit', limit.toString());
    }
    if (offset !== undefined) {
      queryParams.append('offset', offset.toString());
    }
    const queryString = queryParams.toString();
    if (queryString) {
      endpoint += `?${queryString}`;
    }
    return this.client.get<TokenWalletTransaction[]>(endpoint, options);
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
    // const endpoint = '/initiate-payment'; // Endpoint to be confirmed/created
    // return this.client.post<PaymentInitiationResult, PurchaseRequest>(endpoint, request, options);

    // Placeholder implementation until endpoint is ready:
    console.warn('initiateTokenPurchase is a placeholder and does not make an API call yet.', request, options);
    return Promise.resolve({
      status: 200,
      statusText: 'OK',
      data: {
        success: true,
        // transactionId: 'temp-txn-id',
        // redirectUrl: 'temp-redirect-url' 
      } as PaymentInitiationResult, // Cast to ensure type match for placeholder
    });
  }
} 