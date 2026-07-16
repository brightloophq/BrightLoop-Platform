import { describe, it, expect } from "vitest";
import { pageWindow } from "./pageWindow";

describe("pageWindow()", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses the tail when the current page is near the start", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "…", 10]);
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, "…", 10]);
  });

  it("collapses the head when the current page is near the end", () => {
    expect(pageWindow(10, 10)).toEqual([1, "…", 9, 10]);
    expect(pageWindow(9, 10)).toEqual([1, "…", 8, 9, 10]);
  });

  it("collapses both sides in the middle", () => {
    expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });

  it("never duplicates the first or last page", () => {
    for (let pages = 1; pages <= 20; pages += 1) {
      for (let current = 1; current <= pages; current += 1) {
        const win = pageWindow(current, pages);
        const numbers = win.filter((x): x is number => typeof x === "number");
        expect(new Set(numbers).size, `dup at page ${current}/${pages}`).toBe(numbers.length);
        expect(numbers[0]).toBe(1);
        expect(numbers[numbers.length - 1]).toBe(pages);
      }
    }
  });

  it("always includes the current page", () => {
    for (let pages = 1; pages <= 20; pages += 1) {
      for (let current = 1; current <= pages; current += 1) {
        expect(pageWindow(current, pages), `missing ${current}/${pages}`).toContain(current);
      }
    }
  });

  it("keeps pages in ascending order", () => {
    const numbers = pageWindow(5, 10).filter((x): x is number => typeof x === "number");
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });
});
