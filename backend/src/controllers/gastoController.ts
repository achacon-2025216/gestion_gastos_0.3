import { MovimientoError, centavos, fechaMovimiento, comprobarSaldo } from './movimientoRules.js';
import type { Response } from 'express';
import { PrismaClient } from '../../prisma/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import type { AuthRequest } from '../middlewares/authMiddleware.js';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:admin@localhost:5432/gestion_gastos?schema=public" 
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const getMovimientos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    
    const movimientos = await (prisma as any).gasto.findMany({
      where: { userId: Number(usuarioId) },
      orderBy: { fecha: 'desc' }
    });

    res.json(movimientos);
  } catch (error: any) {
    if (error instanceof MovimientoError) { res.status(error.status).json({ error: error.message }); return; }
    console.error("ERROR AL OBTENER MOVIMIENTOS:", error);
    res.status(500).json({ error: 'Error al obtener los movimientos' });
  }
};

export const crearMovimiento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.user?.id;
    const { descripcion, categoria, tipo, monto, fecha } = req.body;

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    if (typeof descripcion !== 'string' || !descripcion.trim() || typeof categoria !== 'string' || !categoria.trim() || !['ingreso', 'egreso'].includes(tipo) || Number(monto) <= 0) {
      res.status(400).json({ error: 'Datos de movimiento inválidos' });
      return;
    }

    const importe = centavos(monto);
    const fechaValidada = fechaMovimiento(fecha);
    const movimiento = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${Number(usuarioId)} FOR UPDATE`;
      const movimientos = await tx.gasto.findMany({ where: { userId: Number(usuarioId) } });
      const saldo = movimientos.reduce((total, m) => total + (m.tipo === 'ingreso' ? 1 : -1) * Math.round(Number(m.monto) * 100), 0);
      if (tipo === 'egreso') comprobarSaldo(saldo, importe);
      return tx.gasto.create({ data: {
        descripcion: descripcion.trim(), categoria: categoria.trim(), tipo,
        monto: importe / 100, fecha: fechaValidada, userId: Number(usuarioId)
      } });
    });

    res.status(201).json(movimiento);
  } catch (error: any) {
    if (error instanceof MovimientoError) { res.status(error.status).json({ error: error.message }); return; }
    console.error('ERROR AL CREAR MOVIMIENTO:', error);
    res.status(500).json({ error: 'Error al crear el movimiento' });
  }
};

export const eliminarMovimiento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.user?.id;
    const movimientoId = Number(req.params.id);

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    if (!Number.isSafeInteger(movimientoId) || movimientoId <= 0) throw new MovimientoError('Identificador inválido.');
    await prisma.$transaction(async tx => {
      // El mismo bloqueo protege creaciones y eliminaciones simultáneas.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${Number(usuarioId)} FOR UPDATE`;
      const movimientos = await tx.gasto.findMany({ where: { userId: Number(usuarioId) } });
      const movimiento = movimientos.find(m => m.id === movimientoId);
      if (!movimiento) throw new MovimientoError('Movimiento no encontrado', 404);
      if (movimiento.tipo === 'ingreso') {
        const saldo = movimientos.reduce((total, m) => total + (m.tipo === 'ingreso' ? 1 : -1) * Math.round(Number(m.monto) * 100), 0);
        if (Math.round(Number(movimiento.monto) * 100) > saldo) {
          throw new MovimientoError('No puedes eliminar este ingreso porque su dinero ya cubre egresos registrados.', 409);
        }
      }
      await tx.gasto.delete({ where: { id: movimientoId } });
    });
    res.status(204).send();
  } catch (error: any) {
    if (error instanceof MovimientoError) { res.status(error.status).json({ error: error.message }); return; }
    console.error('ERROR AL ELIMINAR MOVIMIENTO:', error);
    res.status(500).json({ error: 'Error al eliminar el movimiento' });
  }
};
