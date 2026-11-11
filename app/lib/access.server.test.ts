import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { requirePlatformAdmin } from "./access.server";

const holder = vi.hoisted(() => ({
  db: undefined as unknown as ReturnType<typeof createTestDb>,
}));

vi.mock("~/db", () => ({
  get db() {
    return holder.db;
  },
}));

let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  holder.db = createTestDb();
  base = seedBaseData(holder.db);
});

async function requestAs(userId: number | null) {
  if (userId === null) return new Request("http://localhost/admin");
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  const cookie = setCookie.split(";")[0];
  return new Request("http://localhost/admin", { headers: { Cookie: cookie } });
}

async function statusThrownBy(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "init" in error &&
      typeof error.init === "object" &&
      error.init !== null &&
      "status" in error.init
    ) {
      return error.init.status;
    }
    throw error;
  }
  return "did not throw";
}

describe("requirePlatformAdmin", () => {
  it("rejects a signed-out visitor with 401", async () => {
    expect(await statusThrownBy(requirePlatformAdmin(await requestAs(null)))).toBe(
      401
    );
  });

  it("rejects a Student or an Instructor with 403", async () => {
    for (const user of [base.user, base.instructor]) {
      expect(
        await statusThrownBy(requirePlatformAdmin(await requestAs(user.id)))
      ).toBe(403);
    }
  });

  it("rejects a Team Admin with 403", async () => {
    const team = holder.db.insert(schema.teams).values({}).returning().get();
    holder.db
      .insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: base.user.id,
        role: schema.TeamMemberRole.Admin,
      })
      .run();

    expect(
      await statusThrownBy(requirePlatformAdmin(await requestAs(base.user.id)))
    ).toBe(403);
  });

  it("lets a Platform Admin through and returns them", async () => {
    const admin = holder.db
      .insert(schema.users)
      .values({
        name: "Ada Admin",
        email: "ada@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();

    const result = await requirePlatformAdmin(await requestAs(admin.id));

    expect(result.userId).toBe(admin.id);
    expect(result.user.name).toBe("Ada Admin");
  });

  it("rejects a session whose user no longer exists with 403", async () => {
    expect(await statusThrownBy(requirePlatformAdmin(await requestAs(9999)))).toBe(
      403
    );
  });
});
