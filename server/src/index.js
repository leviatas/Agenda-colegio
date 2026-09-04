require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const { router: eventosRoutes } = require('./routes/eventos');
const oficialRoutes = require('./routes/oficial');
const usuariosRoutes = require('./routes/usuarios');
const telemetriaRoutes = require('./routes/telemetria');
const metricasRoutes = require('./routes/metricas');

// Fallar temprano y con un mensaje claro: sin estas dos variables la app
// arranca igual y recién falla en el primer login, que es mucho peor de
// diagnosticar.
if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en las variables de entorno. Revisá server/.env');
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_ID) {
  console.error('Falta GOOGLE_CLIENT_ID en las variables de entorno. Revisá server/.env');
  process.exit(1);
}

const app = express();

// En Docker el cliente le pega a nginx y nginx reenvía acá adentro: sin esto
// `req.ip` sería siempre la IP interna del contenedor de nginx, no la del
// navegador real, y /metricas quedaría inútil. Un único salto confiable (el
// propio nginx del compose), no una lista de proxies externos.
app.set('trust proxy', 1);

// Un solo origen, no un wildcard. Tiene que coincidir EXACTO con la URL desde
// la que el browser carga el cliente (en Docker, CLIENT_ORIGIN del .env).
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Lo usa el HEALTHCHECK del Dockerfile.
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/oficial', oficialRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/telemetria', telemetriaRoutes);
app.use('/api/metricas', metricasRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
