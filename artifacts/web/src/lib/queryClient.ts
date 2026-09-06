import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: (count, error) => {
        if (error && (error as { status?: number }).status === 401) return false;
        return count < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});
