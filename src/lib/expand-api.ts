// Use proxy API routes instead of direct calls to avoid CORS issues
const PROXY_API_URL = '/api/expand-proxy';

export interface GasEstimateRequest {
  chainId: string;
  data: string;
  from: string;
  to: string;
  value: string;
}

export interface ApprovalData {
  approvals: {
    spender: string;
    amount: string;
    timestamp: string;
  }[];
  totalApprovals: number;
}

export interface TokenBalance {
  balance: string;
  tokenDecimals: number;
  tokenSymbol: string;
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('fetchWithAuth must be called from the client side');
  }

  // Use proxy API route to avoid CORS issues
  const url = `${PROXY_API_URL}?endpoint=${endpoint}`;

  try {
    // Make the request through our proxy
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    // Log error message
    console.error('Fetch error:', error instanceof Error ? error.message : 'Unknown error');

    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`API request failed: ${error.message}`);
    } else {
      throw new Error('API request failed with unknown error');
    }
  }
}

export async function getApprovalData(chainId: string, address: string): Promise<ApprovalData> {
  return fetchWithAuth(
    `historicallp.api.expand.network/chain/getapprovaldata?chainId=${chainId}&address=${address}`
  );
}

export async function estimateGas(params: GasEstimateRequest): Promise<{
  gasLimit: string;
  gasPrice: string;
}> {
  return fetchWithAuth('chain/estimategas', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getTokenBalance(params: {
  chainId: string;
  blockNumber?: string;
  address: string;
  tokenAddress: string;
}): Promise<TokenBalance> {
  const queryParams = new URLSearchParams({
    chainId: params.chainId,
    address: params.address,
    tokenAddress: params.tokenAddress,
    ...(params.blockNumber ? { blockNumber: params.blockNumber } : {})
  });

  return fetchWithAuth(
    `chain/getbalance?${queryParams}`
  );
}

export interface UserBalanceResponse {
  status: number;
  msg: string;
  data: {
    balance: string;
    decimals: number;
    symbol: string;
  };
}

export async function getUserBalance(params: {
  tokenAddress: string;
  address: string;
  chainId: string;
}): Promise<UserBalanceResponse> {
  const queryParams = new URLSearchParams({
    tokenAddress: params.tokenAddress,
    address: params.address,
    chainId: params.chainId,
  });

  return fetchWithAuth(
    `fungibletoken/getuserbalance?${queryParams}`
  );
}

export interface GetPriceResponse {
  status: number;
  msg: string;
  data: {
    amountOut: string;
    priceImpact: string;
  };
}

export const getPrice = async (params: {
  dexId: string;
  path: string;
  amountIn: string;
}): Promise<GetPriceResponse> => {
  const queryParams = new URLSearchParams({
    dexId: params.dexId,
    path: params.path,
    amountIn: params.amountIn,
  });

  return fetchWithAuth(
    `dex/getprice?${queryParams}`
  );
};

export interface SwapResponse {
  status: number;
  msg: string;
  data: {
    chainId: string;
    from: string;
    to: string;
    value: string;
    gas: string;
    data: string;
    gasPrice: string;
    estimationCheck?: string;
    referenceId: string;
  };
}

export const swap = async (params: {
  path: string[];
  amountIn: string;
  amountOutMin: string;
  gas: string;
  from: string;
  to: string;
  gasPriority: 'high' | 'medium' | 'low';
  dexId: string;
}): Promise<SwapResponse> => {
  return fetchWithAuth(
    'dex/swap',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
};