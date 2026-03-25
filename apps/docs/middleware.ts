import { NextRequest, NextResponse } from 'next/server';

/**
 * Accept header negotiation for AI agents.
 * When an AI agent sends Accept: text/markdown, automatically
 * serve the raw markdown content instead of the HTML page.
 */
function isMarkdownPreferred(request: NextRequest): boolean {
  const accept = request.headers.get('accept') ?? '';
  // Check if the client explicitly prefers markdown over HTML
  return accept.includes('text/markdown') && !accept.includes('text/html');
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to docs pages, not to API routes or static files
  if (
    pathname.startsWith('/llms') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  if (isMarkdownPreferred(request)) {
    // Rewrite to the llms.mdx handler to serve markdown content
    const mdxPath = `/llms.mdx${pathname}`;
    return NextResponse.rewrite(new URL(mdxPath, request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all docs pages but exclude static files and API routes
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
