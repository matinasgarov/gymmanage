import { describe, it, expect } from "vitest";
import { getCurrentUser, requireOwner, getGymDb } from "@/lib/dal";
import { RedirectError } from "../../../test/integration/stubs/next-navigation";
import { seedGym, seedOwner, seedMember, login } from "../../../test/integration/helpers";

describe("dal — getCurrentUser (real session + DB)", () => {
  it("returns the user and gym for a valid session", async () => {
    const gym = await seedGym({ name: "Acme Fitness" });
    const owner = await seedOwner(gym.id, { name: "Aysel" });
    await login(owner);

    const user = await getCurrentUser();
    expect(user.id).toBe(owner.id);
    expect(user.role).toBe("OWNER");
    expect(user.gym.name).toBe("Acme Fitness");
  });

  it("redirects to /login when no session cookie is present", async () => {
    await expect(getCurrentUser()).rejects.toMatchObject({
      name: "RedirectError",
      url: "/login",
    });
  });

  it("redirects a deactivated user even with a valid session (live revocation)", async () => {
    const gym = await seedGym();
    const staff = await seedOwner(gym.id, { role: "STAFF", active: false });
    await login(staff);

    await expect(getCurrentUser()).rejects.toBeInstanceOf(RedirectError);
  });

  it("sends STAFF away from owner-only areas", async () => {
    const gym = await seedGym();
    const staff = await seedOwner(gym.id, { role: "STAFF" });
    await login(staff);

    await expect(requireOwner()).rejects.toMatchObject({ url: "/dashboard" });
  });
});

describe("dal/tenant — multi-tenant isolation against the real DB", () => {
  it("forGym cannot read another gym's member", async () => {
    const gymA = await seedGym({ name: "Gym A" });
    const ownerA = await seedOwner(gymA.id);
    const gymB = await seedGym({ name: "Gym B" });
    const memberB = await seedMember(gymB.id, { name: "Foreign Member" });

    await login(ownerA);
    const { db } = await getGymDb();

    // Same id, but scoped to gym A → must not surface gym B's row.
    const leaked = await db.member.findFirst({ where: { id: memberB.id } });
    expect(leaked).toBeNull();

    const all = await db.member.findMany({});
    expect(all).toHaveLength(0); // gym A has no members
  });

  it("forGym only returns rows for the acting gym", async () => {
    const gymA = await seedGym();
    const ownerA = await seedOwner(gymA.id);
    await seedMember(gymA.id, { name: "Mine" });
    const gymB = await seedGym();
    await seedMember(gymB.id, { name: "Theirs" });

    await login(ownerA);
    const { db } = await getGymDb();

    const mine = await db.member.findMany({});
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Mine");
  });
});
