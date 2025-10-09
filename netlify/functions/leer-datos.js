// RUTA: netlify/functions/leer-datos.js

const { google } = require('googleapis');
// Importar auth.js (asumiendo que está en una ruta relativa)
const { getUserRole } = require('./auth');

// Esta función auxiliar se mantiene igual
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
};

exports.handler = async (event, context) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD (API KEY + GSHEETS ROLE) ---

    // 1. Validar la Clave de API enviada en el Header 'x-api-key'
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }

try {
    const item = JSON.parse(event.body);

    const userEmail = item.userEmail;
    if (!userEmail) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) };
    }

    // 1. Validar que el usuario EXISTA, sin importar el rol.
    const userRole = await getUserRole(userEmail);
    if (!userRole) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Usuario no válido.' }) };
    }
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'SOLICITUDES!A:H', 
    });

    const allRows = response.data.values || [];
    if (allRows.length > 1) { // Si hay más que solo la cabecera
        allRows.shift(); // Saca la fila de encabezados
    } else {
        return { statusCode: 200, body: JSON.stringify([]) }; // No hay datos
    }

    // 2. LÓGICA DE FILTRADO CORREGIDA
    let filteredRows;
    if (userRole === 'admin') {
        // Si es admin, devuelve TODAS las solicitudes.
        filteredRows = allRows;
    } else {
        // Si es usuario regular, filtra solo sus propias solicitudes.
        // Se usa 'userEmail' en lugar del obsoleto 'user.email'.
        filteredRows = allRows.filter(row => row[2] && row[2].toLowerCase() === userEmail.toLowerCase());
    }

    // 3. Mapeo a JSON (sin cambios, ya era correcto)
    const result = filteredRows.map(row => ({
        id: row[0],
        timestamp: row[1],
        email: row[2],
        item: row[3],
        quantity: row[4],
        status: row[5],
        approver: row[6],
        approvalDate: row[7]
    }));

    return { statusCode: 200, body: JSON.stringify(result) };

} catch (error) {
    console.error('Error al leer los datos:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
}
};