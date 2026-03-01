import { NextRequest, NextResponse } from 'next/server';

// LLM API Route - Uses z-ai-web-dev-sdk for AI capabilities
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, temperature = 0.3, max_tokens = 500 } = body;

    // Use z-ai-web-dev-sdk LLM capability
    const { LLM } = await import('z-ai-web-dev-sdk');
    
    const llm = new LLM({
      model: 'gpt-4o-mini',
      temperature,
      maxTokens: max_tokens
    });

    const response = await llm.chat({
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content
      }))
    });

    return NextResponse.json({
      success: true,
      content: response.content,
      choices: [{ message: { content: response.content } }]
    });
  } catch (error) {
    console.error('LLM API Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'LLM service unavailable',
      fallback: true
    }, { status: 500 });
  }
}
