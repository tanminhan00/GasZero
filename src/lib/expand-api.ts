const EXPAND_API_URL = 'https://api.expand.network';
const EXPAND_HISTORICAL_API_URL = 'https://historicallp.api.expand.network';

// For client-side calls, we must use NEXT_PUBLIC_ prefix
const NEXT_PUBLIC_EXPAND_API_KEY = process.env.NEXT_PUBLIC_EXPAND_API_KEY;

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

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    throw new Error('fetchWithAuth must be called from the client side');
  }

  // Check for API key
  if (!NEXT_PUBLIC_EXPAND_API_KEY) {
    console.error('NEXT_PUBLIC_EXPAND_API_KEY is not set');
    throw new Error('Cannot make API request: NEXT_PUBLIC_EXPAND_API_KEY is not set');
  }

  // Prepare headers with CORS support
  const headers = new Headers({
    'x-api-key': NEXT_PUBLIC_EXPAND_API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  });

  // Merge with any custom headers
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      if (value) headers.append(key, value);
    });
  }

  // Prepare request options
  const requestOptions: RequestInit = {
    ...options,
    headers,
    mode: 'cors',
    credentials: 'omit',
  };

  try {
    // Make the request
    const response = await fetch(url, requestOptions);

    // Get response text and parse as JSON
    const responseText = await response.text();
    const responseData = responseText ? JSON.parse(responseText) : null;

    // Check for error responses
    if (!response.ok) {
      throw new Error(`API Error (${response.status}): ${JSON.stringify(responseData)}`);
    }
    return responseData;
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
    `${EXPAND_HISTORICAL_API_URL}/chain/getapprovaldata?chainId=${chainId}&address=${address}`
  );
}

export async function estimateGas(params: GasEstimateRequest): Promise<{
  gasLimit: string;
  gasPrice: string;
}> {
  return fetchWithAuth(`${EXPAND_API_URL}/chain/estimategas`, {
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
    `${EXPAND_API_URL}/chain/getbalance?${queryParams}`
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
    `${EXPAND_API_URL}/fungibletoken/getuserbalance?${queryParams}`
  );
}

export interface GetPoolParams {
  dexId: string;
  tokenA: string;
  tokenB: string;
  path: string[];
  amountIn: string;
  gas: string;
  from: string;
  to: string;
  cheapestSwap: boolean;
  gasPriority: 'high' | 'medium' | 'low';
  bestSwap: boolean;
  chainId: string;
}

export interface GetPoolResponse {
  status: number;
  msg: string;
  data: {
    pool: string;
    fee: string;
    liquidity: string;
    sqrtPriceX96: string;
    tick: string;
  };
}

export const getPool = async (params: GetPoolParams): Promise<GetPoolResponse> => {
  const queryParams = new URLSearchParams({
    dexId: params.dexId,
    tokenA: params.tokenA,
    tokenB: params.tokenB,
  });

  return fetchWithAuth(
    `${EXPAND_API_URL}/dex/getpool?${queryParams}`,
    {
      method: 'POST',
      body: JSON.stringify({
        path: params.path,
        amountIn: params.amountIn,
        gas: params.gas,
        from: params.from,
        to: params.to,
        cheapestSwap: params.cheapestSwap,
        gasPriority: params.gasPriority,
        bestSwap: params.bestSwap,
        chainId: params.chainId,
      }),
    }
  );
};

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
    `${EXPAND_API_URL}/dex/getprice?${queryParams}`
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
    `${EXPAND_API_URL}/dex/swap`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
};