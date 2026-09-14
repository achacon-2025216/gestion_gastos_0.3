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

type FuenteIngreso = string;

interface Movimiento {
  id: number;
  fecha: string;
  descripcion: string;
  fuente: FuenteIngreso;
  monto: number;
}

interface Transferencia {
  id: number;
  nombre: string;
  fecha: string;
  monto: number;
}

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl: './ingresos.html',
  styleUrl: './ingresos.css',
})
export class Ingresos implements OnInit {

  private authService = inject(AuthService);
  private movimientosService = inject(MovimientosService);
  private destroyRef = inject(DestroyRef);
  private changeDetector = inject(ChangeDetectorRef);

  username =
    this.authService.getCurrentUser()?.username ?? 'Usuario';

  successMessage = '';
  private noticeTimer?: ReturnType<typeof setTimeout>;

  private mostrarExito(message: string): void {
    this.errorMessage = '';
    this.successMessage = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.successMessage = '';
      this.changeDetector.markForCheck();
    }, 3000);
    this.changeDetector.markForCheck();
  }

  errores: Record<string, string> = {};
  errorMessage = '';
  saving = false;

  searchText = '';
  sourceFilter = '';

  showIncomeModal = false;
  showTransferModal = false;

  transferType: 'Transferencia' | 'Pago' = 'Transferencia';

  /**
   * SOLO INGRESOS
   */
  movimientos: Movimiento[] = [];

  /**
   * Todos los movimientos obtenidos de la API.
   */
  private todosLosMovimientos: MovimientoApi[] = [];

  transferencias: Transferencia[] = [];

  newIncome: {
    descripcion: string;
    fuente: FuenteIngreso;
    monto: number | null;
  } = {
    descripcion: '',
    fuente: '',
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
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimer));
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
   * Carga los movimientos y deja SOLO los ingresos.
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
        this.errorMessage = error.error?.error || 'No se pudo completar la operación.';
        this.changeDetector.markForCheck();
        console.error(
          'ERROR AL CARGAR INGRESOS:',
          error
        );
      }
    });
  }

  /**
   * Actualiza la pantalla desde el estado compartido y conserva
   * solamente los movimientos marcados como ingreso.
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
        movimiento => movimiento.tipo === 'ingreso'
      )
      .map(
        movimiento => this.normalizarIngreso(movimiento)
      );

    this.changeDetector.markForCheck();
  }

  /**
   * Convierte el movimiento de la API
   * al formato que utiliza esta vista.
   */
  private normalizarIngreso(
    movimiento: MovimientoApi
  ): Movimiento {

    return {
      id: movimiento.id,

      fecha: new Date(
        movimiento.fecha
      ).toLocaleDateString('es-GT'),

      descripcion: movimiento.descripcion,

      fuente: movimiento.categoria,

      monto: Number(movimiento.monto)
    };
  }

  /**
   * Total de ingresos.
   */
  get totalIngreso(): number {

    return this.movimientos.reduce(
      (total, movimiento) =>
        total + movimiento.monto,
      0
    );
  }

  /** Dinero disponible después de gastos, pagos y transferencias. */
  get saldoDisponible(): number {

    const salidas = this.todosLosMovimientos
      .filter(movimiento => movimiento.tipo === 'egreso')
      .reduce(
        (total, movimiento) => total + Number(movimiento.monto),
        0
      );

    return this.totalIngreso - salidas;
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
   * Distribución de ingresos por fuente.
   */
  get categorias(): Array<{
    nombre: FuenteIngreso;
    porcentaje: number;
    color: string;
  }> {

    const total = this.totalIngreso;

    const fuentes = this.fuentesDisponibles;
    const colores = [
      '#1f9d66', '#2a6f8f', '#f2b84b', '#8b5cf6',
      '#f97316', '#0f4c42', '#ef4444', '#64748b'
    ];

    return fuentes.map((nombre, index) => {

      const monto = this.movimientos
        .filter(
          movimiento =>
            movimiento.fuente === nombre
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

  get fuentesDisponibles(): string[] {

    return Array.from(
      new Set(
        this.movimientos.map(
          movimiento => movimiento.fuente
        )
      )
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }

  /**
   * Filtro de búsqueda y fuente.
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
          !this.sourceFilter ||
          movimiento.fuente === this.sourceFilter
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
    fuente: FuenteIngreso
  ): string {

    const clase = fuente
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return ['salario', 'freelance', 'otros'].includes(clase)
      ? `tag-${clase}`
      : 'tag-otros';
  }

  openIncomeModal(): void {
    this.errores = {};
    this.errorMessage = '';
    this.successMessage = '';
    this.showIncomeModal = true;
  }

  cerrarSesion(): void {
    this.authService.logout();
  }

  closeIncomeModal(): void {
    this.errores = {};
    this.errorMessage = '';
    this.successMessage = '';

    this.showIncomeModal = false;

    this.newIncome = {
      descripcion: '',
      fuente: '',
      monto: null
    };
  }

  /**
   * GUARDA UN INGRESO.
   */
  submitIncome(): void {
    this.successMessage = '';
    if (this.saving) return;
    this.errorMessage = '';

    const monto = this.newIncome.monto;

    this.errores = {};
    if (!this.newIncome.descripcion.trim()) this.errores['descripcion'] = 'La descripción es obligatoria.';
    if (!this.newIncome.fuente.trim()) this.errores['fuente'] = 'Escribe una fuente.';
    if (!monto || !Number.isFinite(Number(monto)) || monto <= 0) {
      this.errores['monto'] = 'Ingresa un monto válido mayor a 0.';
    }
    if (Object.keys(this.errores).length > 0) return;

    const nuevoIngreso = {
      fecha: new Date().toISOString(),

      descripcion:
        this.newIncome.descripcion.trim(),

      categoria:
        this.newIncome.fuente.trim(),

      /**
       * MUY IMPORTANTE:
       * este movimiento es un INGRESO.
       */
      tipo: 'ingreso' as const,

      monto: Number(monto)
    };

    console.log(
      'ENVIANDO INGRESO:',
      nuevoIngreso
    );

    this.saving = true;
    this.movimientosService
      .crear(nuevoIngreso)
      .subscribe({

        next: movimiento => {
          this.saving = false;

          console.log(
            'INGRESO GUARDADO:',
            movimiento
          );

          // El servicio publica el nuevo movimiento en movimientos$.
          this.newIncome = { descripcion: '', fuente: '', monto: null };
          this.mostrarExito('Movimiento agregado exitosamente');
          this.changeDetector.markForCheck();
        },

        error: error => {
        this.saving = false;
        this.errorMessage = error.error?.error || 'No se pudo completar la operación.';
        this.changeDetector.markForCheck();

          console.error(
            'ERROR AL GUARDAR INGRESO:',
            error
          );
        }
      });
  }

  /**
   * Elimina un ingreso.
   */
  eliminarMovimiento(
    movimiento: Movimiento
  ): void {

    this.movimientosService
      .eliminar(movimiento.id)
      .subscribe({

        // El servicio actualiza movimientos$ al completar la eliminación.
        next: () => this.mostrarExito('Movimiento eliminado'),

        error: error => {
        this.saving = false;
        this.errorMessage = error.error?.error || 'No se pudo completar la operación.';
        this.changeDetector.markForCheck();

          console.error(
            'ERROR AL ELIMINAR INGRESO:',
            error
          );
        }
      });
  }

  openTransferModal(): void {
    this.errores = {};
    this.errorMessage = '';
    this.successMessage = '';
    this.showTransferModal = true;
  }

  closeTransferModal(): void {
    this.errores = {};
    this.errorMessage = '';
    this.successMessage = '';

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
    this.successMessage = '';
    if (this.saving) return;
    this.errorMessage = '';

    const monto =
      this.newTransfer.monto;

    this.errores = {};
    if (!this.newTransfer.nombre.trim()) this.errores['nombre'] = 'Escribe el destinatario o servicio.';
    if (!monto || !Number.isFinite(Number(monto)) || monto <= 0) {
      this.errores['monto'] = 'Ingresa un monto válido mayor a 0.';
    }
    if (Object.keys(this.errores).length > 0) return;

    if (Math.round(Number(monto) * 100) > Math.round(this.saldoDisponible * 100)) {
      this.errorMessage = `Saldo insuficiente. Disponible: Q ${this.saldoDisponible.toFixed(2)}.`;
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
          this.newTransfer = { nombre: '', monto: null, nota: '' };
          this.mostrarExito('Pago o transferencia registrado exitosamente');
          this.changeDetector.markForCheck();
        },
        error: error => {
        this.saving = false;
        this.errorMessage = error.error?.error || 'No se pudo completar la operación.';
        this.changeDetector.markForCheck();
          console.error('ERROR AL GUARDAR TRANSFERENCIA:', error);
        }
      });
  }
}
