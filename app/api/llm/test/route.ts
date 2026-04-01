import { ChatOpenAI } from '@langchain/openai';
import { NextRequest, NextResponse } from 'next/server';

type RequestBody = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error';
}

export async function POST(request: NextRequest) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';

  if (!apiKey) {
    return NextResponse.json({ error: 'LLM API key is required' }, { status: 400 });
  }

  if (!model) {
    return NextResponse.json({ error: 'LLM model name is required' }, { status: 400 });
  }

  if (baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      return NextResponse.json({ error: 'LLM base URL must be a valid absolute URL' }, { status: 400 });
    }
  }

  try {
    const modelClient = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      maxTokens: 24,
      configuration: baseUrl ? { baseURL: baseUrl } : undefined,
    });

    await modelClient.invoke('Reply with exactly the single word: pong');

    return NextResponse.json({
      ok: true,
      provider: 'openai-compatible' as const,
      model,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'LLM connection test failed',
        detail: getErrorMessage(error),
      },
      { status: 502 },
    );
  }
}