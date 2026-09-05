export type ChannelViewer = {
  userId: string;
  isExternal: boolean;
};

export type ChannelAccessFacts = {
  type: string;
  projectId: string | null;
  isMember: boolean;
  isProjectAssignee: boolean;
};

/** Current channel membership: stale staff memberships never preserve project access. */
export function canReadChannel(viewer: ChannelViewer, channel: ChannelAccessFacts): boolean {
  if (viewer.isExternal) return channel.isMember;
  if (channel.projectId !== null) return channel.isProjectAssignee;
  if (channel.type === "public") return true;
  return channel.isMember;
}
