# Reglas de movimientos

- Saldo disponible = ingresos acumulados menos egresos acumulados. Los registros de ingreso se conservan como historial.
- Un gasto, pago o transferencia saliente se rechaza si supera el saldo disponible. La comprobación del servidor y el registro se realizan en una transacción, bloqueando las modificaciones simultáneas del mismo usuario.
- Las transferencias registran salidas de dinero; no ejecutan transferencias bancarias ni acreditan otra cuenta.
- No se puede eliminar un ingreso si eso deja sin cobertura los egresos registrados. Eliminar un egreso devuelve su importe al saldo.
- Se aceptan importes positivos con hasta dos decimales.
- El calendario permite hoy y fechas pasadas, y bloquea fechas futuras según America/Guatemala. Esta interpretación corresponde a «no ha llegado ese día»; el 4/1/2026 es anterior al 10/1/2026.
- «Gastos registrados» muestra los gastos distintos de pagos y transferencias. No representa una deuda que deba descontarse otra vez.

## Acceso con Google y contraseña

Puedes iniciar sesión con Google o con las credenciales de una cuenta local. El acceso con Google no crea ni cambia contraseñas locales. La aplicación no utiliza la contraseña de Gmail.

## Verificación

Desde `backend`: `node --import tsx --test src/controllers/movimientoRules.test.ts` y `node node_modules/typescript/bin/tsc --noEmit`.

Desde `front`: `node node_modules/@angular/cli/bin/ng.js test --watch=false --include=src/app/componentes/gastos/gastos.spec.ts` y `node node_modules/@angular/cli/bin/ng.js build --configuration development`.

Prueba manual con una cuenta de prueba: registra 1000 de ingreso, intenta gastar 2000 (rechazado), registra un gasto de 300 (saldo 700), transfiere 700 (saldo 0) e intenta otro gasto (rechazado). Intenta eliminar el ingreso de 1000 mientras existan esas salidas (rechazado).

La compilación de producción requiere revisar los límites de tamaño de CSS existentes. Las pruebas automatizadas no sustituyen verificar Google y PostgreSQL en el entorno configurado.
