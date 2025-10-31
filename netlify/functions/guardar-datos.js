// RUTA: netlify/functions/guardar-datos.js

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
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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

    // NOTA: El email del usuario debe ser enviado por el frontend en el cuerpo de la solicitud
    const userEmail = item.userEmail;
    if (!userEmail) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) };
    }

    // --- CORRECCIÓN 1: Validar que el usuario exista, sin importar el rol ---
    const userRole = await getUserRole(userEmail);
    if (!userRole) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Usuario no válido.' }) };
    }
    
    // --- CORRECCIÓN 2: Usar 'item' en lugar de 'newRow' ---
    // Validamos que los datos esenciales estén presentes
    if (!item.id || !item.timestamp || !item.email || !item.item || !item.quantity) {
         return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos en la solicitud.' }) };
    }
    
    // --- INICIO DE LA MODIFICACIÓN 6 ---
// AÑADIR esta validación de cantidad
    
    const quantity = parseInt(item.quantity);
    if (isNaN(quantity) || quantity <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'La cantidad debe ser un número mayor a cero.' }) };
    }
// --- FIN DE LA MODIFICACIÓN 6 ---

    // --- CORRECCIÓN 3: Usar 'userEmail' y el email del payload ('item.email') ---
    // Verificamos que el email de la solicitud coincida con el del usuario autenticado
    if (item.email.toLowerCase() !== userEmail.toLowerCase()) {
        return { statusCode: 403, body: JSON.stringify({ error: 'No puedes crear solicitudes para otro usuario.' }) };
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'SOLICITUDES!A1',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [
                // --- CORRECCIÓN 4: Usar 'item' para guardar los datos ---
                [item.id, item.timestamp, item.email, item.item, quantity, 'Pendiente']
            ],
        },
    });

    return { statusCode: 200, body: JSON.stringify({ message: 'Datos guardados exitosamente.' }) };
    
} catch (error) {
    console.error('Error al procesar la solicitud:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
}
};