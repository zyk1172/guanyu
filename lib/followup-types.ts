export type FollowupSource = { title: string; url: string; kind: 'page' | 'snippet'; publishedAt?: string | null };
export type FollowupResearch = {
  status: 'searched' | 'empty' | 'unavailable' | 'disabled' | 'not_needed';
  queries: string[]; sources: FollowupSource[]; searchedAt?: string;
  disabledReason?: 'user_disabled' | 'model_offline' | 'deployment_disabled';
};
