import { NextResponse } from 'next/server'

export async function POST(request) {
    const data = await request.json()

    try {
        const controller = new AbortController();
        // Set a very long timeout (30 minutes)
        const timeoutId = setTimeout(() => controller.abort(), 1800000);

        const response = await fetch('http://localhost:8000/api/optimize-paths', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
            signal: controller.signal,
            // Increase timeouts
            keepalive: true,
            timeout: 1800000 // 30 minutes in milliseconds
        })

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Backend responded with status: ${response.status}`)
        }

        const result = await response.json()
        return NextResponse.json(result)

    } catch (error) {
        console.error('Error connecting to backend:', error)
        return new NextResponse(
            JSON.stringify({ error: 'Failed to connect to backend service' }), 
            { 
                status: 503,
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        )
    }
}

// Increase Next.js API route config timeouts
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
        responseLimit: '8mb',
        externalResolver: true,
    },
    maxDuration: 1800, // 30 minutes in seconds
} 