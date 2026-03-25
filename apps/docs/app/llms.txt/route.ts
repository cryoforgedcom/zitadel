import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';

// Cached forever — regenerated on each deployment
export const revalidate = false;

export function GET() {
  return new Response(llms(source).index());
}
