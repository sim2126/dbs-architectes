/**
 * The one channel-access rule used by server queries and point lookups.
 *
 * Staff can enter workspace-wide public channels, non-project channels they
 * have joined, and project channels while their ProjectAssignment is live.
 * Guests can enter only through an explicit ChannelMember row. In particular,
 * a ProjectAssignment never expands guest access, and a stale ChannelMember
 * row never preserves staff access after a project assignment is removed.
 */
export { canReadChannel, type ChannelViewer, type ChannelAccessFacts } from "@/platform/authz/channel-access";
