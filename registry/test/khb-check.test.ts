import { describe, expect, it } from "vitest";
import { checkKhbHead, HEAD_BYTES } from "../src/khb-check";
import { fakeKhb } from "./helpers";

describe("checkKhbHead", () => {
  it("accepts a plausible SQLite file", () => {
    const bytes = fakeKhb(3);
    expect(checkKhbHead(bytes.slice(0, HEAD_BYTES), bytes.byteLength)).toBeNull();
  });

  it("rejects a bad magic", () => {
    const bytes = fakeKhb();
    bytes[0] = 0x00;
    expect(checkKhbHead(bytes.slice(0, HEAD_BYTES), bytes.byteLength)).toMatch(
      /magic/,
    );
  });

  it("rejects an invalid page size", () => {
    const bytes = fakeKhb();
    bytes[16] = 0x00;
    bytes[17] = 0x03; // 3 — not a power of two
    expect(checkKhbHead(bytes.slice(0, HEAD_BYTES), bytes.byteLength)).toMatch(
      /page size/,
    );
  });

  it("accepts the 65536 page-size encoding (raw value 1)", () => {
    const bytes = new Uint8Array(65536);
    bytes.set(fakeKhb().slice(0, 16));
    bytes[16] = 0x00;
    bytes[17] = 0x01;
    expect(checkKhbHead(bytes.slice(0, HEAD_BYTES), bytes.byteLength)).toBeNull();
  });

  it("rejects tiny and truncated files", () => {
    expect(checkKhbHead(new Uint8Array(8), 8)).toMatch(/too small/);
    const bytes = fakeKhb();
    expect(
      checkKhbHead(bytes.slice(0, HEAD_BYTES), bytes.byteLength - 100),
    ).toMatch(/truncated/);
  });
});
