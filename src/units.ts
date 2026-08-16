/** 支持的量纲与到基准单位的换算系数 */
const FACTORS: Record<string, Record<string, number>> = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254 },
  mass: { g: 1, kg: 1000, mg: 0.001, lb: 453.59237, oz: 28.349523125 },
  time: { s: 1, min: 60, h: 3600, d: 86400, ms: 0.001 },
};

export interface ConvertResult {
  value: number;
  from: string;
  to: string;
  dimension: string;
}

/** 找出某个单位属于哪个量纲，找不到返回 null。 */
export function dimensionOf(unit: string): string | null {
  for (const [dim, table] of Object.entries(FACTORS)) {
    if (unit in table) return dim;
  }
  return null;
}

/**
 * 单位换算。温度不走系数表，单独处理。
 * @throws 单位未知或两个单位不同量纲时抛错
 */
export function convert(value: number, from: string, to: string): ConvertResult {
  if (!Number.isFinite(value)) throw new Error(`value 必须是有限数字: ${value}`);

  const temp = convertTemperature(value, from, to);
  if (temp !== null) return { value: temp, from, to, dimension: 'temperature' };

  const dFrom = dimensionOf(from);
  const dTo = dimensionOf(to);
  if (!dFrom) throw new Error(`未知单位: ${from}`);
  if (!dTo) throw new Error(`未知单位: ${to}`);
  if (dFrom !== dTo) throw new Error(`量纲不匹配: ${from} 是 ${dFrom}，${to} 是 ${dTo}`);

  const table = FACTORS[dFrom];
  return { value: (value * table[from]) / table[to], from, to, dimension: dFrom };
}

/** 温度换算，非温度单位返回 null。 */
function convertTemperature(value: number, from: string, to: string): number | null {
  const TEMPS = ['C', 'F', 'K'];
  if (!TEMPS.includes(from) || !TEMPS.includes(to)) return null;
  const celsius = from === 'C' ? value : from === 'F' ? (value - 32) / 1.8 : value - 273.15;
  return to === 'C' ? celsius : to === 'F' ? celsius * 1.8 + 32 : celsius + 273.15;
}

/** 列出所有支持的单位。 */
export function supportedUnits(): string[] {
  return [...Object.values(FACTORS).flatMap((t) => Object.keys(t)), 'C', 'F', 'K'];
}
