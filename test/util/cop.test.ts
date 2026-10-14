import { describe, expect, it } from "vitest";
import { formatCOP, formatVariacion } from "../../src/util/cop";

describe("formatCOP", () => {
  it("usa punto de miles y signo $", () => {
    expect(formatCOP(1234567)).toBe("$1.234.567");
    expect(formatCOP(35000)).toBe("$35.000");
    expect(formatCOP(500)).toBe("$500");
    expect(formatCOP(0)).toBe("$0");
    expect(formatCOP(-40000)).toBe("-$40.000");
  });
});

describe("formatVariacion", () => {
  it("muestra subida y bajada con porcentaje redondeado", () => {
    expect(formatVariacion(920000, 800000)).toBe("▲ +$120.000 (+15%)");
    expect(formatVariacion(460000, 500000)).toBe("▼ -$40.000 (-8%)");
  });
  it("omite el porcentaje si el anterior es 0", () => {
    expect(formatVariacion(50000, 0)).toBe("▲ +$50.000");
  });
  it("muestra igualdad", () => {
    expect(formatVariacion(1000, 1000)).toBe("= $0 (0%)");
  });
});
