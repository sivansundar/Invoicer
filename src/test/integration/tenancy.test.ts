import { describe, expect, it } from "vitest";
import { admin, uniqueEmail } from "./helpers";

describe("signup trigger", () => {
  it("creates exactly one org and one owner membership per new user", async () => {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: uniqueEmail(),
      password: "integration-test-password-1",
      email_confirm: true,
    });
    expect(error).toBeNull();
    const userId = created!.user!.id;

    const { data: memberships } = await admin
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId);

    expect(memberships).toHaveLength(1);
    expect(memberships![0].role).toBe("owner");

    const { data: org } = await admin
      .from("orgs")
      .select("id, name")
      .eq("id", memberships![0].org_id)
      .single();

    expect(org).not.toBeNull();
    expect(org!.name).toBe("My workspace");
  });

  it("cascades the membership away when the user is deleted", async () => {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: uniqueEmail(),
      password: "integration-test-password-1",
      email_confirm: true,
    });
    expect(createError).toBeNull();
    const userId = created!.user!.id;

    // Asserted before the delete, not just after. Without this the test
    // passes just as happily when the signup trigger never created a
    // membership at all — "it is gone now" is only meaningful if it was
    // there a moment ago.
    const { data: before } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId);
    expect(before).toHaveLength(1);

    // `deleteUser` reports a failure in its result rather than throwing, so
    // an unchecked call can leave the user in place and turn the assertion
    // below into a check on a delete that never happened.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    expect(deleteError).toBeNull();

    const { data: after } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId);

    expect(after).toEqual([]);
  });

  it("leaves the org behind when its only member is deleted", async () => {
    // Deliberate, and worth pinning: `org_members.user_id` cascades from
    // `auth.users`, but `orgs` does not cascade from `org_members`. Deleting
    // an account therefore orphans its org and every row hanging off it
    // rather than destroying the data. That is the right default while
    // account deletion is not a built product — the DPDP erasure path will
    // have to remove it deliberately, and it should be a decision made
    // there rather than a side effect discovered here.
    const { data: created } = await admin.auth.admin.createUser({
      email: uniqueEmail(),
      password: "integration-test-password-1",
      email_confirm: true,
    });
    const userId = created!.user!.id;

    const { data: membership } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .single();
    const orgId = membership!.org_id;

    await admin.auth.admin.deleteUser(userId);

    const { data: org } = await admin.from("orgs").select("id").eq("id", orgId).maybeSingle();

    expect(org).not.toBeNull();
  });
});
