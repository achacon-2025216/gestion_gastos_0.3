import {
  Component,
  ChangeDetectorRef,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService } from '../../services/auth';
import {
  MovimientoApi,
  MovimientosService
} from '../../services/movimientos';

type CategoriaGasto = string;

interface Movimiento {
  id: number;
  fecha: string;
  descripcion: string;
  categoria: CategoriaGasto;
  monto: number;
}

interface Transferencia {
  id: number;
  nombre: string;
  fecha: string;
  monto: number;
}

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl: './gastos.html',
  styleUrl: './gastos.css',
})
export class Gastos implements OnInit {

  private authService = inject(AuthService);
  private movimientosService = inject(MovimientosService);
  private destroyRef = inject(DestroyRef);
  private changeDetector = inject(ChangeDetectorRef);

  username =
    this.authService.getCurrentUser()?.username ?? 'Usuario';

  errorMessage = '';
  saving = false;

  searchText = '';
  categoryFilter = '';

  showExpenseModal = false;
  showTransferModal = false;

  transferType: 'Transferencia' | 'Pago' = 'Transferencia';

  /**
   * SOLO EGRESOS
   */
  movimientos: Movimiento[] = [];

  /**
   * Todos los movimientos obtenidos de la API.
   */
  private todosLosMovimientos: MovimientoApi[] = [];

  transferencias: Transferencia[] = [];

  newExpense: {
    descripcion: string;
    categoria: CategoriaGasto;
    monto: number | null;
  } = {
    descripcion: '',
    categoria: '',
    monto: null
  };

  newTransfer: {
    nombre: string;
    monto: number | null;
    nota: string;
  } = {
    nombre: '',
    monto: null,
    nota: ''
  };

  ngOnInit(): void {
    this.movimientosService.movimientos$
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(
        movimientos =>
          this.mostrarMovimientos(movimientos)
      );

    this.cargarMovimientos();
  }

  /**
   * Carga los movimientos y deja SOLO los gastos.
   */
  private cargarMovimientos(): void {

    this.movimientosService
      .obtener()
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({

      error: error => {
        this.saving = false;
        this.errorMessage = 'No se pudo completar la operación. Inténtalo de nuevo.';
        this.changeDetector.markForCheck();
        console.error(
          'ERROR AL CARGAR EGRESOS:',
          error
        );
      }
    });
  }

  /**
   * Actualiza la pantalla desde el estado compartido y conserva
   * solamente los movimientos marcados como gasto.
   */
  private mostrarMovimientos(
    movimientos: MovimientoApi[]
  ): void {

    this.todosLosMovimientos = movimientos;

    this.transferencias = movimientos
      .filter(movimiento => this.esTransferencia(movimiento))
      .map(movimiento => ({
        id: movimiento.id,
        nombre: movimiento.descripcion,
        fecha: new Date(movimiento.fecha).toLocaleDateString('es-GT'),
        monto: Number(movimiento.monto)
      }));

    this.movimientos = movimientos
      .filter(
        movimiento => movimiento.tipo === 'egreso'
      )
      .map(
        movimiento => this.normalizarGasto(movimiento)
      );

    this.changeDetector.markForCheck();
  }

  /**
   * Convierte el movimiento de la API
   * al formato que utiliza esta vista.
   */
  private normalizarGasto(
    movimiento: MovimientoApi
  ): Movimiento {

    return {
      id: movimiento.id,

      fecha: new Date(
        movimiento.fecha
      ).toLocaleDateString('es-GT'),

      descripcion: movimiento.descripcion,

      categoria: movimiento.categoria,

      monto: Number(movimiento.monto)
    };
  }

  /**
   * Total de gastos.
   */
  get totalGasto(): number {

    return this.movimientos.reduce(
      (total, movimiento) =>
        total + movimiento.monto,
      0
    );
  }

  /** Dinero disponible después de gastos, pagos y transferencias. */
  get saldoDisponible(): number {

    return this.todosLosMovimientos.reduce(
      (saldo, movimiento) => saldo + (movimiento.tipo === 'ingreso' ? 1 : -1) * Number(movimiento.monto), 0
    );
  }

  /** Egresos pendientes; no incluye pagos ni transferencias ya realizados. */
  get saldoPorPagar(): number {

    return this.todosLosMovimientos
      .filter(
        movimiento =>
          movimiento.tipo === 'egreso' &&
          !this.esTransferencia(movimiento)
      )
      .reduce(
        (total, movimiento) =>
          total + Number(movimiento.monto),
        0
      );
  }

  /**
   * Distribución de gastos por categoria.
   */
  get categorias(): Array<{
    nombre: CategoriaGasto;
    porcentaje: number;
    color: string;
  }> {

    const total = this.totalGasto;

    const categorias = this.categoriasDisponibles;
    const colores = [
      '#1f9d66', '#2a6f8f', '#f2b84b', '#8b5cf6',
      '#f97316', '#0f4c42', '#ef4444', '#64748b'
    ];

    return categorias.map((nombre, index) => {

      const monto = this.movimientos
        .filter(
          movimiento =>
            movimiento.categoria === nombre
        )
        .reduce(
          (subtotal, movimiento) =>
            subtotal + movimiento.monto,
          0
        );

      return {
        nombre,

        porcentaje: total
          ? Math.round(
              (monto / total) * 100
            )
          : 0,

        color: colores[index % colores.length]
      };
    });
  }

  get categoriasDisponibles(): string[] {

    return Array.from(
      new Set(
        this.movimientos.map(
          movimiento => movimiento.categoria
        )
      )
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }

  /**
   * Filtro de búsqueda y categoria.
   */
  filteredMovimientos(): Movimiento[] {

    const termino =
      this.searchText
        .trim()
        .toLowerCase();

    return this.movimientos.filter(
      movimiento =>

        (
          !termino ||
          movimiento.descripcion
            .toLowerCase()
            .includes(termino)
        )

        &&

        (
          !this.categoryFilter ||
          movimiento.categoria === this.categoryFilter
        )
    );
  }

  private esTransferencia(movimiento: MovimientoApi): boolean {

    const categoria = movimiento.categoria
      .trim()
      .toLowerCase();

    return movimiento.tipo === 'egreso' && (categoria === 'transferencia' || categoria === 'pago');
  }

  tagClass(
    categoria: CategoriaGasto
  ): string {

    const clase = categoria
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return ['comida', 'renta', 'servicios', 'transporte', 'otros'].includes(clase)
      ? `tag-${clase}`
      : 'tag-otros';
  }

  openExpenseModal(): void {
    this.showExpenseModal = true;
  }

  cerrarSesion(): void {
    this.authService.logout();
  }

  closeExpenseModal(): void {

    this.showExpenseModal = false;

    this.newExpense = {
      descripcion: '',
      categoria: '',
      monto: null
    };
  }

  /**
   * GUARDA UN EGRESO.
   */
  submitExpense(): void {
    if (this.saving) return;
    this.errorMessage = '';

    const monto = this.newExpense.monto;

    if (
      !this.newExpense.descripcion.trim() ||
      !this.newExpense.categoria.trim() ||
      !monto ||
      !Number.isFinite(Number(monto)) ||
      monto <= 0
    ) {
      return;
    }

    const nuevoGasto = {
      fecha: new Date().toISOString(),

      descripcion:
        this.newExpense.descripcion.trim(),

      categoria:
        this.newExpense.categoria.trim(),

      /**
       * MUY IMPORTANTE:
       * este movimiento es un EGRESO.
       */
      tipo: 'egreso' as const,

      monto: Number(monto)
    };

    console.log(
      'ENVIANDO EGRESO:',
      nuevoGasto
    );

    this.saving = true;
    this.movimientosService
      .crear(nuevoGasto)
      .subscribe({

        next: movimiento => {

          console.log(
            'EGRESO GUARDADO:',
            movimiento
          );

          // El servicio publica el nuevo movimiento en movimientos$.
          this.saving = false;
          this.closeExpenseModal();
          this.changeDetector.markForCheck();
        },

        error: error => {
        this.saving = false;
        this.errorMessage = 'No se pudo completar la operación. Inténtalo de nuevo.';
        this.changeDetector.markForCheck();

          console.error(
            'ERROR AL GUARDAR EGRESO:',
            error
          );
        }
      });
  }

  /**
   * Elimina un gasto.
   */
  eliminarMovimiento(
    movimiento: Movimiento
  ): void {

    this.movimientosService
      .eliminar(movimiento.id)
      .subscribe({

        // El servicio actualiza movimientos$ al completar la eliminación.
        next: () => {},

        error: error => {
        this.saving = false;
        this.errorMessage = 'No se pudo completar la operación. Inténtalo de nuevo.';
        this.changeDetector.markForCheck();

          console.error(
            'ERROR AL ELIMINAR EGRESO:',
            error
          );
        }
      });
  }

  openTransferModal(): void {
    this.showTransferModal = true;
  }

  closeTransferModal(): void {

    this.showTransferModal = false;

    this.newTransfer = {
      nombre: '',
      monto: null,
      nota: ''
    };
  }

  setTransferType(
    tipo: 'Transferencia' | 'Pago'
  ): void {

    this.transferType = tipo;
  }

  submitTransfer(): void {
    if (this.saving) return;
    this.errorMessage = '';

    const monto =
      this.newTransfer.monto;

    if (
      !this.newTransfer.nombre.trim() ||
      !monto ||
      !Number.isFinite(Number(monto)) ||
      monto <= 0
    ) {
      return;
    }

    const descripcion = this.newTransfer.nota.trim()
      ? `${this.newTransfer.nombre.trim()} - ${this.newTransfer.nota.trim()}`
      : this.newTransfer.nombre.trim();

    this.saving = true;
    this.movimientosService
      .crear({
        fecha: new Date().toISOString(),
        descripcion,
        categoria: this.transferType,
        tipo: 'egreso',
        monto: Number(monto)
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.closeTransferModal();
          this.changeDetector.markForCheck();
        },
        error: error => {
        this.saving = false;
        this.errorMessage = 'No se pudo completar la operación. Inténtalo de nuevo.';
        this.changeDetector.markForCheck();
          console.error('ERROR AL GUARDAR TRANSFERENCIA:', error);
        }
      });
  }
}
