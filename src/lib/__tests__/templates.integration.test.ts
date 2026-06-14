import { describe, it, expect } from "vitest";
import { pickReminderTemplate, DEFAULT_TEMPLATES } from "@/lib/templates";

describe("templates — pickReminderTemplate", () => {
  it("uses the gym override whenever one is set, regardless of age", () => {
    expect(pickReminderTemplate(2, "Custom {memberName}")).toBe("Custom {memberName}");
    expect(pickReminderTemplate(40, "Custom {memberName}")).toBe("Custom {memberName}");
  });

  it("uses the gentle default for recent debt (<14 days)", () => {
    expect(pickReminderTemplate(5, null)).toBe(DEFAULT_TEMPLATES.reminder);
    expect(pickReminderTemplate(5, "")).toBe(DEFAULT_TEMPLATES.reminder);
  });

  it("uses the firmer default once debt is 14+ days old", () => {
    const firm = pickReminderTemplate(14, null);
    expect(firm).not.toBe(DEFAULT_TEMPLATES.reminder);
    expect(firm).toContain("{amount}");
    expect(firm).toContain("{memberName}");
  });
});
