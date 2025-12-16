// RUTA: netlify/functions/utils/google-client.js

const { google } = require('googleapis');

// Configuración única de autenticación
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        // Incluimos ambos scopes (Lectura/Escritura y Solo Lectura) para que sirva para todo
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

/**
 * Devuelve una instancia del cliente de Sheets lista para usar.
 * @returns {object} Cliente de Google Sheets (v4)
 */
const getSheetsClient = () => {
    const auth = getAuth();
    return google.sheets({ version: 'v4', auth });
};

module.exports = { getSheetsClient };