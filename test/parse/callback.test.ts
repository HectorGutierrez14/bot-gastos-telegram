import { describe, expect, it } from "vitest";
import { parseCallback } from "../../src/parse/callback";

describe("parseCallback", () => {
  it.each([
    ["edit:12", { t: "edit", gastoId: 12 }],
    ["cancel:12", { t: "cancel", gastoId: 12 }],
    ["cat:12:15", { t: "cat", gastoId: 12, indice: 15 }],
    ["tc:12:1", { t: "tc", gastoId: 12, indice: 1 }],
    ["tc:12:x", { t: "tc", gastoId: 12, indice: "x" }],
    ["aj:7:int", { t: "aj", pagoId: 7, opcion: "int" }],
    ["aj:7:compra", { t: "aj", pagoId: 7, opcion: "compra" }],
    ["aj:7:favor", { t: "aj", pagoId: 7, opcion: "favor" }],
  ])("%s", (data, esperado) => {
    expect(parseCallback(data)).toEqual(esperado);
  });

  it.each([
    "cat:1:2:3",
    "cat:-1:2",
    "edit:abc",
    "cat:1:999",
    "aj:1:otro",
    "edit:12345678901",
    "edit:1 ",
    "EDIT:1",
    "",
    `edit:1${"0".repeat(70)}`,
  ])("%s → null", (data) => {
    expect(parseCallback(data)).toBeNull();
  });

  it("undefined → null", () => {
    expect(parseCallback(undefined)).toBeNull();
  });
});
