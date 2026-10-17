import {
  QueryClient,
  queryOptions,
  mutationOptions,
} from "@tanstack/react-query";
import {
  readHistory,
  loadProgress,
  saveAttempt,
  clearHistory,
  saveReviewReward,
  subscribeToLocalChanges,
} from "./storage";
import { emptyProgress } from "./progress";

export const localKeys = {
  history: ["local", "history"],
  progress: ["local", "progress"],
} as const;
export function createLocalQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: false,
        staleTime: 0,
        refetchOnReconnect: false,
      },
      mutations: { networkMode: "always", retry: false, gcTime: 0 },
    },
  });
}
export function subscribeToLocalQueryChanges(client: QueryClient) {
  return subscribeToLocalChanges(() => {
    void (async () => {
      // An older in-flight read must not win over the external committed change.
      await client.cancelQueries({ queryKey: ["local"] });
      await client.invalidateQueries({ queryKey: ["local"] });
    })();
  });
}
export const historyQuery = () =>
  queryOptions({ queryKey: localKeys.history, queryFn: readHistory });
export const progressQuery = () =>
  queryOptions({ queryKey: localKeys.progress, queryFn: loadProgress });
export const saveAttemptMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: saveAttempt,
    onSuccess: async (saved: Awaited<ReturnType<typeof saveAttempt>>) => {
      // Cancel older reads before publishing the committed transaction's snapshot.
      await Promise.all([
        client.cancelQueries({ queryKey: localKeys.history }),
        client.cancelQueries({ queryKey: localKeys.progress }),
      ]);
      client.setQueryData(localKeys.history, saved.history);
      client.setQueryData(localKeys.progress, saved.progress);
    },
  });
export const clearHistoryMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: clearHistory,
    onSuccess: async () => {
      await Promise.all([
        client.cancelQueries({ queryKey: localKeys.history }),
        client.cancelQueries({ queryKey: localKeys.progress }),
      ]);
      client.setQueryData(localKeys.history, []);
      client.setQueryData(localKeys.progress, emptyProgress());
    },
  });

export const reviewRewardMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: saveReviewReward,
    onSuccess: async (saved: Awaited<ReturnType<typeof saveReviewReward>>) => {
      await client.cancelQueries({ queryKey: localKeys.progress });
      client.setQueryData(localKeys.progress, saved.progress);
    },
  });
