export async function POST(req) {
  try {
    const body = await req.json();
    console.log('Sending to backend:', JSON.stringify(body, null, 2));
    
    try {
      const response = await fetch('http://localhost:8000/api/optimize-paths', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Backend error response:', data);
        return Response.json(data, { status: response.status });
      }

      return Response.json(data);
    } catch (fetchError) {
      console.error('Error connecting to backend:', fetchError);
      return Response.json(
        { error: 'Unable to connect to optimization service. Please ensure the backend server is running.' },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('Error in optimize-paths route:', error);
    return Response.json(
      { error: error.message || 'Failed to optimize paths' },
      { status: 500 }
    );
  }
} 