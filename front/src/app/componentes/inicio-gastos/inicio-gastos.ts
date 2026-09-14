import {
  Component,
  ChangeDetectorRef,
  inject,
  OnInit
} from '@angular/core';

import {
  CommonModule,
  CurrencyPipe,
  DatePipe,
  DecimalPipe
} from '@angular/common';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth';

import {
  MovimientoApi,
  MovimientosService
} from '../../services/movimientos';

interface Movimiento {
  id: number;
  fecha: string;
  descripcion: string;
  categoria: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
}

@Component({
  selector: 'app-inicio-gastos',

  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    RouterLink
  ],

  templateUrl: './inicio-gastos.html',

  styleUrls: ['./inicio-gastos.css']
})
export class InicioGastos
  implements OnInit {

  private authService =
    inject(AuthService);

  private movimientosService =
    inject(MovimientosService);

  private changeDetector =
    inject(ChangeDetectorRef);

  get currentUser() {
    return this.authService
      .getCurrentUser();
  }

  saving = false;
  get fechaMaxima(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  menuAbierto = false;

  menuSeleccionado =
    'Mis gastos';

  opcionesMenu = [
    'Mis gastos',
    'Historial',
    'Configuración'
  ];

  mostrarFormulario = false;

  mostrarToast = false;

  mensajeToast = '';

  categorias = [

    {
      key: 'canasta',
      nombre: 'Canasta Básica'
    },

    {
      key: 'servicios',
      nombre: 'Servicios del Hogar'
    },

    {
      key: 'transporte',
      nombre: 'Transporte'
    },

    {
      key: 'ahorro',
      nombre: 'Ahorro'
    }

  ];

  nuevo: {

    descripcion: string;

    fecha: string;

    tipo: 'ingreso' | 'egreso';

    categoria: string;

    monto: number | null;

  } = {

    descripcion: '',

    fecha:
      this.fechaMaxima,

    tipo: 'egreso',

    categoria: '',

    monto: null

  };

  errores: {
    [key: string]: string
  } = {};

  categoriaSugerida:
    string | null = null;

  /**
   * Esta vista maneja ingresos y egresos.
   */
  movimientos: Movimiento[] = [];

  ngOnInit(): void {

    this.cargarMovimientos();
  }

  /**
   * Carga los movimientos desde PostgreSQL.
   *
   * Conserva ingresos y egresos para calcular el resumen
   * y mostrar todos los movimientos del inicio.
   */
  private cargarMovimientos(): void {

    this.movimientosService
      .obtener()
      .subscribe({

        next: movimientos => {

          this.movimientos =
            movimientos
              .map(
                movimiento =>
                  this.normalizarMovimiento(
                    movimiento
                  )
              );

          this.changeDetector.markForCheck();
        },

        error: error => {
          this.saving = false;

          console.error(
            'ERROR AL CARGAR GASTOS:',
            error
          );

          this.mostrarMensajeToast(
            'No se pudieron cargar los gastos'
          );
        }

      });
  }

  private normalizarMovimiento(
    movimiento: MovimientoApi
  ): Movimiento {

    return {

      id: movimiento.id,

      fecha: movimiento.fecha,

      descripcion:
        movimiento.descripcion,

      categoria:
        movimiento.categoria,

      tipo:
        movimiento.tipo,

      monto:
        Number(movimiento.monto)

    };
  }

  esAdmin(): boolean {

    return this.authService
      .isAdmin();
  }

  cerrarSesion(): void {

    this.authService.logout();
  }

  /**
   * Total de ingresos.
   *
   */
  get totalIngresos(): number {

    return this.movimientos
      .filter(
        m => m.tipo === 'ingreso'
      )
      .reduce(
        (acc, m) => acc + m.monto,
        0
      );
  }

  /**
   * Total de gastos.
   */
  get totalEgresos(): number {

    return this.movimientos

      .filter(
        m => m.tipo === 'egreso'
      )

      .reduce(
        (acc, m) =>
          acc + m.monto,
        0
      );
  }

  /**
   * Saldo.
   *
   * Por ahora se calculará únicamente
   * cuando hagamos que InicioGastos
   * tenga acceso a ingresos + egresos.
   */
  get saldoRestante(): number {

    return this.totalIngresos -
      this.totalEgresos;
  }

  /**
   * Egresos que todavía se consideran pendientes de pago.
   * Un pago o una transferencia ya realizados descuentan del saldo activo,
   * pero no deben mostrarse como una deuda pendiente.
   */
  get saldoPorPagar(): number {

    return this.movimientos
      .filter(
        movimiento =>
          movimiento.tipo === 'egreso' &&
          !this.esPagoRealizado(movimiento)
      )
      .reduce(
        (total, movimiento) => total + movimiento.monto,
        0
      );
  }

  private esPagoRealizado(movimiento: Movimiento): boolean {

    const categoria = movimiento.categoria
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return categoria === 'pago' || categoria === 'transferencia';
  }

  gastoPorCategoria(
    key: string
  ): number {

    return this.movimientos

      .filter(
        m =>
          m.tipo === 'egreso' &&
          m.categoria === key
      )

      .reduce(
        (acc, m) =>
          acc + m.monto,
        0
      );
  }

  /**
   * Suma cualquier movimiento clasificado como Ahorro o Ahorros.
   * La comparación ignora mayúsculas, espacios y tildes.
   */
  get totalAhorros(): number {

    return this.movimientos
      .filter(
        movimiento => {
          const categoria = movimiento.categoria
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

          return categoria === 'ahorro' || categoria === 'ahorros';
        }
      )
      .reduce(
        (total, movimiento) => total + movimiento.monto,
        0
      );
  }

  porcentajeCategoria(
    key: string
  ): number {

    if (
      this.totalEgresos === 0
    ) {
      return 0;
    }

    return (
      this.gastoPorCategoria(key) /
      this.totalEgresos
    ) * 100;
  }

  get categoriasResumen(): Array<{
    key: string;
    nombre: string;
    monto: number;
    porcentaje: number;
    color: string;
  }> {

    const total = this.totalResumenGrafica;

    return [
      {
        key: 'ingresos',
        nombre: 'Ingresos',
        monto: this.totalIngresos,
        color: '#245d59'
      },
      {
        key: 'pagos',
        nombre: 'Pagos',
        monto: this.totalEgresos,
        color: '#7a8998'
      },
      {
        key: 'ahorros',
        nombre: 'Ahorros',
        monto: this.totalAhorros,
        color: '#79b39e'
      }
    ]
      .filter(categoria => categoria.monto > 0)
      .map(categoria => ({
        ...categoria,
        porcentaje: total
          ? (categoria.monto / total) * 100
          : 0
      }));
  }

  get totalResumenGrafica(): number {

    return this.totalIngresos +
      this.totalEgresos +
      this.totalAhorros;
  }

  get conicGradientStyle(): string {

    const total =
      this.totalResumenGrafica;

    if (total === 0) {

      return 'conic-gradient(#e5e7eb 0% 100%)';
    }

    let acumulado = 0;

    const tramos =
      this.categoriasResumen

        .map(cat => {

          const porc = cat.porcentaje;

          if (porc === 0) {
            return null;
          }

          const inicio =
            acumulado;

          acumulado += porc;

          return `${cat.color} ${inicio}% ${acumulado}%`;

        })

        .filter(
          t => t !== null
        );

    return `conic-gradient(${tramos.join(', ')})`;
  }

  claseEtiquetaGrafica(index: number, total: number): string {

    if (total === 1) {
      return 'q1';
    }

    if (total === 2) {
      return index === 0 ? 'q1' : 'q3';
    }

    return `q${(index % 4) + 1}`;
  }

  nombreCategoria(
    key: string
  ): string {

    if (key === 'ingreso') {
      return 'Ingreso';
    }

    const encontrada =
      this.categorias.find(
        c => c.key === key
      );

    return encontrada
      ? encontrada.nombre
      : key;
  }

  abrirFormulario(): void {
    this.mostrarToast = false;

    this.nuevo = {

      descripcion: '',

      fecha:
        this.fechaMaxima,

      tipo: 'egreso',

      categoria: '',

      monto: null

    };

    this.errores = {};

    this.categoriaSugerida = null;

    this.mostrarFormulario = true;
  }

  seleccionarTipo(
    tipo: 'ingreso' | 'egreso'
  ): void {

    this.nuevo.tipo = tipo;

    this.nuevo.categoria = '';

    this.categoriaSugerida = null;
  }

  cerrarFormulario(): void {
    this.mostrarToast = false;

    this.mostrarFormulario = false;
  }

  sugerirCategoria(): void {

    const desc =
      this.nuevo.descripcion
        .toLowerCase();

    if (
      desc.includes('luz') ||
      desc.includes('agua') ||
      desc.includes('internet')
    ) {

      this.categoriaSugerida =
        'servicios';

    } else if (
      desc.includes('super') ||
      desc.includes('comida') ||
      desc.includes('mercado')
    ) {

      this.categoriaSugerida =
        'canasta';

    } else if (
      desc.includes('gasolina') ||
      desc.includes('uber') ||
      desc.includes('bus')
    ) {

      this.categoriaSugerida =
        'transporte';

    } else {

      this.categoriaSugerida = null;
    }

    if (
      this.categoriaSugerida &&
      this.nuevo.tipo === 'egreso'
    ) {

      this.nuevo.categoria =
        this.categoriaSugerida;
    }
  }

  /**
   * Guarda el tipo de movimiento seleccionado en el formulario.
   */
  guardarMovimiento(): void {
    this.mostrarToast = false;
    if (this.saving) return;

    this.errores = {};

    if (
      !this.nuevo.descripcion.trim()
    ) {

      this.errores['descripcion'] =
        'La descripción es obligatoria.';
    }

    if (!this.nuevo.fecha) {

      this.errores['fecha'] =
        'Selecciona una fecha.';
    }

    if (this.nuevo.fecha > this.fechaMaxima) this.errores['fecha'] = 'No puedes registrar movimientos en fechas futuras.';
    if (this.nuevo.tipo === 'egreso' && Math.round(Number(this.nuevo.monto) * 100) > Math.round(this.saldoRestante * 100)) {
      this.errores['monto'] = 'Saldo insuficiente. Disponible: Q ' + this.saldoRestante.toFixed(2);
    }
    if (!this.nuevo.categoria.trim()) {

      this.errores['categoria'] =
        'Escribe una categoría.';
    }

    if (
      this.nuevo.monto === null || !Number.isFinite(Number(this.nuevo.monto)) ||
      this.nuevo.monto <= 0
    ) {

      this.errores['monto'] =
        'Ingresa un monto válido mayor a 0.';
    }

    if (
      Object.keys(this.errores).length > 0
    ) {

      return;
    }

    const nuevoMovimiento = {

      fecha:
        this.nuevo.fecha,

      descripcion:
        this.nuevo.descripcion.trim(),

      categoria:
        this.nuevo.categoria.trim(),

      tipo: this.nuevo.tipo,

      monto:
        Number(this.nuevo.monto)

    };

    console.log(
      'ENVIANDO GASTO:',
      nuevoMovimiento
    );

    this.saving = true;
    this.movimientosService
      .crear(nuevoMovimiento)
      .subscribe({

        next: movimiento => {
          this.saving = false;

          console.log(
            'GASTO GUARDADO:',
            movimiento
          );

          this.movimientos.unshift(
            this.normalizarMovimiento(
              movimiento
            )
          );

          this.abrirFormulario();

          this.mostrarMensajeToast(
            'Movimiento agregado exitosamente'
          );

          this.changeDetector.markForCheck();
        },

        error: error => {
          this.saving = false;

          console.error(
            'ERROR AL GUARDAR GASTO:',
            error
          );

          this.mostrarMensajeToast(
            error.error?.error || 'No se pudo guardar el movimiento'
          );
        }

      });
  }

  eliminarMovimiento(
    id: number
  ): void {

    this.movimientosService
      .eliminar(id)
      .subscribe({

        next: () => {

          this.movimientos =
            this.movimientos.filter(
              m => m.id !== id
            );

          this.mostrarMensajeToast(
            'Movimiento eliminado'
          );

          this.changeDetector.markForCheck();
        },

        error: error => {
          this.saving = false;

          console.error(
            'ERROR AL ELIMINAR:',
            error
          );

          this.mostrarMensajeToast(
            error.error?.error || 'No se pudo eliminar el movimiento'
          );
        }

      });
  }

  mostrarMensajeToast(
    msg: string
  ): void {

    this.mensajeToast = msg;

    this.mostrarToast = true;

    this.changeDetector.markForCheck();

    setTimeout(() => {

      this.mostrarToast = false;

      this.changeDetector.markForCheck();

    }, 3000);
  }
}
