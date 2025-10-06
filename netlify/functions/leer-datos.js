// RUTA: netlify/functions/leer-datos.js

const { google } = require('googleapis');

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
    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD Y LÓGICA MEJORADA ---

    // 1. Verificamos que un usuario haya iniciado sesión.
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Acceso no autorizado. Debes iniciar sesión.' }) };
    }

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            // Leemos todas las columnas necesarias para una solicitud completa
            range: 'SOLICITUDES!A:H', 
        });

        const allRows = response.data.values || [];
        if (allRows.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) }; // No hay datos, devuelve un array vacío
        }

        const headers = allRows.shift(); // Saca la fila de encabezados
        
        // 2. Filtramos los datos en el backend por seguridad y eficiencia.
        //    Esto asegura que cada usuario SOLO reciba sus propias solicitudes.
        //    Asumimos que el email está en la 3ra columna (índice 2).
        const userRows = allRows.filter(row => row[2] && row[2].toLowerCase() === user.email.toLowerCase());

        // 3. Mapeamos los resultados a un formato JSON más limpio para el frontend.
        const result = userRows.map(row => ({
            id: row[0],
            timestamp: row[1],
            email: row[2],
            item: row[3],
            quantity: row[4],
            status: row[5],
            approver: row[6], // Opcional: quién aprobó
            approvalDate: row[7] // Opcional: cuándo se aprobó
        }));

        return { statusCode: 200, body: JSON.stringify(result) };

    } catch (error) {
        console.error('Error al leer los datos:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};