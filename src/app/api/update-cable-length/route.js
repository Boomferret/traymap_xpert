import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    
    console.log('Frontend API: Received cable length update request', body);
    
    // Forward the request to the FastAPI backend
    const response = await fetch('http://localhost:8000/api/update-cable-length', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const data = await response.json();
    
    console.log('Frontend API: Cable length update successful', data);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Frontend API: Error updating cable length:', error);
    return NextResponse.json(
      { error: 'Failed to update cable length', details: error.message },
      { status: 500 }
    );
  }
} 