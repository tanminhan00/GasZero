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

export interface SwapWithApprovalParams {
  dexId: string;
  amountIn: string;
  amountOutMin: string;
  path: string[];
  to: string;
  deadline: string;
  from: string;
  gas?: string;
}

export interface SwapWithApprovalResponse {
  status: number;
  msg: string;
  data: {
    chainId: string;
    from: string;
    to: string;
    value: string;
    gas: string;
    data: string;
    nonce: number;
    referenceId: string;
  }[];
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
    // Log request details
    console.log('Making API request:', {
      url,
      method: requestOptions.method || 'GET',
      headers: Array.from(headers.entries()).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: key === 'x-api-key' ? '[HIDDEN]' : value
      }), {}),
      body: requestOptions.body ? JSON.parse(requestOptions.body as string) : undefined,
    });

    // Make the request
    const response = await fetch(url, requestOptions);
    console.log('Response status:', response.status);

    // Get response text first
    const responseText = await response.text();
    console.log('Raw response:', responseText);

    // Try to parse as JSON
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch (e) {
      console.error('Failed to parse response as JSON:', responseText);
      throw new Error(`Invalid JSON response from API: ${responseText}`);
    }

    // Check for error responses
    if (!response.ok) {
      console.error('API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        data: responseData
      });
      throw new Error(`API Error (${response.status}): ${JSON.stringify(responseData)}`);
    }

    // Return successful response
    console.log('API Response:', responseData);
    return responseData;
  } catch (error) {
    // Log detailed error information
    console.error('Fetch error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      url,
      options: {
        ...requestOptions,
        headers: Array.from(headers.entries()).reduce((acc, [key, value]) => ({
          ...acc,
          [key]: key === 'x-api-key' ? '[HIDDEN]' : value
        }), {})
      }
    });

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

export async function swapWithApproval(params: SwapWithApprovalParams): Promise<SwapWithApprovalResponse> {
  return fetchWithAuth(`${EXPAND_API_URL}/dex/swapwithapproval`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
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