import { NextRequest, NextResponse } from 'next/server';

const EXPAND_API_URL = 'https://api.expand.network';
const EXPAND_HISTORICAL_API_URL = 'https://historicallp.api.expand.network';

// Get API key from environment
const EXPAND_API_KEY = process.env.EXPAND_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint parameter' }, { status: 400 });
  }

  if (!EXPAND_API_KEY) {
    // Return mock data for development
    console.warn('EXPAND_API_KEY not configured, returning mock data');
    return NextResponse.json({
      status: 200,
      msg: 'Success',
      data: {
        balance: '1000000000', // 1000 USDC (6 decimals)
        decimals: 6,
        symbol: 'USDC'
      }
    });
  }

  try {
    // Handle historical API calls
    const baseUrl = endpoint.includes('historicallp.api.expand.network') 
      ? EXPAND_HISTORICAL_API_URL 
      : EXPAND_API_URL;
    
    const cleanEndpoint = endpoint.replace('historicallp.api.expand.network/', '').replace('api.expand.network/', '');
    const url = `${baseUrl}/${cleanEndpoint}?${searchParams.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': EXPAND_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `API Error (${response.status}): ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Expand API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Expand API' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');
  
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint parameter' }, { status: 400 });
  }

  if (!EXPAND_API_KEY) {
    // Return mock data for development
    console.warn('EXPAND_API_KEY not configured, returning mock data');
    return NextResponse.json({
      status: 200,
      msg: 'Success',
      data: {
        pool: '0x1234567890123456789012345678901234567890',
        fee: '3000',
        liquidity: '1000000000000000000000',
        sqrtPriceX96: '1234567890123456789012345678901234567890',
        tick: '12345'
      }
    });
  }

  try {
    const body = await request.json();
    
    // Handle historical API calls
    const baseUrl = endpoint.includes('historicallp.api.expand.network') 
      ? EXPAND_HISTORICAL_API_URL 
      : EXPAND_API_URL;
    
    const cleanEndpoint = endpoint.replace('historicallp.api.expand.network/', '').replace('api.expand.network/', '');
    const url = `${baseUrl}/${cleanEndpoint}?${searchParams.toString()}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': EXPAND_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `API Error (${response.status}): ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Expand API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Expand API' },
      { status: 500 }
    );
  }
}
