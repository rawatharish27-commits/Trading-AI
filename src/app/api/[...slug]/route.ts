import { NextRequest, NextResponse } from "next/server";

// Get backend URL based on environment
function getBackendUrl(): string {
  // Check for production backend URL
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Default to local backend
  return "http://localhost:3030";
}

// Proxy handler for all API requests
async function proxyRequest(
  request: NextRequest,
  method: string
): Promise<NextResponse> {
  const backendUrl = getBackendUrl();
  
  // Get the path from the URL
  const path = request.nextUrl.pathname.replace("/api", "");
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);
  
  // Remove XTransformPort from search params if present
  searchParams.delete("XTransformPort");
  
  // Build the target URL
  const queryString = searchParams.toString();
  const targetUrl = `${backendUrl}/api${path}${queryString ? `?${queryString}` : ""}`;
  
  try {
    // Prepare headers
    const headers: HeadersInit = {};
    request.headers.forEach((value, key) => {
      // Skip host header to avoid conflicts
      if (key.toLowerCase() !== "host") {
        headers[key] = value;
      }
    });
    
    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers,
    };
    
    // Add body for POST/PUT/PATCH requests
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        const body = await request.json();
        requestOptions.body = JSON.stringify(body);
      } catch {
        // No body or invalid JSON
      }
    }
    
    // Make the request to the backend
    const response = await fetch(targetUrl, requestOptions);
    
    // Get response body
    const contentType = response.headers.get("content-type");
    let responseBody;
    
    if (contentType?.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }
    
    // Return the proxied response
    return NextResponse.json(responseBody, {
      status: response.status,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to connect to backend",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, "PUT");
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, "DELETE");
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, "PATCH");
}
