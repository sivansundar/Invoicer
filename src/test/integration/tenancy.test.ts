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
    const { data: created } = await admin.auth.admin.createUser({
      email: uniqueEmail(),
      password: "integration-test-password-1",
      email_confirm: true,
    });
    const userId = created!.user!.id;

    await admin.auth.admin.deleteUser(userId);

    const { data: memberships } = await admin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId);

    expect(memberships).toEqual([]);
  });
});
