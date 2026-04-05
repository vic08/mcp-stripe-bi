import Stripe from 'stripe';
import type { ToolResult, McpError } from '../types/index.js';

export function createErrorResult(code: string, message: string, retryAfter?: number): ToolResult {
  const error: McpError = { error: code, message };
  if (retryAfter !== undefined) error.retryAfter = retryAfter;
  return {
    content: [{ type: 'text', text: JSON.stringify(error) }],
    isError: true,
  };
}

export function createSuccessResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function handleToolError(error: unknown): ToolResult {
  if (error instanceof Stripe.errors.StripeError) {
    switch (error.statusCode) {
      case 401:
        return createErrorResult(
          'INVALID_API_KEY',
          'Invalid Stripe API key. Check your STRIPE_API_KEY environment variable.',
        );
      case 403:
        return createErrorResult(
          'PERMISSION_DENIED',
          'API key does not have permission for this operation. Use a key with appropriate read permissions.',
        );
      case 404:
        return createErrorResult('NOT_FOUND', error.message);
      case 429:
        return createErrorResult(
          'RATE_LIMIT_EXCEEDED',
          'Stripe API rate limit reached. Try again in a few seconds.',
          5,
        );
      default:
        return createErrorResult('STRIPE_API_ERROR', error.message);
    }
  }

  if (error instanceof Error) {
    return createErrorResult('INTERNAL_ERROR', error.message);
  }

  return createErrorResult('INTERNAL_ERROR', 'An unexpected error occurred');
}
