export class MovimientoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function centavos(monto: unknown): number {
  if ((typeof monto !== 'number' && typeof monto !== 'string') ||
      !/^\d+(\.\d{1,2})?$/.test(String(monto)) ||
      !Number.isFinite(Number(monto)) || Number(monto) <= 0 || Number(monto) > 99999999.99) {
    throw new MovimientoError('Ingresa un monto positivo con un máximo de dos decimales.');
  }
  return Math.round(Number(monto) * 100);
}

export function hoyGuatemala(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function fechaMovimiento(value: unknown, now = new Date()): Date {
  if (value === undefined) return now;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) {
    throw new MovimientoError('Selecciona una fecha válida.');
  }
  const day = value.slice(0, 10);
  const calendar = new Date(`${day}T12:00:00Z`);
  const date = value.length === 10 ? calendar : new Date(value);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) {
    throw new MovimientoError('Selecciona una fecha válida.');
  }
  if ((value.length === 10 ? day : hoyGuatemala(date)) > hoyGuatemala(now)) {
    throw new MovimientoError('No puedes registrar movimientos en fechas futuras.');
  }
  return date;
}

export function comprobarSaldo(saldo: number, salida: number): void {
  if (salida > saldo) throw new MovimientoError(`Saldo insuficiente. Disponible: Q ${(saldo / 100).toFixed(2)}.`, 409);
}
