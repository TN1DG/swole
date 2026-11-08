// The presence room for a pair of friends. Sorted so both sides derive the same
// id. Plain data with no Convex functions, so the client can import it too.
export function chatRoomId(a: string, b: string): string {
  return [a, b].sort().join(':')
}

// The other member of a room, or null if `userId` isn't one of its two members
// (including a malformed id).
export function otherRoomMember(roomId: string, userId: string): string | null {
  const members = roomId.split(':')
  if (members.length !== 2 || chatRoomId(members[0]!, members[1]!) !== roomId) return null
  if (members[0] === members[1]) return null
  if (members[0] === userId) return members[1]!
  if (members[1] === userId) return members[0]!
  return null
}

// The presence room for a clan's group chat. Prefixed so it can never parse as
// a friend room: otherRoomMember needs exactly two ':'-separated ids and the
// prefix makes three parts with a non-id first part.
const CLAN_ROOM_PREFIX = 'clan:'

export function clanRoomId(clanId: string): string {
  return `${CLAN_ROOM_PREFIX}${clanId}`
}

/** The clan a room belongs to, or null if it isn't a clan room. */
export function clanIdOfRoom(roomId: string): string | null {
  if (!roomId.startsWith(CLAN_ROOM_PREFIX)) return null
  const id = roomId.slice(CLAN_ROOM_PREFIX.length)
  return id && !id.includes(':') ? id : null
}
