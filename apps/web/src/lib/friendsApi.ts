import type {
  DirectMessageView,
  FriendState,
  FriendsOverview,
  PersonView,
  ProfileView,
} from '@pogo/shared';
import { request } from './session';

/** REST calls of the friends system (all with the player's token; registered players only). */
export const friendsApi = (token: string) => ({
  overview: () => request<FriendsOverview>('GET', '/api/friends', token),
  requestFriend: (target: { userId: string } | { code: string }) =>
    request<{ state: FriendState }>('POST', '/api/friends/request', token, target),
  accept: (id: string) =>
    request<{ state: FriendState }>('POST', `/api/friends/${id}/accept`, token),
  decline: (id: string) =>
    request<{ state: FriendState }>('POST', `/api/friends/${id}/decline`, token),
  remove: (id: string) => request<{ state: FriendState }>('DELETE', `/api/friends/${id}`, token),
  newCode: () => request<{ code: string }>('POST', '/api/friends/code/regenerate', token),
  search: (q: string) =>
    request<{ users: (PersonView & { state: FriendState })[] }>(
      'GET',
      `/api/users/search?q=${encodeURIComponent(q)}`,
      token,
    ),
  profile: (id: string) => request<ProfileView>('GET', `/api/users/${id}/profile`, token),
  block: (id: string) => request<unknown>('POST', `/api/users/${id}/block`, token),
  unblock: (id: string) => request<unknown>('POST', `/api/users/${id}/unblock`, token),
  mute: (id: string) => request<unknown>('POST', `/api/users/${id}/mute`, token),
  unmute: (id: string) => request<unknown>('POST', `/api/users/${id}/unmute`, token),
  messages: (id: string, before?: number) =>
    request<{ messages: DirectMessageView[] }>(
      'GET',
      `/api/messages/${id}${before ? `?before=${before}` : ''}`,
      token,
    ),
  send: (id: string, text: string) =>
    request<{ message: DirectMessageView }>('POST', `/api/messages/${id}`, token, { text }),
  read: (id: string) => request<unknown>('POST', `/api/messages/${id}/read`, token),
  invite: (id: string, roomCode: string) =>
    request<unknown>('POST', `/api/friends/${id}/invite`, token, { roomCode }),
});

export type FriendsApi = ReturnType<typeof friendsApi>;
