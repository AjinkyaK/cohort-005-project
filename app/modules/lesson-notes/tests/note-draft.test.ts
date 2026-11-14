import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("cannot save an empty draft when nothing is saved yet", () => {
    expect(describeNoteDraft("", null)).toEqual({
      length: 0,
      remaining: MAX_NOTE_LENGTH,
      overLimit: false,
      status: "empty",
      canSave: false,
    });
  });

  it("treats whitespace alone as empty", () => {
    const draft = describeNoteDraft("   \n ", null);
    expect(draft.status).toBe("empty");
    expect(draft.canSave).toBe(false);
  });

  it("can save a new draft", () => {
    expect(describeNoteDraft("Generics are like parameters", null)).toEqual({
      length: 28,
      remaining: MAX_NOTE_LENGTH - 28,
      overLimit: false,
      status: "unsaved",
      canSave: true,
    });
  });

  it("is saved when the draft matches the saved Note", () => {
    const draft = describeNoteDraft("Remember tsconfig", "Remember tsconfig");
    expect(draft.status).toBe("saved");
    expect(draft.canSave).toBe(false);
  });

  it("ignores surrounding whitespace, as saving trims it", () => {
    const draft = describeNoteDraft(
      "  Remember tsconfig\n",
      "Remember tsconfig"
    );
    expect(draft.status).toBe("saved");
    expect(draft.canSave).toBe(false);
  });

  it("has unsaved changes when the draft differs from the saved Note", () => {
    const draft = describeNoteDraft(
      "Remember tsconfig strict",
      "Remember tsconfig"
    );
    expect(draft.status).toBe("unsaved");
    expect(draft.canSave).toBe(true);
  });

  it("cannot save a cleared draft over a saved Note", () => {
    const draft = describeNoteDraft("  ", "Remember tsconfig");
    expect(draft.status).toBe("unsaved");
    expect(draft.canSave).toBe(false);
  });

  it("accepts a draft of exactly the limit", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), null);
    expect(draft.remaining).toBe(0);
    expect(draft.overLimit).toBe(false);
    expect(draft.canSave).toBe(true);
  });

  it("cannot save a draft over the limit", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 3), null);
    expect(draft).toEqual({
      length: MAX_NOTE_LENGTH + 3,
      remaining: -3,
      overLimit: true,
      status: "over-limit",
      canSave: false,
    });
  });

  it("counts the trimmed length, as that is what is saved", () => {
    const draft = describeNoteDraft(`  ${"a".repeat(MAX_NOTE_LENGTH)}  `, null);
    expect(draft.length).toBe(MAX_NOTE_LENGTH);
    expect(draft.overLimit).toBe(false);
  });
});
