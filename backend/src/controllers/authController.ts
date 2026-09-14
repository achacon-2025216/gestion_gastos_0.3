import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/generated/prisma/index.js';
import pg from 'pg';
import { verifyToken, type AuthRequest } from '../middlewares/authMiddleware.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:admin@localhost:5432/gestion_gastos?schema=public"
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const router: Router = Router();
const JWT_SECRET: string = process.env.JWT_SECRET || 'cambia_esto_en_produccion';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '463867676917-g8hga9ugqt9um24hpkoakrhlrt7jjhbs.apps.googleusercontent.com';
const TOKEN_EXPIRATION = '2m';

const createToken = (user: { id: number; username: string; email?: string | null; role: string }) => {
  const displaySource = user.username.startsWith('google_')
    ? user.email || 'Usuario Google'
    : user.username;
  const displayName = displaySource.includes('@')
    ? displaySource.split('@')[0]
    : displaySource;

  return jwt.sign(
    { id: user.id, username: displayName, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRATION }
  );
};

// POST /api/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!username || !email || typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'El usuario, correo y contraseña son obligatorios' });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
      return;
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      res.status(400).json({ error: 'El correo electrónico ya está registrado' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: 'user'
      }
    });

    const token = createToken(newUser);

    res.status(201).json({
      message: '¡Usuario registrado con éxito!',
      token,
      user: { id: newUser.id, username: newUser.username, role: newUser.role }
    });
  } catch (error: any) {
    console.error('ERROR EN REGISTRO:', error);
    res.status(500).json({ error: 'Error interno al registrar el usuario' });
  }
});

// POST /api/login (Token configurado a 2 minutos)
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';

    if (!username || typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'Faltan credenciales' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email: username.toLowerCase() }
        ]
      }
    });

    if (!user) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }

    // Token generado con 'id' y duración de 2 minutos
    const token = createToken(user);

    res.json({
      message: 'Login exitoso',
      token,
      role: user.role,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error: any) {
    console.error('ERROR EN LOGIN:', error);
    res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
});

// POST /api/google-login
router.post('/google-login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token: googleToken } = req.body;
    if (!googleToken) {
      res.status(400).json({ error: 'Token de Google no proporcionado' });
      return;
    }

    const googleResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleToken)}`
    );
    if (!googleResponse.ok) {
      res.status(401).json({ error: 'Token de Google inválido o expirado' });
      return;
    }

    const profile = await googleResponse.json() as {
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: string;
    };
    if (profile.aud !== GOOGLE_CLIENT_ID || !profile.sub || !profile.email || profile.email_verified !== 'true') {
      res.status(401).json({ error: 'La credencial de Google no es válida para esta aplicación' });
      return;
    }

    const databaseUsername = `google_${profile.sub}`;
    let user = await prisma.user.findUnique({ where: { username: databaseUsername } });

    // Si el correo verificado de Google ya pertenece a una cuenta local,
    // usamos esa misma cuenta para evitar usuarios y correos duplicados.
    if (profile.email) {
      const userWithSameEmail = await prisma.user.findUnique({
        where: { email: profile.email.toLowerCase() }
      });
      if (userWithSameEmail) {
        user = userWithSameEmail;
      }
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          username: databaseUsername,
          email: profile.email!.toLowerCase(),
          password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
          role: 'user'
        }
      });
    } else if (profile.email && !user.email && user.username === databaseUsername) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { email: profile.email }
      });
    }

    const token = createToken(user);
    res.json({
      message: 'Acceso con Google exitoso',
      token,
      user: { id: user.id, username: profile.email || user.username, role: user.role }
    });
  } catch (error) {
    console.error('ERROR EN GOOGLE LOGIN:', error);
    res.status(500).json({ error: 'Error interno al iniciar sesión con Google' });
  }
});

// Renueva la sesión por 2 minutos más cuando el usuario sigue activo.
router.post('/refresh-token', verifyToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Sesión inválida' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(401).json({ error: 'El usuario ya no existe' });
      return;
    }

    res.json({ token: createToken(user) });
  } catch (error) {
    console.error('ERROR AL RENOVAR TOKEN:', error);
    res.status(500).json({ error: 'No se pudo renovar la sesión' });
  }
});

export default router;
