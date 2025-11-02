// RUTA: netlify/functions/leer-datos.js

const { google } = require('googleapis');
// NUEVO: Importamos el envoltorio de autenticación 'withAuth'
// ANTIGUO: Ya no importamos 'getUserRole' directamente aquí.
const { withAuth } = require('./auth');

const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        // Esta función solo lee, así que 'readonly' es correcto y seguro.
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
};

// MODIFICADO: Envolvemos la función con 'withAuth'
exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---
    // Ya no se valida la 'x-api-key'.
    // 'withAuth' maneja toda la autenticación y validación del token.

    try {
        // --- INICIO DE LA LÓGICA DE AUTENTICACIÓN MEJORADA ---
        
        // Obtenemos el email y rol desde 'event.auth' (inyectado por withAuth)
        // Esto soluciona la Falla S-1 (Suplantación)
        const userEmail = event.auth.email;
        const userRole = event.auth.role;
        
        // 'withAuth' ya se aseguró de que el usuario y el rol existan.
        
        // --- FIN DE LA LÓGICA DE AUTENTICACIÓN ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'SOLICITUDES!A:H', 
        });

        const allRows = response.data.values || [];
        if (allRows.length > 1) { 
            allRows.shift(); // Saca la fila de encabezados
        } else {
            return { statusCode: 200, body: JSON.stringify([]) }; // No hay datos
        }

        // LÓGICA DE FILTRADO (Sin cambios, pero ahora es SEGURA)
        let filteredRows;
        if (userRole === 'admin') {
            // Si es admin, devuelve TODAS las solicitudes.
            filteredRows = allRows;
        } else {
            // Si es usuario regular, filtra solo sus propias solicitudes.
            // 'userEmail' ahora es confiable (viene del token).
            filteredRows = allRows.filter(row => row && row[2] && row[2].toLowerCase() === userEmail.toLowerCase());
        }

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
});