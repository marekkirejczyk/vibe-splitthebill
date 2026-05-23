import { describe, expect, test } from "vitest";
import { nextAssignee } from "./store";

describe("nextAssignee state machine", () => {
  test("unassigned + left → you", () => {
    expect(nextAssignee(null, "left")).toBe("you");
  });
  test("unassigned + right → them", () => {
    expect(nextAssignee(null, "right")).toBe("them");
  });

  test("you + left → unassigned (re-swipe same direction)", () => {
    expect(nextAssignee("you", "left")).toBeNull();
  });
  test("you + right → them (switch sides)", () => {
    expect(nextAssignee("you", "right")).toBe("them");
  });

  test("them + right → unassigned (re-swipe same direction)", () => {
    expect(nextAssignee("them", "right")).toBeNull();
  });
  test("them + left → you (switch sides)", () => {
    expect(nextAssignee("them", "left")).toBe("you");
  });

  test("two left-swipes on unassigned returns it to unassigned", () => {
    const after1 = nextAssignee(null, "left");
    const after2 = nextAssignee(after1, "left");
    expect(after2).toBeNull();
  });

  test("right then left from unassigned ends at you (not unassigned)", () => {
    const a = nextAssignee(null, "right"); // them
    const b = nextAssignee(a, "left");      // you (switch sides, not unassign)
    expect(b).toBe("you");
  });
});
