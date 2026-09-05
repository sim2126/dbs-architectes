import assert from "node:assert/strict";
import test from "node:test";
import {
  categoryOf,
  excerpt,
  isNotificationType,
  mentionedUserIds,
  NOTIFICATION_TYPES,
  notificationInvalidation,
  resolveRecipients,
  toNotificationDTO,
} from "./types";

test("every type lands in exactly one tab", () => {
  for (const type of NOTIFICATION_TYPES) {
    assert.ok(["mentions", "updates"].includes(categoryOf(type)), type);
  }
  assert.equal(categoryOf("mentioned"), "mentions");
  assert.equal(categoryOf("thread_reply"), "mentions");
  assert.equal(categoryOf("direct_message"), "mentions");
  assert.equal(categoryOf("status_posted"), "updates");
  assert.equal(categoryOf("digest"), "updates");
});

test("isNotificationType rejects strings outside the vocabulary", () => {
  assert.equal(isNotificationType("mentioned"), true);
  assert.equal(isNotificationType("shouted"), false);
  assert.equal(isNotificationType(42), false);
});

test("resolveRecipients drops the actor, muted users and repeats", () => {
  const ids = resolveRecipients(
    ["u1", "u2", "u1", "actor", "muted", ""],
    "actor",
    new Set(["muted"]),
  );
  assert.deepEqual(ids, ["u1", "u2"]);
});

test("resolveRecipients keeps everyone when the cause is the system", () => {
  assert.deepEqual(resolveRecipients(["u1", "u2"], null, new Set()), ["u1", "u2"]);
});

test("mentionedUserIds matches @Name case-insensitively and once", () => {
  const people = [
    { id: "a", name: "Anna Rossi" },
    { id: "b", name: "Bruno" },
    { id: "c", name: null },
    { id: "d", name: "   " },
  ];
  assert.deepEqual(
    mentionedUserIds("ping @anna rossi and @Bruno, again @BRUNO", people),
    ["a", "b"],
  );
  assert.deepEqual(mentionedUserIds("no handles here", people), []);
  assert.deepEqual(mentionedUserIds("@Annabelle is not Anna", people), []);
});

test("mentions require name boundaries and do not match email addresses", () => {
  const people = [
    { id: "ann", name: "Ann" }, { id: "anna", name: "Anna" },
    { id: "anne", name: "Anne-Marie" }, { id: "lea", name: "Léa" },
    { id: "regexp", name: "A. (Team)" },
  ];
  assert.deepEqual(mentionedUserIds("@Anna please review", people), ["anna"]);
  assert.deepEqual(mentionedUserIds("name@Ann.example is an email; @Ann_2 is another handle", people), []);
  assert.deepEqual(mentionedUserIds("(@Anne-Marie), @LÉA! @A. (Team)", people), ["anne", "lea", "regexp"]);
  const fullNames = [{ id: "anna", name: "Anna" }, { id: "anna-rossi", name: "Anna Rossi" }];
  assert.deepEqual(mentionedUserIds("@Anna Rossi please review", fullNames), ["anna-rossi"]);
  assert.deepEqual(mentionedUserIds("@Anna, @Anna Rossi", fullNames), ["anna", "anna-rossi"]);
  assert.deepEqual(mentionedUserIds("@Anna", [...fullNames, { id: "other-anna", name: "Anna" }]), []);
});

test("notification invalidations expose only an opaque identifier", () => {
  assert.deepEqual(notificationInvalidation("n1"), { id: "n1" });
});

test("excerpt collapses whitespace and cuts with an ellipsis", () => {
  assert.equal(excerpt("  two\n lines  here "), "two lines here");
  assert.equal(excerpt(""), null);
  assert.equal(excerpt(null), null);
  const long = "x".repeat(200);
  const cut = excerpt(long, 50);
  assert.equal(cut?.length, 50);
  assert.ok(cut?.endsWith("…"));
});

test("toNotificationDTO serialises dates and derives the category", () => {
  const dto = toNotificationDTO(
    {
      id: "n1",
      type: "thread_reply",
      title: "Anna replied",
      body: null,
      href: "/dashboard/chat?channel=c1",
      readAt: null,
      createdAt: new Date("2026-09-04T10:00:00.000Z"),
    },
    { projectCode: "SIO-014", actor: { name: "Anna Rossi", initials: "AR" } },
  );
  assert.equal(dto.category, "mentions");
  assert.equal(dto.createdAt, "2026-09-04T10:00:00.000Z");
  assert.equal(dto.readAt, null);
  assert.equal(dto.projectCode, "SIO-014");
  assert.equal(dto.actor?.initials, "AR");
});

test("toNotificationDTO files an unknown legacy type under updates", () => {
  const dto = toNotificationDTO({
    id: "n2",
    type: "something_old",
    title: "t",
    body: null,
    href: null,
    readAt: new Date("2026-09-04T11:00:00.000Z"),
    createdAt: new Date("2026-09-04T10:00:00.000Z"),
  });
  assert.equal(dto.category, "updates");
  assert.equal(dto.readAt, "2026-09-04T11:00:00.000Z");
});
