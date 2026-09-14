import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Gastos } from './gastos';
import { AuthService } from '../../services/auth';
import { MovimientoApi, MovimientosService } from '../../services/movimientos';

describe('Gastos', () => {
  const movimientos = new BehaviorSubject<MovimientoApi[]>([]);
  const servicio = {
    movimientos$: movimientos.asObservable(),
    obtener: vi.fn(() => of([])),
    crear: vi.fn(() => of({})),
    eliminar: vi.fn(() => of(undefined))
  };

  beforeEach(() => {
    vi.clearAllMocks();
    movimientos.next([]);
    TestBed.configureTestingModule({
      imports: [Gastos],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { getCurrentUser: () => ({ username: 'Ana' }), logout: vi.fn() } },
        { provide: MovimientosService, useValue: servicio }
      ]
    });
  });

  it('separa egresos y calcula el saldo con ingresos y salidas', () => {
    const fixture = TestBed.createComponent(Gastos);
    fixture.detectChanges();
    movimientos.next([
      { id: 1, fecha: '2026-09-08', descripcion: 'Sueldo', categoria: 'Salario', tipo: 'ingreso', monto: '1000' },
      { id: 2, fecha: '2026-09-08', descripcion: 'Mercado', categoria: 'Comida', tipo: 'egreso', monto: '150' },
      { id: 3, fecha: '2026-09-08', descripcion: 'Luz', categoria: 'Pago', tipo: 'egreso', monto: 50 }
    ]);
    const component = fixture.componentInstance;
    expect(component.movimientos.map(m => m.id)).toEqual([2, 3]);
    expect(component.saldoDisponible).toBe(800);
    expect(component.saldoPorPagar).toBe(150);
    expect(component.transferencias.length).toBe(1);
    component.searchText = ' mercado ';
    component.categoryFilter = 'Comida';
    expect(component.filteredMovimientos().map(m => m.id)).toEqual([2]);
  });

  it('guarda los nuevos gastos como egresos', () => {
    const component = TestBed.createComponent(Gastos).componentInstance;
    component.ngOnInit();
    movimientos.next([{ id: 1, fecha: '2026-01-10', descripcion: 'Sueldo', categoria: 'Salario', tipo: 'ingreso', monto: 1000 }]);
    component.newExpense = { descripcion: ' Mercado ', categoria: ' Comida ', monto: 25 };
    component.submitExpense();
    expect(servicio.crear).toHaveBeenCalledWith(expect.objectContaining({
      descripcion: 'Mercado', categoria: 'Comida', monto: 25, tipo: 'egreso'
    }));
    expect(component.saving).toBe(false);
  });

  it('conserva el formulario cuando falla el guardado', () => {
    servicio.crear.mockReturnValueOnce(throwError(() => new Error('Sin conexión')));
    const component = TestBed.createComponent(Gastos).componentInstance;
    component.ngOnInit();
    movimientos.next([{ id: 1, fecha: '2026-01-10', descripcion: 'Sueldo', categoria: 'Salario', tipo: 'ingreso', monto: 1000 }]);
    component.showExpenseModal = true;
    component.newExpense = { descripcion: 'Mercado', categoria: 'Comida', monto: 25 };
    component.submitExpense();
    expect(component.showExpenseModal).toBe(true);
    expect(component.newExpense.monto).toBe(25);
    expect(component.errorMessage).toBeTruthy();
    expect(component.saving).toBe(false);
  });

  it('bloquea gastos y transferencias que exceden el dinero disponible', () => {
    const component = TestBed.createComponent(Gastos).componentInstance;
    component.ngOnInit();
    movimientos.next([{ id: 1, fecha: '2026-01-10', descripcion: 'Sueldo', categoria: 'Salario', tipo: 'ingreso', monto: 1000 }]);
    component.newExpense = { descripcion: 'Compra', categoria: 'Otros', monto: 2000 };
    component.submitExpense();
    expect(servicio.crear).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('Saldo insuficiente');
    component.newTransfer = { nombre: 'Pago', nota: '', monto: 2000 };
    component.submitTransfer();
    expect(servicio.crear).not.toHaveBeenCalled();
  });
});
